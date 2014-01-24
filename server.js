var express = require('express');
var app = express();
app.use(express.static(__dirname + '/public'));

var server = require('http').createServer(app);
server.listen(process.env.PORT);

var wss = require('ws').Server;
var sockets = new wss({server: server});

sockets.on('connection', function(socket){

});
