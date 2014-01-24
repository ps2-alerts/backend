$(document).ready(function(){
	var socket = WebSocket(location.origin.replace(/^http/, 'ws'));
	socket.onmessage = function(event){
		var data = JSON.parse(event.data);
		if(data.ping){
			socket.send('pong');
		}
	}
});
