var express = require('express');
var FixClient = require('nodefix').FixClient;
var asyncWhile = require("async-while");
var Log = require('log');
var utils = require("./utils.js");
var router = express.Router();
var moment = require('moment');
var now = require('performance-now');
var jsonfile = require('jsonfile');
var path = require('path');
var log = new Log('ERROR');

var handleOrder = function(client, message) {
    var msgType = message['35'];
    var execType = message['150'];
    var ordStatus = message['39'];
    var clOrdId = message['11'];
    var ordQty = message['38'];
    var symbol = message['55'];
    var securityId = message['48'];
    var price = message['44'];
    var ordType = message['40'];

    var ordId = message['37'];
    var secondaryOrdId = message['198'];
    var lastPx = message['31'];
    var lastQty = message['32'];
    var leavesQty = message['151'];

    var f_orders = [];
    if (['0','1','2','4','5','A'].indexOf(msgType) >=0)
        return;

    if (ordId != undefined) {
        f_orders = client.orders.filter(function(o) { return o.ordId == ordId });
        if (f_orders.length == 0) {
            f_orders = client.orders.filter(function(o) { return o.clOrdId == clOrdId });
        }
    }

    if (f_orders.length > 0) {
        var order = f_orders[0];
        order.clOrdId = clOrdId;
        order.execType = execType;
        order.ordStatus = ordStatus;
        order.ordId = ordId;
        order.leavesQty = leavesQty;

        if (execType == 'F') {
            order.trades.push( {
                tradeType: ordStatus,
                tradePx: lastPx,
                tradeQty: lastQty,
                tradeId: secondaryOrdId
            })
        } else {
            order.secondaryOrdId = secondaryOrdId;
        }
    } else {
        if (execType == 'F') {
            client.orders.push( {
                clOrdId: clOrdId,
                ordId: ordId,
                execType: execType,
                ordStatus: ordStatus,
                ordQty: ordQty,
                symbol: symbol,
                securityId: securityId,
                price: price,
                ordType: ordType,
                leavesQty: leavesQty,
                trades: {
                    tradeType: ordStatus,
                    tradePx: lastPx,
                    tradeQty: lastQty,
                    tradeId: secondaryOrdId
                }
            });
        } else {
            client.orders.push( {
                clOrdId: clOrdId,
                execType: execType,
                ordStatus: ordStatus,
                ordQty: ordQty,
                symbol: symbol,
                securityId: securityId,
                price: price,
                ordType: ordType,
                trades: []
            });
        }
    }
}

var save_config = function(cb) {
    var client_config = [];
    var file = path.resolve('data.json');

    if (global.clients.size > 0) {
        global.clients.forEach(function(client) {
            client_config.push({
                id: client.id,
                setting: client.setting
            });
        })
        jsonfile.writeFile(file, client_config, function (err) {
            if (err) {
                cb(err);
            } else {
                cb(null);
            }
        });
    } else {
        cb(null);
    }
}

router.post('/client', function(req, res) {
    var clients = [];
    var client_id = req.body.id;
    var file = path.resolve('data.json');

    if (client_id == undefined) {
        if (global.clients.size == 0) {
            jsonfile.readFile(file, function(err, obj) {
                if (err) {
                    res.status(400).send({ error: err });
                } else {
                    var j_clients = obj;
                    j_clients.forEach(function(client) {
                        var new_client = {
                            'id': client.id,
                            'setting': client.setting,
                            'instance': null,
                            'messages': [],
                            'isconnected': false,
                            'storemsg': true,
                            'orders': []
                        }
                        global.clients.set(client.id, new_client);
                    });
                    global.clients.forEach(function (value, key) {
                        var client = {
                            id: key,
                            setting: value.setting,
                            inbound: value.messages.filter(function(o) { return o.direction == 0 }).length,
                            outbound: value.messages.filter(function(o) { return o.direction == 1 }).length,
                            orders: value.orders.length,
                            active_orders: value.orders.filter(function(o) { return o.ordStatus != 2 }).length,
                            isconnected: value.isconnected
                        }
                        clients.push(client);
                    });
                    res.send(clients);
                }
            })
        } else {
            global.clients.forEach(function (value, key) {
                var client = {
                    id: key,
                    setting: value.setting,
                    inbound: value.messages.filter(function(o) { return o.direction == 0 }).length,
                    outbound: value.messages.filter(function(o) { return o.direction == 1 }).length,
                    orders: value.orders.length,
                    active_orders: value.orders.filter(function(o) { return o.ordStatus != 2 }).length,
                    isconnected: value.isconnected
                }
                clients.push(client);
            });
            res.send(clients);
        }
    } else {
        var client = global.clients.get(client_id);
        if (client != undefined) {
            res.send({
                id: client_id,
                setting: client.setting,
                inbound: client.messages.filter(function(o) { return o.direction == 0 }).length,
                outbound: client.messages.filter(function(o) { return o.direction == 1 }).length,
                orders: client.orders.length,
                active_orders: client.orders.filter(function(o) { return o.ordStatus != 2 }).length,
                isconnected: client.isconnected
            });
        }
    }
});

router.post('/client/create', function(req, res) {
    req.checkBody("senderid", "Senderid is required.").notEmpty();
    req.checkBody("targetid", "Targetid is required.").notEmpty();
    req.checkBody("host", "Host is required.").notEmpty();
    req.checkBody("port", "Port is required.").notEmpty();
    req.checkBody("version", "Version is required.").notEmpty();
    req.checkBody("dictionary", "Dictionary is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var senderid = req.body.senderid;
        var targetid = req.body.targetid;
        var host = req.body.host;
        var port = req.body.port;
        var version = req.body.version;
        var dictionary = req.body.dictionary;
        var reset_seqnum = req.body.reset_seqnum;

        var options = req.body.options == undefined ? {} : JSON.parse(req.body.options);

        var client_id = host + "|" + port + "|" + version + "-" + senderid + "-" + targetid;
        var new_client = {
            'id': client_id,
            'setting': {
                'senderid': senderid,
                'targetid': targetid,
                'host': host,
                'port': port,
                'version': version,
                'dictionary': dictionary,
                'reset_seqnum': reset_seqnum,
                'options': options
            },
            'instance': null,
            'messages': [],
            'isconnected': false,
            'storemsg': true,
            'orders': []
        };

        global.clients.set(client_id, new_client);
        save_config(function(err) {
            if (err) res.status(400).send({ error: err });
            else res.send({id: client_id});
        });
    }
});

router.post('/client/delete', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();

    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;

        if (global.clients.has(client_id)) {
            global.clients.delete(client_id);
            save_config(function(err) {
                if (err) res.status(400).send({ error: err });
                else res.send({});
            });
        } else {
            res.status(400).send( { error: 'Client '+ client_id+ ' does not exists.' } );
        }
    }
});

router.post('/client/logon', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;
        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            var logon_extend_tags = {"98":"0", "108": "30", "141": client.setting.reset_seqnum == 0 ? "N" : "Y"};
            if (client.options != undefined) {
                logon_extend_tags = _.extend({}, logon_extend_tags, client.setting.options)
            }
            utils.getDictionary(client.setting.dictionary, function(err, dict) {
                if (err) {
                    log.error(err);
                    res.status(400).send({ error: err });
                } else {
                    client.instance = new FixClient(client.setting.host, client.setting.port, client.setting.version, dict, client.setting.senderid, client.setting.targetid, client.setting.options);
                    client.instance.createConnection(function(err, session) {
                        if (err) {
                            log.error(err);
                            res.status(400).send({ error: err });
                        } else {
                            session.on('outmsg', function(outmsg) {
                                var message = outmsg.message;
                                var msgtype = message['35'];

                                if (msgtype == "0")
                                    log.debug("- OUT\r\nMESSAGE:"+JSON.stringify(message)+"\r\n");
                                else
                                    log.info("- OUT\r\nMESSAGE:"+JSON.stringify(message)+"\r\n");

                                if (client.storemsg) {
                                    if (msgtype != "0" && msgtype != "1") {
                                        client.messages.unshift({
                                            json: message,
                                            time: message['52'],
                                            direction: 1
                                        });

                                        handleOrder(client, message);
                                    }
                                }
                            });

                            session.on('msg', function(msg) {
                                var message = msg.message;
                                var msgtype = message['35'];

                                if (msgtype == "0")
                                    log.debug("- IN\r\nMESSAGE:"+JSON.stringify(message)+"\r\n");
                                else
                                    log.info("- IN\r\nMESSAGE:"+JSON.stringify(message)+"\r\n");

                                if (client.storemsg) {
                                    if (msgtype != "0" && msgtype != "1") {
                                        client.messages.unshift({
                                            json: message,
                                            time: message['52'],
                                            direction: 0
                                        });

                                        handleOrder(client, message);
                                    }
                                }
                            });

                            session.on('err', function(err) {
                                var error = err.message;
                                log.error("ERROR:"+error);
                            });

                            session.on('connect', function() {
                                session.sendLogon(logon_extend_tags);
                            });

                            session.on('disconnect', function() {
                                client.isconnected = false;
                                log.info("Disconnected!");
                            });

                            session.on('logon', function(msg) {
                                client.isconnected = true;
                                res.send(msg);
                            });
                        }
                    });
                }
            })

        } else {
            res.status(400).send({ error: 'Client '+ client_id+ ' does not exists.'});
        }
    }
});

router.post('/client/logoff', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();

    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;

        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            client.instance.sendLogoff();
            res.send({});
        } else {
            res.status(400).send( { error: 'Client '+ client_id+ ' does not exists.' } );
        }
    }
});

router.post('/message/send', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    req.checkBody("message", "Message is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;
        var message = req.body.message.indexOf(utils.SOHCHAR) > 0 ? req.body.message : JSON.parse(req.body.message);
        var storemsg = req.body.storemessage == undefined ? true : req.body.storemessage;

        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            if (global.persistents.filter(function(o) { return o.status == 0}).length == 0) {
                client.storemsg = storemsg;
            }
            client.instance.sendMsg(message, function(msg) {
                res.send(msg);
            });
        } else {
            res.status(400).send( {error: client_id+' is not there.'} );
        }
    }
});

router.post('/message/burst', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    req.checkBody("message", "Message is required.").notEmpty();
    req.checkBody("count", "Count is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;
        var message = req.body.message;
        var count = req.body.count;
        var storemsg = req.body.storemessage == undefined ? false : req.body.storemessage;

        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            client.storemsg = storemsg;
            for(var i=0; i<count; i++) {
                setTimeout(function(){
                    client.instance.sendMsg(message, function(msg) { });
                },1);
            }
            res.send({});
        } else {
            res.status(400).send( {error: client_id+' is not there.'} );
        }
    }
});

router.post('/message/', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;
        var max_count = req.body.max == undefined ? 1000 : parseInt(req.body.max);
        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            res.send(client.messages.slice(0, max_count));
        } else {
            res.status(400).send( {error: client_id+' is not there.'} );
        }
    }
});

router.post('/message/search', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    req.checkBody("where", "Message is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;
        var direction = req.body.direction == undefined ? 0 : parseInt(req.body.direction);
        var where = JSON.parse(req.body.where);
        var max_count = req.body.max == undefined ? 1000 : parseInt(req.body.max);
        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            var msgs = [];
            var where_key = where.key;
            var where_data = where.data;
            var key_key = Object.keys(where_key)[0];
            var key_value = where_key[key_key];

            var inbound_messages = client.messages.filter(function(o) { return o.direction == direction && o.json[key_key] == key_value });

            for(var i=0; i < inbound_messages.length && i < max_count; i++) {
                var msg = inbound_messages[i].json;
                var found = false;
                for (var key in where_data) {
                    if (where_data.hasOwnProperty(key)) {
                       if (msg.hasOwnProperty(key) && msg[key] == where_data[key]){
                            found = true;
                       } else{
                            found = false;
                            break;
                        }
                    }
                }
                if (found) {
                    msgs.push(msg);
                }
            }

            res.send(msgs);
        } else {
            res.status(400).send( {error: client_id+' is not there.'} );
        }
    }
});

router.post('/message/purge', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;

        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            client.messages = [];
            res.send({});
        } else {
            res.status(400).send( {error: client_id+' is not there.'} );
        }
    }
});

router.post('/persistent', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();

    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var id = req.body.id;
        var persistents = global.persistents.filter(function(o) { return o.client_id == id });
        res.send(persistents);
    }
});

router.post('/persistent/create', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    req.checkBody("message", "Message is required.").notEmpty();
    req.checkBody("tps", "TPS is required.").notEmpty();
    req.checkBody("duration", "Duration (seconds) is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var id = utils.uuid();

        var client_id = req.body.id;
        var message = req.body.message;
        var tps = req.body.tps;
        var duration = req.body.duration;
        var storemsg = req.body.storemessage == undefined ? false : req.body.storemessage;

        if (tps > 1000) {
            res.status(400).send( {error: 'The maximum TPS is 1000.'} );
        } else {
            if (global.clients.has(client_id)) {
                var client = global.clients.get(client_id);
                client.storemsg = storemsg;
                global.persistents.push({
                    id: id,
                    client_id: client_id,
                    tps: tps,
                    duration: duration,
                    escaped: 0,
                    message: message,
                    createdtime: moment.utc(),
                    status: 0 // 0 - is running, 1 - is done
                });
                res.send({ id: id });
            } else {
                res.status(400).send( {error: client_id+' is not there.'} );
            }
        }
    }
});

router.post('/persistent/update', function(req, res) {
    req.checkBody("id", "Persistent ID is required.").notEmpty();
    req.checkBody("tps", "TPS is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var id = req.body.id;
        var tps = req.body.tps;

        var persistents = global.persistents.filter(function(o) { return o.id == id });
        if (persistents.length > 0) {
            var persistent = persistents[0];
            persistent.tps = tps;
            res.send({});
        } else {
            res.status(400).send( {error: 'persistent ' + id +' is not there.'} );
        }
    }
});

router.post('/persistent/stop', function(req, res) {
    req.checkBody("id", "Persistent ID is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var id = req.body.id;

        var persistents = global.persistents.filter(function(o) { return o.id == id });
        if (persistents.length > 0) {
            var persistent = persistents[0];
            persistent.status = 1;
            res.send({});
        } else {
            res.status(400).send( {error: 'persistent ' + id +' is not there.'} );
        }
    }
});

router.post('/order/', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;
        var is_active_only = req.body.is_active == undefined ? 0 : parseInt(req.body.is_active);
        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            res.send(is_active_only ? client.orders.filter(function(o) { return o.ordStatus != 2 }) : client.orders );
        } else {
            res.status(400).send( {error: client_id+' is not there.'} );
        }
    }
});

router.post('/order/search', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;
        var order_id = req.body.order_id;
        var secondary_order_id = req.body.secondary_order_id;
        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            var f_orders = [];

            if (order_id != undefined) {
                f_orders = client.orders.filter(function(o) { return o.ordId == order_id });
            } else {
                f_orders = client.orders.filter(function(o) { return o.secondaryOrdId == secondary_order_id });
            }

            res.send(f_orders);
        } else {
            res.status(400).send( {error: client_id+' is not there.'} );
        }
    }
});

router.post('/order/purge', function(req, res) {
    req.checkBody("id", "Client ID is required.").notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        log.error("ERROR:"+errors);
        res.status(400).send( {error: errors});
    } else {
        var client_id = req.body.id;

        if (global.clients.has(client_id)) {
            var client = global.clients.get(client_id);
            client.orders = [];
            res.send({});
        } else {
            res.status(400).send( {error: client_id+' is not there.'} );
        }
    }
});

module.exports = router;
