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

setInterval(function(){
	for(var index = 1; index <= wss.clients.length; index++)
		wss.clients[index - 1].send('ping');
}, 30000);

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
	1: {zone: 2, type: 0},  // Indar Territory
	2: {zone: 8, type: 0},  // Esamir Territory
	3: {zone: 6, type: 0},  // Amerish Territory

	7: {zone: 6, type: 3},  // Amerish Biolab
	8: {zone: 6, type: 4},  // Amerish Tech Plant
	9: {zone: 6, type: 2},  // Amerish Amp Station

	10: {zone: 2, type: 3}, // Indar Biolab
	11: {zone: 2, type: 4}, // Indar Tech Plant
	12: {zone: 2, type: 2}, // Indar Amp Station

	13: {zone: 8, type: 3}, // Esamir Biolab
	14: {zone: 8, type: 2}  // Esamir Amp Station
};

var warpgates = [
	1000, 1001, 1002, 1003, 1004, 1005, 2201, 2202, 2203, // Indar
	6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, // Amerish
	18029, 18030, 18031, 18039, 18040, 18041, 18042, 18043, 18044, // Esamir
];

var facilities = {
	2: {2: [2105, 2107, 2109], 6: [6101, 6111, 6121], 8: [18023, 18024, 18027]},
	3: {2: [2103, 2104, 2106], 6: [6102, 6113, 6123], 8: [18022, 18026, 18028]},
	4: {2: [2101, 2102, 2108], 6: [6103, 6112, 6122], 8: [18025]}
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

var updateAlertDetails = function(id, alert){
	var details = worlds[id].details;

	query('map?zone_ids=' + alert.zone + '&world_id=' + id, function(result, error){
		if(!error){
			for(var array in details)
				details[array].length = 0;

			var rows = result.map_list[0].Regions.Row;
			if(!alert.type){
				for(var index = 0; index < rows.length; index++){
					var row = rows[index].RowData;
					if(warpgates.indexOf(+row.RegionId) == -1)
						details[+row.FactionId].push(+row.RegionId);
				}
			} else {
				for(var index = 0; index < rows.length; index++){
					var row = rows[index].RowData;
					if(facilities[alert.type][alert.zone].indexOf(+row.RegionId) != -1)
						details[+row.FactionId].push(+row.RegionId);
				}
			}

			wss.broadcast({details: details, id: id});
		} else
			wss.broadcast(result);
	});
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
