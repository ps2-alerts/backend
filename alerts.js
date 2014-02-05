var worlds = {
	1: {name: 'Connery'},
	9: {name: 'Woodman'},
	10: {name: 'Miller'},
	11: {name: 'Ceres'},
	13: {name: 'Cobalt'},
	17: {name: 'Mattherson'},
	18: {name: 'Waterson'},
	25: {name: 'Briggs'}
}

var events = [
	{zone: 2, type: 0},
	{zone: 8, type: 0},
	{zone: 6, type: 0},
	{zone: 0, type: 1},
	{zone: 0, type: 2},
	{zone: 0, type: 3},
	{zone: 6, type: 1},
	{zone: 6, type: 2},
	{zone: 6, type: 3},
	{zone: 2, type: 1},
	{zone: 2, type: 2},
	{zone: 2, type: 3},
	{zone: 8, type: 1},
	{zone: 8, type: 3}
];

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
}

var eventIDs = {
	135: true, // started
	136: true, // restarted
	137: false, // canceled
	138: false // finished
}

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

var http = require('http');
var query = function(params, callback){
	http.get('http://census.soe.com/s:ps2alerts/get/ps2:v2/' + params, function(response){
		if(response.statusCode != 200){
			callback({error: {statusCode: response.statusCode, headers: response.headers}}, true);
		} else {
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
}

var queryDetails = function(id, zone, sockets, callback, finalize){
	query('map?world_id=' + id + '&zone_ids=' + zone, function(result, error){
		if(error){
			sockets.broadcast(result);
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
}

module.exports = function(sockets){
	var self = this;
	self.update = function(){
		query('world?c:limit=100', function(result, error){
			if(error){
				sockets.broadcast(result);
			} else {
				for(var index = 0; index < result.world_list.length; index++){
					var data = result.world_list[index];
					var world = worlds[+data.world_id];
					if(world){
						if(data.state != world.state){
							world.state = data.state;
							sockets.broadcast({world: world});
						}

						if(data.state == 'online')
							self.updateWorld(world);
					}
				}
			}
		});
	}

	self.updateWorld = function(world){
		query('world_event?world_id=' + world.id + '&type=METAGAME', function(result, error){
			if(error){
				sockets.broadcast(result);
			} else {
				if(!result.world_event_list)
					return;

				var data = result.world_event_list[0];

				var eventID = +data.metagame_event_state;
				if(eventID != world.eventID){
					if(eventIDs[eventID]){
						var event = events[+data.metagame_event_id - 1];
						world.active = true;
						world.alert = {
							start: +(data.timestamp + '000'),
							type: event.type,
							zone: event.zone,
							eventName: eventNames[event.type],
							zoneName: zoneNames[event.zone],
							duration: (+data.metagame_event_id > 6) ? 1 : 2
						}
					} else {
						world.active = false;
						delete world.details;
					}

					world.eventID = eventID;
					sockets.broadcast({world: world});
				}

				if(world.active)
					self.updateDetails(world, data);
			}
		});
	}

	self.updateDetails = function(world, data){
		var event = events[+data.metagame_event_id - 1];
		if(event.type == 0){
			var details = {1: [], 2: [], 3: []};

			queryDetails(world.id, 2, sockets, function(row){
				details[+row.FactionId].push(+row.RegionId);
			}, function(){
				queryDetails(world.id, 6, sockets, function(row){
					details[+row.FactionId].push(+row.RegionId);
				}, function(){
					queryDetails(world.id, 8, sockets, function(row){
						details[+row.FactionId].push(+row.RegionId);
					}, function(){
						var total = details[1].length + details[2].length + details[3].length;
						world.details = {
							1: (details[1].length / total) * 100,
							2: (details[2].length / total) * 100,
							3: (details[3].length / total) * 100
						}

						sockets.broadcast({details: world.details, id: world.id});
					});
				});
			});
		} else {
			world.details = {1: [], 2: [], 3: []};

			if(event.zone == 0){
				var facilities = facilityData[event.type];
				queryDetails(world.id, 2, sockets, function(row){
					var facility = facilities[2][+row.RegionId];
					if(facility)
						world.details[+row.FactionId].push(facility);
				}, function(){
					queryDetails(world.id, 6, sockets, function(row){
						var facility = facilities[6][+row.RegionId];
						if(facility)
							world.details[+row.FactionId].push(facility);
					}, function(){
						queryDetails(world.id, 8, sockets, function(row){
							var facility = facilities[8][+row.RegionId];
							if(facility)
								world.details[+row.FactionId].push(facility);
						}, function(){
							sockets.broadcast({details: world.details, id: world.id});
						});
					});
				});
			} else {
				var facilities = facilityData[event.type][event.zone];
				queryDetails(world.id, event.zone, sockets, function(row){
					var facility = facilities[+row.RegionId];
					if(facility)
						world.details[+row.FactionId].push(facility);
				}, function(){
					sockets.broadcast({details: world.details, id: world.id});
				});
			}
		}
	}

	self.init = function(){
		return {
			init: true,
			worlds: worlds
		}
	}

	for(var index in worlds){
		var world = worlds[index];
		world.id = index;
		world.state = '';
		world.active = false;
		world.eventID = 0;
		world.alert = {};
	}

	self.update();

	return self;
}
