app.controller('HelpModalCtrl', function ModalInstanceCtrl ($scope, $uibModalInstance, helpForm) {
    $scope.form = {}

    $scope.cancel = function () {
        $uibModalInstance.dismiss(null);
    };
});
