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

var http = require('http');
var query = function(params, callback){
	http.get('http://census.soe.com/get/ps2:v2/' + params, function(response){
		var result = '';
		response.on('data', function(chunk){
			result += chunk;
		});

		response.on('end', function(){
			callback(JSON.parse(result));
		});
	});
}

module.exports = function(){
	var self = this;
	self.update = function(){
		query('world?c:limit=100', function(result){
			for(var index = 0; index < result.world_list.length; index++){
				var data = result.world_list[index];
				var world = worlds[+data.world_id];
				if(world){
					if(data.state == 'online')
						self.updateWorld(world);
				}
			}
		});
	}

	self.updateWorld = function(world){

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
