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
			print('[query1] params:', params, '-', response.statusCode, 'headers:', response.headers);
			setTimeout(function(){
				query(params, callback);
			}, 30000);
		} else {
			var result = '';
			response.on('data', function(chunk){
				result += chunk;
			});

			response.on('end', function(){
				callback(JSON.parse(result));
			});
		}
	}).on('error', function(error){
		print('[query2] params:', params, '-', error.message);
		setTimeout(function(){
			query(params, callback);
		}, 30000);
	});
};

var updateAlertDetails = function(id, alert){
	var details = worlds[id].details;

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

	print('[updateAlerts1] alert', data.metagame_event_state_name, 'on world', id);

	var state = +data.metagame_event_state;
	if(state == 135 || state == 136){
		var details = alerts[+data.metagame_event_id];
		if(!details)
			return print('[updateAlerts2] missing details', id, +data.metagame_event_id);

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

var pollAlerts = function(id){
	query('world_event?type=METAGAME&world_id=' + id, function(result){
		updateAlerts(result.world_event_list[0]);
	});
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

				if(data.state == 'online' && init)
					pollAlerts(id);
			}
		}
	});
};

updateWorldState(true);
setInterval(updateWorldState, 600000);

// https://gist.github.com/p3lim/a46348651daea5c08895#zonefacility-names--other-details
var facilityToRegion = {
	// Indar
	3400:18044, 3201:2107, 118000:2105, 4001:2109, 3801:2103, 3601:2104, 7500:2106, 4401:2101,
	7000:2102, 5300:2108, 5500:2301, 5100:2302, 5200:2303, 5900:2304, 6200:2305, 6100:2306,
	6000:2307, 5800:2308, 5700:2309, 6500:2310, 6400:2311, 6300:2312, 213:2313, 215:2414, 201:2416,
	202:2402, 203:2403, 204:2404, 205:2405, 206:2406, 207:2407, 208:2408, 209:2409, 210:2410,
	211:2411, 212:2412, 214:2413, 216:2415, 217:2417, 218:2418, 219:2419, 220:2420, 221:2421,
	222:2422, 223:2423, 224:2424, 225:2425, 226:2426, 227:2427, 228:2428, 229:2429, 230:2430,
	231:2431, 232:2432, 235:2433, 236:2436, 237:2437, 239:2438, 241:2440, 242:2442, 243:2443,
	246:2444, 247:2447, 248:2448, 250:2449, 252:2451, 3410:2453, 3420:2454, 3430:2455, 4010:2456,
	4020:2457, 4030:2458, 4430:2459, 4420:2460, 4410:2461, 7020:2462, 7030:2463, 7010:2464,
	3620:2465, 3610:2466, 3630:2467, 118030:2468, 118010:2469, 118020:2470, 3810:2471, 3820:2472,
	7520:2473, 7510:2474, 7530:2475, 3210:2476, 3230:2477, 3220:2478, 7802:2479, 7803:1000,
	120001:1001, 120002:1002, 4802:1003, 4803:1004, 7801:1005, 120000:2201, 4801:2202,

	// Hossin
	299000:2203, 300000:4140, 301000:4150, 302000:4160, 303000:4170, 304000:4180, 305000:4190,
	306000:4200, 307000:4210, 289000:4220, 290000:4130, 291000:4131, 292000:4132, 293000:4133,
	294000:4134, 295000:4135, 296000:4136, 297000:4137, 298000:4138, 261000:4139, 262000:4101,
	263000:4102, 264000:4103, 265000:4104, 266000:4105, 267000:4106, 268000:4107, 269000:4108,
	270000:4109, 271000:4110, 272000:4111, 273000:4112, 274000:4113, 275000:4114, 276000:4115,
	277000:4116, 278000:4117, 279000:4118, 280000:4119, 281000:4120, 282000:4121, 283000:4122,
	284000:4123, 285000:4124, 286000:4125, 287000:4126, 299010:4127, 299020:4141, 299030:4142,
	300010:4143, 300020:4151, 300030:4152, 301010:4153, 301020:4161, 301030:4162, 302010:4163,
	302020:4171, 302030:4172, 303010:4173, 303020:4181, 303030:4182, 304010:4183, 304020:4191,
	304030:4192, 305010:4193, 305020:4201, 305030:4202, 306010:4203, 306020:4211, 306030:4212,
	307010:4213, 307020:4221, 307030:4222, 287010:4223, 287020:4260, 287030:4261, 287040:4262,
	287050:4263, 287060:4264, 287070:4265, 287080:4266, 287090:4267, 287100:4268, 287110:4269,
	287120:4270, 308000:4271, 308001:4230, 308002:4231, 309000:4232, 309001:4240, 309002:4241,
	310000:4242, 310001:4250, 310002:4251,

	// Amerish
	204000:4252, 207000:6101, 210000:6111, 205000:6121, 209000:6102, 212000:6113, 206000:6123,
	208000:6103, 211000:6112, 213000:6122, 214000:6201, 215000:6202, 216000:6203, 217000:6204,
	218000:6205, 219000:6206, 220000:6207, 221000:6208, 222280:6209, 222000:6329, 222010:6301,
	222020:6302, 222030:6303, 222040:6304, 222050:6305, 222060:6306, 260004:6307, 222080:6308,
	222090:6309, 222100:6310, 222110:6311, 222120:6312, 222130:6313, 222150:6314, 222160:6316,
	222170:6317, 222180:6318, 222190:6319, 222220:6320, 222230:6323, 222240:6324, 222250:6325,
	222270:6326, 222300:6328, 222310:6330, 222320:6331, 222330:6332, 222340:6333, 222350:6334,
	222360:6335, 222370:6336, 222380:6337, 222290:6338, 204001:6339, 204002:6340, 204003:6341,
	205001:6342, 205002:6343, 205003:6344, 206001:6345, 206002:6346, 207001:6347, 207002:6348,
	207003:6349, 208001:6350, 208002:6351, 209001:6352, 209002:6353, 209003:6354, 210001:6355,
	210002:6356, 210003:6357, 211001:6358, 211002:6359, 212001:6360, 212002:6361, 212003:6362,
	200000:6363, 201000:6001, 203000:6002, 200001:6003, 200002:6004, 201001:6005, 201002:6006,
	203001:6007, 203002:6008,

	// Esamir
	252000:6009, 253000:18023, 256000:18024, 251000:18027, 255000:18022, 257000:18026,
	254000:18028, 250000:18025, 245000:18009, 246000:18016, 247000:18017, 248000:18018,
	249000:18019, 260010:18020, 230000:18038, 231000:18001, 232000:18002, 233000:18003,
	234000:18004, 235000:18005, 236000:18006, 237000:18007, 239000:18008, 240000:18010,
	241000:18011, 242000:18012, 243000:18013, 244000:18014, 238000:18015, 244100:18021,
	244200:18032, 244300:18033, 310005:18034, 244500:18035, 244600:18036, 251010:18037,
	251020:18046, 251030:18047, 252010:18048, 252020:18049, 253010:18050, 253020:18051,
	253030:18052, 253040:18053, 254010:18054, 254020:18055, 254030:18056, 255010:18057,
	255020:18058, 255030:18059, 256010:18060, 256020:18061, 256030:18062, 257010:18063,
	257020:18064, 257030:18065, 244610:18066, 244620:18067, 258000:18068, 259000:18029,
	260000:18030, 260011:18031, 260012:18039, 260013:18040, 260014:18041, 260015:18042,
	260016:18043
};

var ws = new WebSocket('wss://push.planetside2.com/streaming?service-id=s:ps2alerts');
ws.on('open', function(){
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
