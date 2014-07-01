var app = require('express')();
app.get('/', function(request, response){
	response.redirect('http://p3lim.github.io/ps2-alerts');
});

var http = require('http');
var server = http.createServer(app);
server.listen(process.env.PORT || 5000);

var WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;

var wss = new WebSocketServer({server: server});
wss.on('connection', function(socket){
	socket.send(JSON.stringify({worlds: worlds}));
});

wss.broadcast = function(data){
	for(var index = 1; index <= this.clients.length; index++)
		this.clients[index - 1].send(JSON.stringify(data));
};

var worlds = {
	1: {alert: {}, details: {1: [], 2: [], 3: []}},  // Connery
	9: {alert: {}, details: {1: [], 2: [], 3: []}},  // Woodman
	10: {alert: {}, details: {1: [], 2: [], 3: []}}, // Miller
	11: {alert: {}, details: {1: [], 2: [], 3: []}}, // Ceres
	13: {alert: {}, details: {1: [], 2: [], 3: []}}, // Cobalt
	17: {alert: {}, details: {1: [], 2: [], 3: []}}, // Emerald
	25: {alert: {}, details: {1: [], 2: [], 3: []}}  // Briggs
};

var alerts = {
	1: {zone: 2, type: 0},
	2: {zone: 8, type: 0},
	3: {zone: 6, type: 0},

	7: {zone: 6, type: 1},
	8: {zone: 6, type: 2},
	9: {zone: 6, type: 3},

	10: {zone: 2, type: 1},
	11: {zone: 2, type: 2},
	12: {zone: 2, type: 3},

	13: {zone: 8, type: 1},
	14: {zone: 8, type: 3}
};

var facilityData = {
	1: {2: [2103, 2104, 2106], 6: [6102, 6113, 6123], 8: [18022, 18026, 18028]},
	2: {2: [2101, 2102, 2108], 6: [6103, 6112, 6122], 8: [18025]},
	3: {2: [2105, 2107, 2109], 6: [6101, 6111, 6121], 8: [18023, 18024, 18027]}
};

var query = function(params, callback){
	http.get('http://census.soe.com/s:ps2alerts/get/ps2:v2/' + params, function(response){
		if(response.statusCode != 200)
			callback({error: {statusCode: response.statusCode, headers: response.headers}}, true);
		else {
			var result = '';
			response.on('data', function(chunk){
				result += chunk;
			});

			response.on('end', function(){
				callback(JSON.parse(result));
			});
		}
	}).on('error', function(e){
		callback({error: e.message}, true);
	});
};

var queryDetails = function(id, zone, callback, finalize){
	query('map?world_id=' + id + '&zone_ids=' + zone, function(result, error){
		if(error){
			wss.broadcast(result);
		} else {
			if(result.map_list && result.map_list[0]){
				var rows = result.map_list[0].Regions.Row;
				for(var index = 0; index < rows.length; index++)
					callback(rows[index].RowData);

				if(finalize)
					finalize();
			}
		}
	});
};

var updateAlertDetails = function(id, alert){
	var details = worlds[id].details;

	for(var array in details)
		details[array].length = 0;

	if(!alert.type){
		var temp = {1: [], 2: [], 3: []};
		queryDetails(id, alert.zone, function(row){
			temp[+row.FactionId].push(+row.RegionId);
		}, function(){
			var total = temp[1].length + temp[2].length + temp[3].length;
			details[1].push((temp[1].length / total) * 100);
			details[2].push((temp[2].length / total) * 100);
			details[3].push((temp[3].length / total) * 100);

			wss.broadcast({details: details, id: id});
		});
	} else {
		var facilities = facilityData[alert.type][alert.zone];
		queryDetails(id, alert.zone, function(row){
			var facility = facilities[+row.RegionId];
			if(facility)
				details[+row.FactionId].push(facility);
		}, function(){
			wss.broadcast({details: details, id: id});
		});
	}
};

var updateAlerts = function(data){
	var id = +data.world_id;
	var alert = worlds[id].alert;

	var state = +data.metagame_event_state;
	if(state == 135 || state == 136){
		var details = alerts[+data.metagame_event_id];
		alert.active = true;
		alert.type = details.type;
		alert.zone = details.zone;
		alert.start = +(data.timestamp + '000');
		alert.duration = (+data.metagame_event_id > 6) ? 1 : 2;

		updateAlertDetails(id, alert);
	} else {
		for(var member in alert)
			delete alert[member];

		alert.active = false;
	};

	wss.broadcast({alert: alert, id: id});
};

var pollAlerts = function(id){
	query('world_event?type=METAGAME&world_id=' + id, function(result, error){
		if(!error)
			updateAlerts(result.world_event_list[0]);
		else
			wss.broadcast(result);
	});
};

var updateWorldState = function(init){
	query('world?c:limit=100', function(result, error){
		if(!error){
			for(var index = 0; index < result.world_list.length; index++){
				var data = result.world_list[index];
				var id = +data.world_id;

				var world = worlds[id];
				if(world){
					if(data.state != world.state){
						world.state = data.state;

						wss.broadcast({state: data.state, id: id});
					};

					if(data.state == 'online' && init)
						pollAlerts(id);
				}
			}
		} else {
			wss.broadcast(result);
		}
	});
};

updateWorldState(true);

var ws = new WebSocket('wss://push.planetside2.com/streaming?service-id=s:ps2alerts');

ws.on('message', function(data){
	var payload = JSON.parse(data).payload;
	if(!payload)
		return;

	if(payload.event_name == 'MetagameEvent')
		updateAlerts(payload);
});
