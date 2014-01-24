var express = require('express');
var app = express();
app.use(express.static(__dirname + '/public'));

var server = require('http').createServer(app);
server.listen(process.env.PORT || 5000);

var wss = require('ws').Server;
var sockets = new wss({server: server});

var alerts = require('./alerts.js')();

sockets.on('connection', function(socket){

});
