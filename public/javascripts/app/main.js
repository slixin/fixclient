app.controller('ctrlMain', ['$scope','$routeParams', '$http', 'moment','Notification', '$uibModal', function($scope, $routeParams, $http, moment, Notification, $uibModal) {
    $scope.clients = null;
    $scope.egg_count = 0;

    var showForm = function (client, callback) {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'views/modal-client.html',
            controller: 'ClientModalCtrl',
            size: 'md',
            scope: $scope,
            resolve: {
                clientForm: function () {
                    return $scope.clientForm;
                },
                client: function() {
                    if (client != undefined)
                        return client;
                    else
                        return {};
                }
            }
        });

        modalInstance.result.then(function (result) {
            callback(result);
        }, null);
    };

    $scope.loadClients = function() {
        $http.post('/client', {
        }).then(function(resp) {
            if (resp.data) {
                $scope.clients = resp.data;
            }
        }, function(err) {
            $scope.clients = [];
        });
    }

    $scope.onCreate = function() {
        showForm(undefined, function(result){
            if (result != undefined)
            {
                var client = result;
                $http.post('/client/create', {
                    "host": client.host,
                    "port": client.port,
                    "senderid": client.sender,
                    "targetid": client.target,
                    "version": client.version,
                    "dictionary": client.dictionary,
                    "reset_seqnum": client.reset_seqnum
                    // "options": client.options
                }).then(function(resp) {
                    if (resp.data) {
                        var id = resp.data.id;
                        Notification({message: 'New client '+id+' is created.', delay: 2000});
                    }
                }, function(err) {
                    Notification({message: 'Error:'+ err.data.error, delay: 2000});
                });
            }
        });
    }

    $scope.onEgg = function() {
        if ($scope.egg_count == 10) {
            $scope.egg_count = 0;
            Notification({message: 'Owner: Steve Li (steve.li.xin@gmail.com)', delay: 10000});
        } else {
            $scope.egg_count+=1;
        }
    }
}]);

