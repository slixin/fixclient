var fs = require('fs');
var moment = require('moment');
var path = require('path');

var dictPath = require("path").join(__dirname, "dict");

var getDictionary = exports.getDictionary = function(dict_file_name, cb) {
    fs.readFile(dictPath+'/'+dict_file_name+'.json', 'utf8', function (err, data) {
        if (err) cb(err, null);
        else cb(null, JSON.parse(data));
    });
}

var uuid = exports.uuid = function() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

var randomString = exports.randomString = function(seed, length){
    var text = "";
    var possible = seed == undefined ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" : seed;

    for( var i=0; i < length; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

var randomDouble = exports.randomDouble = function(min, max, round) {
    return (Math.random() < 0.5 ? ((1-Math.random()) * (max-min) + min) : (Math.random() * (max-min) + min)).toFixed(round == undefined ? 2 : round);
}
