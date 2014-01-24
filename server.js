var express = require('express');
var app = express();
app.use(express.static(__dirname + '/public'));

var server = require('http').createServer(app);
server.listen(process.env.PORT || 5000);

var wss = require('ws').Server;
var sockets = new wss({server: server});
sockets.broadcast = function(data){
	for(var index = 1; index <= this.clients.length; index++)
		this.clients[index - 1].send(JSON.stringify(data));
}

var alerts = require('./alerts.js')(sockets);

var interval;
var update = function(){
	sockets.broadcast({ping: true});

	alerts.update();
}

sockets.on('connection', function(socket){
	var clients = this.clients;
	if(clients.length == 1)
		interval = setInterval(update, 30000);

	socket.send(JSON.stringify(alerts.init()));
	socket.on('close', function(){
		if(clients.length == 0)
			clearInterval(interval);
	});
});
