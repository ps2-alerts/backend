var worlds = [];

var updateAlert = function(world){
	var row = '#world-' + world.id;
	if(world.active){
		$(row).addClass('active');
		$(row + ' .state').html('Active alert!');
	} else {
		var state = world.state == 'online' ? 'no alert' : world.state;

		$(row).removeClass();
		$(row + ' .remaining').html(state.charAt(0).toUpperCase() + state.slice(1));
	}
}

$(document).ready(function(){
	var socket = WebSocket(location.origin.replace(/^http/, 'ws'));
	socket.onmessage = function(event){
		var data = JSON.parse(event.data);
		if(data.ping){
			socket.send('pong');
		} else if(data.init){
			for(var index in data.worlds){
				worlds.push(data.worlds[index]);
			}

			worlds.sort(function(a, b){
				return a.name > b.name;
			});

			for(var index = 0; index < worlds.length; index++){
				var world = worlds[index];
				$('table').append('<tr id="world-' + world.id + '"></tr>');
				$('tr:last').append('<td>' + world.name + '</td>');
				$('tr:last').append('<td class="state"></td>');

				updateAlert(world);
			}
		} else {
			for(var index = 0; index < worlds.length; index++){
				var world = worlds[index];
				if(world.id == data.id){
					worlds[index] = data;
					updateAlert(data);
				}
			}
		}
	}
});
