app.controller('ctrlClient', ['$scope','$routeParams', '$window', '$http', '$interval', 'moment','Notification', function($scope, $routeParams, $window, $http, $interval, moment, Notification) {
    $scope.client_id = $routeParams.clientId;
    $scope.client = null;
    $scope.selectedItem = null;
    $scope.message = {
        'text': null,
        'mode': 1,
        'count': null,
        'tps': null,
        'duration': null
    }
    $scope.ignoreCommonFields = true;

    $scope.viewmodes = [{ id: 1, name: "JSON"}, { id: 2, name: "FIX"}, { id: 3, name: "SIMPLE"}];
    $scope.selected_viewmode = 3;
    $scope.messagemodes = [{ id: 1, name: "SINGLE"}, { id: 2, name: "BURST"}, { id: 3, name: "PERSISTENT"}];
    $scope.message.mode = 1;

    $scope.max_log_count = 1000;

    $scope.persistents = null;
    $scope.isRefreshing = {
        active_persistent: false,
        session_info: false
    };

    var timer_persistent = null;
    var timer_sessionInfo = null;
    var SOHCHAR = String.fromCharCode(1);

    var get_client = function() {
        $http.post('/client', {
            "id": $scope.client_id
        }).then(function(resp) {
            if (resp.data) {
                $scope.client = resp.data;
            }
        }, function(err) {
            Notification({message: 'Error:'+ err.data.error, delay: 2000});
            $window.location.href = '/';
        });
    }

    var convertToFIX = function(json) {
        var fixmsg = null;

        for (var key in json) {
            if (json.hasOwnProperty(key)) {
                var value = json[key];
                if (Array.isArray(value)) {
                    fixmsg += key+'='+value.length+SOHCHAR;
                    fixmsg += convertToFIX(value);
                } else {
                    if (fixmsg == undefined) {
                        fixmsg = key+'='+value+SOHCHAR;
                    } else {
                        fixmsg += key+'='+value+SOHCHAR;
                    }
                }
            }
        }

        return fixmsg;
    }

    var convertToSimple = function(json) {
        var displaymsg = null;
        displaymsg = json['35'] + ' - '

        if ('54' in json)
            if (json['54'] == 1)
                displaymsg += 'BUY '
            else
                displaymsg += 'SELL '

        if ('55' in json)
            if ('48' in json)
                displaymsg += json['55'] + '@'+ json['207'] + '('+json['48']+') '
            else
                displaymsg += json['55'] + '@'+ json['207'] +' '

        if ('38' in json)
            if ('44' in json)
                displaymsg += json['38'] + '@' + json['44'] +', '
            else
                displaymsg += json['38'] + '@Market'

        if ('39' in json)
            displaymsg += 'OrdStatus:' + json['39'] + ', '

        if ('150' in json)
            displaymsg += 'ExecType:' + json['150'] + ', '

        if ('198' in json)
            displaymsg += 'SecondaryOrderID:' + json['198'] + ', '

        if ('31' in json)
            displaymsg += 'LastPx:' + json['31'] + ', '

        if ('32' in json)
            displaymsg += 'LastQty:' + json['32'] + ', '

        if ('151' in json)
            displaymsg += 'LeavesQty:' + json['151'] + ', '

        if ('141' in json)
            displaymsg += 'ResetSeqNumFlag:' + json['141']

        return displaymsg;
    }

    var get_message_log = function() {
        $http.post('/message', {
            "id": $scope.client_id,
            "max": $scope.max_log_count == undefined ? 1000 : (!$.isNumeric($scope.max_log_count) ? 1000 : parseInt($scope.max_log_count))
        }).then(function(resp) {
            if (resp.data) {
                var messagelogs = resp.data;
                $scope.rowCollection = [];

                messagelogs.forEach(function(messagelog) {
                    var item = {
                        time: messagelog.time,
                        direction: messagelog.direction,
                        json: messagelog.json,
                        fixmsg: convertToFIX(messagelog.json),
                        display: convertToSimple(messagelog.json)
                    }
                    $scope.rowCollection.push(item);
                })
            }
        }, function(err) {
            Notification({message: 'Error:'+ err.data.error, delay: 2000});
        });
    }

    var buildFields = function(json, ignoreCommonFields) {
        var fields = [];
        for (var key in json) {
            if (json.hasOwnProperty(key)) {
                if (ignoreCommonFields && key in ['8','9','10','49','56','115','128','34','43','52','122']) {
                    continue;
                } else {
                    var value = json[key];
                    if (Array.isArray(value)) {
                        fields.push({
                            'name': key,
                            'value': value.length
                        });
                        fields = fields.concat(buildFields(value));
                    } else {
                        fields.push({
                            'name': key,
                            'value': json[key]
                        });
                    }
                }
            }
        }
        return fields;
    }

    var get_persistent_runs = function() {
        $http.post('/persistent', {
            "id": $scope.client.id
        }).then(function(resp) {
            if (resp.data) {
                $scope.persistents = [];
                var persistent_runs = resp.data;
                if (persistent_runs != undefined) {
                    if (persistent_runs.length > 0) {
                        var active_persistent_runs = persistent_runs.filter(function(o) { return o.status == 0});
                        if (active_persistent_runs.length > 0) {
                            $scope.persistents = active_persistent_runs;
                        }
                    }
                }
            }
        }, function(err) {
            Notification({message: 'Error:'+ err.data.error, delay: 2000});
        });
    }

    get_client();
    get_message_log();



    $scope.$on('$destroy', function () {
        $interval.cancel(timer_persistent);
    });

    $scope.$watch('rowCollection', function(newValue, oldValue) {
        if (newValue != undefined){
            var selectedItems = newValue.filter(function(item) { return item.isSelected });
            if (selectedItems.length > 0){
                $scope.selectedItem = buildFields(selectedItems[0].json, $scope.ignoreCommonFields);
            } else {
                $scope.selectedItem = null;
            }
        }
    }, true);

    $scope.$watch('ignoreCommonField', function(newValue, oldValue) {
        if (newValue != oldValue){
            var selectedItems = newValue.filter(function(item) { return item.isSelected });
            if (selectedItems.length > 0)
                $scope.selectedItem = buildFields(selectedItems[0].json, newValue);
        }
    }, true);

    $scope.$watch('selected_viewmode', function(newValue, oldValue) {
        if (newValue != oldValue){
            switch(newValue) {
            case 1:
                $scope.rowCollection.forEach(function(row) {
                    row.display = row.json;
                });
                break;
            case 2:
                $scope.rowCollection.forEach(function(row) {
                    row.display = convertToFIX(row.json);
                });
                break;
            case 3:
                $scope.rowCollection.forEach(function(row) {
                    row.display = convertToSimple(row.json);
                });
                break;
        }
        }
    })

    $scope.onStopPersistent = function(persistent) {
        bootbox.confirm("Are you sure you want to stop the persistent run?", function(result) {
            if (result)
            {
                $http.post('/persistent/stop', {
                    "id": persistent.id
                }).then(function(resp) {
                    if (resp.data) {
                        Notification({message: 'Persistent run '+persistent.id+' is stopped.', delay: 2000});
                    }
                }, function(err) {
                    Notification({message: 'Error:'+ err.data.error, delay: 2000});
                });
            }
        });
    }

    $scope.onDelete = function() {
        bootbox.confirm("Are you sure you want to delete the client?", function(result) {
            if (result)
            {
                $http.post('/client/delete', {
                    "id": $scope.client.id
                }).then(function(resp) {
                    if (resp.data) {
                        var id = resp.data.id;
                        Notification({message: 'Client '+id+' is deleted.', delay: 2000});
                        $window.location.href = '/';
                    }
                }, function(err) {
                    Notification({message: 'Error:'+ err.data.error, delay: 2000});
                });
            }
        });
    }

    $scope.onConnect = function() {
        $http.post('/client/logon', {
            "id": $scope.client.id
        }).then(function(resp) {
            if (resp.data) {
                $scope.client.isconnected = true;
                setTimeout(function() {
                    get_message_log();
                },500);
            }
        }, function(err) {
            Notification({message: 'Error:'+ err.data.error, delay: 2000});
        });
    }

    $scope.onDisconnect = function() {
        $http.post('/client/logoff', {
            "id": $scope.client.id
        }).then(function(resp) {
            if (resp.data) {
                $scope.client.isconnected = false;
            }
        }, function(err) {
            Notification({message: 'Error:'+ err.data.error, delay: 2000});
        });
    }

    $scope.onSend = function() {
        switch($scope.message.mode) {
            case 1:
                $http.post('/message/send', {
                    "id": $scope.client.id,
                    "message": $scope.message.text
                }).then(function(resp) {
                    if (resp.data) {
                        Notification({message: 'Message be sent out', delay: 2000});
                        setTimeout(function() {
                            get_message_log();
                        },500);
                    }
                }, function(err) {
                    Notification({message: 'Error:'+ err.data.error, delay: 2000});
                });
                break;
            case 2:
                if ($scope.message.count == undefined || !$.isNumeric($scope.message.count)) {
                    Notification({message: 'Count is mandatory for Burst mode', delay: 2000});
                } else {
                    $http.post('/message/burst', {
                        "id": $scope.client.id,
                        "message": $scope.message.text,
                        "count": $scope.message.count
                    }).then(function(resp) {
                        if (resp.data) {
                            Notification({message: 'Burst sending is started', delay: 2000});
                        }
                    }, function(err) {
                        Notification({message: 'Error:'+ err.data.error, delay: 2000});
                    });
                }
                break;
            case 3:
                if ($scope.message.tps == undefined || !$.isNumeric($scope.message.tps) || $scope.message.duration == undefined || !$.isNumeric($scope.message.duration)) {
                    Notification({message: 'TPS and Duration(seconds) are mandatory for Persistent mode', delay: 2000});
                } else {
                    if ($scope.message.tps > 1000) {
                        Notification({message: 'Maximum TPS is 1000.', delay: 2000});
                    } else {
                        $http.post('/persistent/create', {
                            "id": $scope.client.id,
                            "message": $scope.message.text,
                            "tps": $scope.message.tps,
                            "duration": $scope.message.duration
                        }).then(function(resp) {
                            if (resp.data) {
                                Notification({message: 'Persistent run is started', delay: 2000});
                            }
                        }, function(err) {
                            Notification({message: 'Error:'+ err.data.error, delay: 2000});
                        });
                    }
                }
                break;
        }
    }

    $scope.onRefresh = function() {
        get_message_log();
    }

    $scope.onErase = function() {
        $http.post('/message/purge', {
            "id": $scope.client.id
        }).then(function(resp) {
            if (resp.data) {
                setTimeout(function() {
                    get_message_log();
                },500);
            }
        }, function(err) {
            Notification({message: 'Error:'+ err.data.error, delay: 2000});
        });
    }

    $scope.onActivePersistentRunsPanel = function() {
        timer_persistent = $interval(get_persistent_runs, 1000);
        $scope.isRefreshing.active_persistent = true;
    }

    $scope.offActivePersistentRunsPanel = function() {
        if (timer_persistent != undefined) {
            $interval.cancel(timer_persistent);
        }
        $scope.isRefreshing.active_persistent = false;
    }

    $scope.onSessionInformationPanel = function() {
        timer_sessionInfo = $interval(get_client, 1000);
        $scope.isRefreshing.session_info = true;
    }

    $scope.offSessionInformationPanel = function() {
        if (timer_sessionInfo != undefined) {
            $interval.cancel(timer_sessionInfo);
        }
        $scope.isRefreshing.session_info = false;
    }
}]);




