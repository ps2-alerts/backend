var debugging = true;
var print = function(){
	if(debugging)
		console.log(Array.prototype.join.call(arguments, ' '));
};

var app = require('express')();
app.get('/', function(request, response){
	response.redirect('http://p3lim.github.io/ps2-alerts');
});

var http = require('http');
var server = http.createServer(app);
server.listen(process.env.PORT || 5000);

var WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;

var wss = new WebSocketServer({server: server});
wss.on('connection', function(socket){
	socket.send(JSON.stringify({worlds: worlds}));
});

wss.broadcast = function(data){
	for(var index = 1; index <= this.clients.length; index++)
		this.clients[index - 1].send(JSON.stringify(data));
};

setInterval(function(){
	for(var index = 1; index <= wss.clients.length; index++)
		wss.clients[index - 1].send('ping');
}, 30000);

// https://gist.github.com/p3lim/a46348651daea5c08895#servers---census
var worlds = {
	1: {alert: {}, details: {1: [], 2: [], 3: []}},  // Connery
	9: {alert: {}, details: {1: [], 2: [], 3: []}},  // Woodman
	10: {alert: {}, details: {1: [], 2: [], 3: []}}, // Miller
	11: {alert: {}, details: {1: [], 2: [], 3: []}}, // Ceres
	13: {alert: {}, details: {1: [], 2: [], 3: []}}, // Cobalt
	17: {alert: {}, details: {1: [], 2: [], 3: []}}, // Emerald
	25: {alert: {}, details: {1: [], 2: [], 3: []}}  // Briggs
};

// https://gist.github.com/p3lim/a46348651daea5c08895#alerts---census
var alerts = {
	1: {zone: 2, type: 0},  // Indar Territory
	2: {zone: 8, type: 0},  // Esamir Territory
	3: {zone: 6, type: 0},  // Amerish Territory
	4: {zone: 4, type: 0},  // Hossin Territory

	7: {zone: 6, type: 3},  // Amerish Biolab
	8: {zone: 6, type: 4},  // Amerish Tech Plant
	9: {zone: 6, type: 2},  // Amerish Amp Station

	10: {zone: 2, type: 3}, // Indar Biolab
	11: {zone: 2, type: 4}, // Indar Tech Plant
	12: {zone: 2, type: 2}, // Indar Amp Station

	13: {zone: 8, type: 3}, // Esamir Biolab
	14: {zone: 8, type: 2}  // Esamir Amp Station
};

// https://gist.github.com/p3lim/a46348651daea5c08895#zonefacility-names--other-details
var warpgates = [
	1000, 1001, 1002, 1003, 1004, 1005, 2201, 2202, 2203, // Indar
	4230, 4231, 4232, 4240, 4241, 4242, 4250, 4251, 4252, // Hossin
	6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, // Amerish
	18029, 18030, 18031, 18039, 18040, 18041, 18042, 18043, 18044 // Esamir
];

// https://gist.github.com/p3lim/a46348651daea5c08895#zonefacility-names--other-details
var facilities = {
	2: {2: [2105, 2107, 2109], 4: [4140, 4150, 4160], 6: [6101, 6111, 6121], 8: [18023, 18024, 18027]},
	3: {2: [2103, 2104, 2106], 4: [4170, 4180, 4190], 6: [6102, 6113, 6123], 8: [18022, 18026, 18028]},
	4: {2: [2101, 2102, 2108], 4: [4200, 4210, 4220], 6: [6103, 6112, 6122], 8: [18025]}
};

var query = function(params, callback){
	http.get('http://census.soe.com/s:ps2alerts/get/ps2:v2/' + params, function(response){
		if(response.statusCode != 200){
			print('[query ERR2] params:', params, '-', response.statusCode);

			setTimeout(function(){
				query(params, callback);
			}, 30000);
		} else {
			var result = '';
			response.on('data', function(chunk){
				result += chunk;
			});

			response.on('end', function(){
				try {
					var obj = JSON.parse(result);
					callback(obj);
				} catch(error){
					print('[query ERR3] params:', params, '-', error.message);
				}
			});
		}
	}).on('error', function(error){
		print('[query ERR2] params:', params, '-', error.message);

		setTimeout(function(){
			query(params, callback);
		}, 30000);
	});
};

var updateAlertDetails = function(id, alert){
	var details = worlds[id].details;

	print('[updateAlertDetails] world:', id, 'type:', alert.type, 'zone:', alert.zone);

	query('map?zone_ids=' + alert.zone + '&world_id=' + id, function(result){
		for(var array in details)
			details[array].length = 0;

		var rows = result.map_list[0].Regions.Row;
		if(!alert.type){
			for(var index = 0; index < rows.length; index++){
				var row = rows[index].RowData;
				if(warpgates.indexOf(+row.RegionId) == -1)
					details[+row.FactionId].push(+row.RegionId);
			}
		} else {
			for(var index = 0; index < rows.length; index++){
				var row = rows[index].RowData;
				if(facilities[alert.type][alert.zone].indexOf(+row.RegionId) != -1)
					details[+row.FactionId].push(+row.RegionId);
			}
		}

		wss.broadcast({details: details, id: id});
	});
};

var updateAlerts = function(data){
	var id = +data.world_id;
	var alert = worlds[id].alert;

	print('[updateAlerts] alert', data.metagame_event_state_name, 'on world', id);

	var state = +data.metagame_event_state;
	if(state == 135 || state == 136){
		var details = alerts[+data.metagame_event_id];
		if(!details)
			return print('[updateAlerts ERR] missing details', id, +data.metagame_event_id);

		alert.active = true;
		alert.type = details.type;
		alert.zone = details.zone;
		alert.start = +(data.timestamp + '000');
		alert.duration = (+data.metagame_event_id > 6) ? 1 : 2;

		updateAlertDetails(id, alert);
	} else {
		for(var member in alert)
			delete alert[member];

		alert.active = false;
	}

	wss.broadcast({alert: alert, id: id});
};

var updateWorldState = function(init){
	query('world?c:limit=100', function(result){
		for(var index = 0; index < result.world_list.length; index++){
			var data = result.world_list[index];
			var id = +data.world_id;

			var world = worlds[id];
			if(world){
				if(data.state != world.state){
					world.state = data.state;

					wss.broadcast({state: data.state, id: id});
				}

				if(data.state == 'online' && init){
					query('world_event?type=METAGAME&world_id=' + id, function(result){
						updateAlerts(result.world_event_list[0]);
					});
				}
			}
		}
	});
};

updateWorldState(true);
setInterval(updateWorldState, 600000);

// https://gist.github.com/p3lim/a46348651daea5c08895#zonefacility-names--other-details
var facilityToRegion = {
	// Indar
	3400:2105, 3201:2107, 118000:2109, 4001:2103, 3801:2104, 3601:2106, 7500:2101, 4401:2102,
	7000:2108, 5300:2301, 5500:2302, 5100:2303, 5200:2304, 5900:2305, 6200:2306, 6100:2307,
	6000:2308, 5800:2309, 5700:2310, 6500:2311, 6400:2312, 6300:2313, 213:2414, 215:2416, 201:2402,
	202:2403, 203:2404, 204:2405, 205:2406, 206:2407, 207:2408, 208:2409, 209:2410, 210:2411,
	211:2412, 212:2413, 214:2415, 216:2417, 217:2418, 218:2419, 219:2420, 220:2421, 221:2422,
	222:2423, 223:2424, 224:2425, 225:2426, 226:2427, 227:2428, 228:2429, 229:2430, 230:2431,
	231:2432, 232:2433, 235:2436, 236:2437, 237:2438, 239:2440, 241:2442, 242:2443, 243:2444,
	246:2447, 247:2448, 248:2449, 250:2451, 252:2453, 3410:2454, 3420:2455, 3430:2456, 4010:2457,
	4020:2458, 4030:2459, 4430:2460, 4420:2461, 4410:2462, 7020:2463, 7030:2464, 7010:2465,
	3620:2466, 3610:2467, 3630:2468, 118030:2469, 118010:2470, 118020:2471, 3810:2472, 3820:2473,
	7520:2474, 7510:2475, 7530:2476, 3210:2477, 3230:2478, 3220:2479, 7802:1000, 7803:1001,
	120001:1002, 120002:1003, 4802:1004, 4803:1005, 7801:2201, 120000:2202, 4801:2203,

	// Hossin
	299000:4140, 300000:4150, 301000:4160, 302000:4170, 303000:4180, 304000:4190, 305000:4200,
	306000:4210, 307000:4220, 289000:4130, 290000:4131, 291000:4132, 292000:4133, 293000:4134,
	294000:4135, 295000:4136, 296000:4137, 297000:4138, 298000:4139, 261000:4101, 262000:4102,
	263000:4103, 264000:4104, 265000:4105, 266000:4106, 267000:4107, 268000:4108, 269000:4109,
	270000:4110, 271000:4111, 272000:4112, 273000:4113, 274000:4114, 275000:4115, 276000:4116,
	277000:4117, 278000:4118, 279000:4119, 280000:4120, 281000:4121, 282000:4122, 283000:4123,
	284000:4124, 285000:4125, 286000:4126, 287000:4127, 299010:4141, 299020:4142, 299030:4143,
	300010:4151, 300020:4152, 300030:4153, 301010:4161, 301020:4162, 301030:4163, 302010:4171,
	302020:4172, 302030:4173, 303010:4181, 303020:4182, 303030:4183, 304010:4191, 304020:4192,
	304030:4193, 305010:4201, 305020:4202, 305030:4203, 306010:4211, 306020:4212, 306030:4213,
	307010:4221, 307020:4222, 307030:4223, 287010:4260, 287020:4261, 287030:4262, 287040:4263,
	287050:4264, 287060:4265, 287070:4266, 287080:4267, 287090:4268, 287100:4269, 287110:4270,
	287120:4271, 308000:4230, 308001:4231, 308002:4232, 309000:4240, 309001:4241, 309002:4242,
	310000:4250, 310001:4251, 310002:4252,

	// Amerish
	204000:6101, 207000:6111, 210000:6121, 205000:6102, 209000:6113, 212000:6123, 206000:6103,
	208000:6112, 211000:6122, 213000:6201, 214000:6202, 215000:6203, 216000:6204, 217000:6205,
	218000:6206, 219000:6207, 220000:6208, 221000:6209, 222280:6329, 222000:6301, 222010:6302,
	222020:6303, 222030:6304, 222040:6305, 222050:6306, 222060:6307, 260004:6308, 222080:6309,
	222090:6310, 222100:6311, 222110:6312, 222120:6313, 222130:6314, 222150:6316, 222160:6317,
	222170:6318, 222180:6319, 222190:6320, 222220:6323, 222230:6324, 222240:6325, 222250:6326,
	222270:6328, 222300:6330, 222310:6331, 222320:6332, 222330:6333, 222340:6334, 222350:6335,
	222360:6336, 222370:6337, 222380:6338, 222290:6339, 204001:6340, 204002:6341, 204003:6342,
	205001:6343, 205002:6344, 205003:6345, 206001:6346, 206002:6347, 207001:6348, 207002:6349,
	207003:6350, 208001:6351, 208002:6352, 209001:6353, 209002:6354, 209003:6355, 210001:6356,
	210002:6357, 210003:6358, 211001:6359, 211002:6360, 212001:6361, 212002:6362, 212003:6363,
	200000:6001, 201000:6002, 203000:6003, 200001:6004, 200002:6005, 201001:6006, 201002:6007,
	203001:6008, 203002:6009,

	// Esamir
	252000:18023, 253000:18024, 256000:18027, 251000:18022, 255000:18026, 257000:18028,
	254000:18025, 250000:18009, 245000:18016, 246000:18017, 247000:18018, 248000:18019,
	249000:18020, 260010:18038, 230000:18001, 231000:18002, 232000:18003, 233000:18004,
	234000:18005, 235000:18006, 236000:18007, 237000:18008, 239000:18010, 240000:18011,
	241000:18012, 242000:18013, 243000:18014, 244000:18015, 238000:18021, 244100:18032,
	244200:18033, 244300:18034, 310005:18035, 244500:18036, 244600:18037, 251010:18046,
	251020:18047, 251030:18048, 252010:18049, 252020:18050, 253010:18051, 253020:18052,
	253030:18053, 253040:18054, 254010:18055, 254020:18056, 254030:18057, 255010:18058,
	255020:18059, 255030:18060, 256010:18061, 256020:18062, 256030:18063, 257010:18064,
	257020:18065, 257030:18066, 244610:18067, 244620:18068, 258000:18029, 259000:18030,
	260000:18031, 260011:18039, 260012:18040, 260013:18041, 260014:18042, 260015:18043,
	260016:18044
};

var ws = new WebSocket('wss://push.planetside2.com/streaming?service-id=s:ps2alerts');
ws.on('open', function(){
	print('[ws] connected');

	ws.send(JSON.stringify({
		service: 'event',
		action: 'subscribe',
		worlds: ['1', '9', '10', '11', '13', '17', '25'],
		eventNames: ['MetagameEvent', 'FacilityControl']
	}));
});

ws.on('message', function(data){
	var payload = JSON.parse(data).payload;
	if(!payload)
		return;

	if(payload.event_name == 'MetagameEvent')
		updateAlerts(payload);
	else if(payload.event_name == 'FacilityControl'){
		var id = +payload.world_id;
		var world = worlds[id];

		var oldFaction = +payload.old_faction_id;
		var newFaction = +payload.new_faction_id;

		if(world && world.alert.active && payload.zone_id == world.alert.zone && oldFaction != newFaction){
			var details = world.details;
			var region = facilityToRegion[+payload.facility_id];

			var index = details[oldFaction].indexOf(region);
			if(index < 0)
				return;

			print('[payload]', region, 'on world', id, 'changed from', oldFaction, 'to', newFaction);

			details[oldFaction].splice(index, 1);
			details[newFaction].push(region);

			wss.broadcast({details: details, id: id});
		}
	}
});

ws.on('close', function(){
	print('[ws] DISCONNECTED!');
});
