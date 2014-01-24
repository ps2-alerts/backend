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

module.exports = function(){
	var self = this;

	for(var index in worlds){
		var world = worlds[index];
		world.id = index;
		world.state = '';
		world.active = false;
		world.eventID = 0;
		world.alert = {};
	}

	return self;
}
