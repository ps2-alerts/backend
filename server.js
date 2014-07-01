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
	1: {name: 'Connery'},
	9: {name: 'Woodman'},
	10: {name: 'Miller'},
	11: {name: 'Ceres'},
	13: {name: 'Cobalt'},
	17: {name: 'Emerald'},
	25: {name: 'Briggs'}
};

for(var index in worlds){
	var world = worlds[index];
	world.id = index;
	world.state = '';
	world.active = false;
	world.alert = {};
};

var alerts = {
	1: {zone: 2, type: 0},
	2: {zone: 8, type: 0},
	3: {zone: 6, type: 0},

	4: {zone: 0, type: 1},
	5: {zone: 0, type: 2},
	6: {zone: 0, type: 3},

	7: {zone: 6, type: 1},
	8: {zone: 6, type: 2},
	9: {zone: 6, type: 3},

	10: {zone: 2, type: 1},
	11: {zone: 2, type: 2},
	12: {zone: 2, type: 3},

	13: {zone: 8, type: 1},
	14: {zone: 8, type: 3}
};

var eventNames = [
	'Territory',
	'Bio Labs',
	'Tech Plants',
	'Amp Stations'
];

var zoneNames = {
	0: 'Global',
	2: 'Indar',
	6: 'Amerish',
	8: 'Esamir'
};

var facilityData = {
	1: {
		2: {2103: 'Allatum', 2104: 'Saurva', 2106: 'Rashnu'},
		6: {6102: 'Ikanam', 6113: 'Onatha', 6123: 'Xelas'},
		8: {18022: 'Andvari', 18026: 'Mani', 18028: 'Ymir'}
	},
	2: {
		2: {2101: 'Hvar', 2102: 'Mao', 2108: 'Tawrich'},
		6: {6103: 'Heyoka', 6112: 'Mekala', 6122: 'Tumas'},
		8: {18025: 'Eisa'}
	},
	3: {
		2: {2105: 'Peris', 2107: 'Dahaka', 2109: 'Zurvan'},
		6: {6101: 'Kwahtee', 6111: 'Sungrey', 6121: 'Wokuk'},
		8: {18023: 'Elli', 18024: 'Freyr', 18027: 'Nott'}
	}
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

var updateDetails = function(world, data){
	var event = alerts[+data.metagame_event_id];
	if(event.type == 0){
		var details = {1: [], 2: [], 3: []};

		queryDetails(world.id, 2, function(row){
			details[+row.FactionId].push(+row.RegionId);
		}, function(){
			queryDetails(world.id, 6, function(row){
				details[+row.FactionId].push(+row.RegionId);
			}, function(){
				queryDetails(world.id, 8, function(row){
					details[+row.FactionId].push(+row.RegionId);
				}, function(){
					var total = details[1].length + details[2].length + details[3].length;
					world.details = {
						1: (details[1].length / total) * 100,
						2: (details[2].length / total) * 100,
						3: (details[3].length / total) * 100
					};

					wss.broadcast({details: world.details, id: world.id});
				});
			});
		});
	} else {
		world.details = {1: [], 2: [], 3: []};

		if(event.zone == 0){
			var facilities = facilityData[event.type];
			queryDetails(world.id, 2, function(row){
				var facility = facilities[2][+row.RegionId];
				if(facility)
					world.details[+row.FactionId].push(facility);
			}, function(){
				queryDetails(world.id, 6, function(row){
					var facility = facilities[6][+row.RegionId];
					if(facility)
						world.details[+row.FactionId].push(facility);
				}, function(){
					queryDetails(world.id, 8, function(row){
						var facility = facilities[8][+row.RegionId];
						if(facility)
							world.details[+row.FactionId].push(facility);
					}, function(){
						wss.broadcast({details: world.details, id: world.id});
					});
				});
			});
		} else {
			var facilities = facilityData[event.type][event.zone];
			queryDetails(world.id, event.zone, function(row){
				var facility = facilities[+row.RegionId];
				if(facility)
					world.details[+row.FactionId].push(facility);
			}, function(){
				wss.broadcast({details: world.details, id: world.id});
			});
		}
	}
};

var updateAlerts = function(data){
	var id = +data.world_id;
	var world = worlds[id];

	var state = +data.metagame_event_state;
	if(state == 135 || state == 136){
		var details = alerts[+data.metagame_event_id];
		world.active = true;
		world.alert = {
			type: details.type,
			zone: details.zone,
			eventName: eventNames[details.type],
			zoneName: zoneNames[details.zone],
			start: +(data.timestamp + '000'),
			duration: (+data.metagame_event_id > 6) ? 1 : 2
		}

		updateDetails(world, data);
	} else {
		world.active = false
		delete world.details;
	};

	wss.broadcast({world: world});
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
