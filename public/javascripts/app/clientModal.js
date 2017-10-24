app.controller('ClientModalCtrl', function ModalInstanceCtrl ($scope, $uibModalInstance, clientForm, client) {
    $scope.form = {}
    $scope.client = client;
    $scope.submitForm = function (client) {
        if ($scope.form.clientForm.$valid) {
            var newClient = {
                version: client.version,
                sender: client.sender,
                target: client.target,
                host: client.host,
                port: client.port,
                dictionary: client.dictionary,
                reset_seqnum: client.reset_seqnum,
                // options: client.options,
                isconnected: false
            }
            $uibModalInstance.close(newClient);
        }
    };

    $scope.cancel = function () {
        $uibModalInstance.dismiss(null);
    };

    var newguid = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
});
