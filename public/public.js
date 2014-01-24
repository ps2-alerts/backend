var worlds = [];

var updateTime = function(){
	var now = Date.now();

	for(var index = 0; index < worlds.length; index++){
		var world = worlds[index];
		if(world.active){
			var date = new Date(world.alert.start - now);
			date.setUTCHours(date.getUTCHours() + world.alert.duration);

			var h = date.getUTCHours();
			var m = ('0' + date.getUTCMinutes()).slice(-2);
			var s = ('0' + date.getUTCSeconds()).slice(-2);

			if(h > 2 || (h + +m + +s) < 0){
				world.active = false;
				updateAlert(world);
			} else {
				$('#world-' + world.id + ' .state').html(h + ':' + m + ':' + s);
			}
		}
	}
}

var updateAlert = function(world){
	var row = '#world-' + world.id;
	if(world.active){
		$(row).addClass('active');
		$(row + ' .type').html(world.alert.eventName);
		$(row + ' .zone').html(world.alert.zoneName);
		$(row + ' .state').html('Active alert!');

		updateTime();
	} else {
		var state = world.state == 'online' ? 'no alert' : world.state;

		$(row).removeClass();
		$(row + ' .type').html('');
		$(row + ' .zone').html('');
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
				$('tr:last').append('<td class="type"></td>');
				$('tr:last').append('<td class="zone"></td>');

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

	setInterval(updateTime, 1000);
});
