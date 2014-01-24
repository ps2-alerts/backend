$(document).ready(function(){
	var socket = WebSocket(location.origin.replace(/^http/, 'ws'));
	socket.onmessage = function(event){
		
	}
});
