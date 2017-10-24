var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var dict = require('dict');
var validator = require('express-validator');
var routes = require('./routes/index');

var app = express();

// ######### Global Variable ######
global.clients = dict(); // Fix Clients
global.persistents = []; // Persistent running

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(validator({}));

app.use('/', routes);

var monitor_persistent = function() {
    var running_persistents = global.persistents.filter(function(o) { return o.status == 0 });
    if (running_persistents.length > 0) {
        running_persistents.forEach(function(persistent) {
            var client = global.clients.get(persistent.client_id);
            if (client != undefined) {
                for(var i=0; i<persistent.tps; i++) {
                    setTimeout(function() {
                      client.instance.sendMsg(persistent.message, function(msg) { });
                    }, i)
                }
                persistent.escaped += 1;
                if(persistent.escaped == persistent.duration) {
                    persistent.status = 1;
                }
            } else {
                persistent.status = 1;
            }
        });
    }

    global.persistents = global.persistents.filter(function(el){ return el.status == 0; });
}

setInterval(monitor_persistent, 1000);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

process.on('uncaughtException', function (err) {
    console.log(err.stack);
    clearInterval(monitor_persistent);
});

module.exports = app;
