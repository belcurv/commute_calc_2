(function () {
    'use strict';

    angular

        .module('commuteApp', [])

        .factory('gmapsDistanceAPI', ['$rootScope', '$q', function ($rootScope, $q) {

            return function (oA, oB, d) {
                var deferred = $q.defer(),
                    service,
                    
                    // google maps request object
                    request = {
                        origins: [oA, oB],
                        destinations: [d],
                        travelMode: google.maps.TravelMode.DRIVING,
                        avoidHighways: false,
                        avoidTolls: false,
                        unitSystem: google.maps.UnitSystem.IMPERIAL
                    };

                function callback(results, status) {
                    if (status === google.maps.DistanceMatrixStatus.OK) {
                        $rootScope.$apply(function () {
                            return deferred.resolve(results);
                        });
                    } else {
                        $rootScope.$apply(function () {
                            return deferred.reject(status);
                        });
                    }
                }

                service = new google.maps.DistanceMatrixService();
                service.getDistanceMatrix(request, callback);
                return deferred.promise;
            };
        }])
    
        .factory('commuteMath', [function () {
            
            // calculate total round-trip cost for one origin commute to destination
            function oneOriginTotalCost(miles, hours, mileageRate, hourlyRate) {
                return (2 * (miles * mileageRate + hours * hourlyRate));
            }
            
            // convert response object distance from meters to miles
            function metersToMiles(meters) {
                return meters / 1609.344;
            }
            
            // convert response object duration from seconds to hours
            function secondsToHours(seconds) {
                return seconds / 3600;
            }
            
            // subtract B from A, return a positive number
            // assumes 20 work days per month (4 weeks * 5 days)
            // assumes params are round-trip costs
            function costDiff(costA, costB) {
                return 20 * (Math.abs(costA - costB));
            }
            
            // build array from distance and duration
            function buildArray(miles, hours, rate, rtMult, wage) {
                var arr = [];

                arr = [{
                    per: "Day",
                    time: rtMult * hours,
                    dist: rtMult * miles,
                    carCost: rtMult * miles * rate,
                    timeCost: rtMult * hours * wage
                }, {
                    per: "Week",
                    time: rtMult * hours * 5,
                    dist: rtMult * miles * 5,
                    carCost: rtMult * miles * rate * 5,
                    timeCost: rtMult * hours * wage * 5
                }, {
                    per: "Month",
                    time: rtMult * hours * 260 / 12,
                    dist: rtMult * miles * 260 / 12,
                    carCost: rtMult * miles * rate * 260 / 12,
                    timeCost: rtMult * hours * wage * 260 / 12
                }, {
                    per: "Year",
                    time: rtMult * hours * 260,
                    dist: rtMult * miles * 260,
                    carCost: rtMult * miles * rate * 260,
                    timeCost: rtMult * hours * wage * 260
                }, {
                    per: "5 Years",
                    time: rtMult * hours * 260 * 5,
                    dist: rtMult * miles * 260 * 5,
                    carCost: rtMult * miles * rate * 260 * 5,
                    timeCost: rtMult * hours * wage * 260 * 5
                }, {
                    per: "10 Years",
                    time: rtMult * hours * 260 * 10,
                    dist: rtMult * miles * 260 * 10,
                    carCost: rtMult * miles * rate * 260 * 10,
                    timeCost: rtMult * hours * wage * 260 * 10
                }];

                return arr;
            }
            
            return {
                oneOriginTotalCost: oneOriginTotalCost,
                metersToMiles: metersToMiles,
                secondsToHours: secondsToHours,
                costDiff: costDiff,
                buildArray: buildArray
            };
                        
        }])

        .controller('commuteController', ['gmapsDistanceAPI', 'commuteMath', function (gmapsDistanceAPI, commuteMath) {

            var vm = this;

            vm.myObj = {
                originA: "53207",
                originB: "53005",
                destination: "53154",
                mileageRate: 0.54,
                hourlyRate: 20,
                roundTripFlag: 2, // 1 = 1-way, 2 = round-trip
                commuteArr: [],
                responseObj: {}
            };

            vm.calcCommute = function (originA, originB, destination) {
                // call factory, get back a promise
                gmapsDistanceAPI(originA, originB, destination)
                    .then(function (response) {
                    
                        // init local variables
                        var milesA, milesB, hoursA, hoursB,
                            totalCostCommuteA, totalCostCommuteB;

                        // for diagnostics
                        // console.log(response);
                        vm.myObj.responseObject = response;

 
                        // capture converted distance & duration
                        milesA = commuteMath.metersToMiles(response.rows[0].elements[0].distance.value);
                        milesB = commuteMath.metersToMiles(response.rows[1].elements[0].distance.value);
                        hoursA = commuteMath.secondsToHours(response.rows[0].elements[0].duration.value);
                        hoursB = commuteMath.secondsToHours(response.rows[1].elements[0].duration.value);


                        // determine which commute is cheaper and bind to model
                        totalCostCommuteA = commuteMath.oneOriginTotalCost(milesA, hoursA, vm.myObj.mileageRate, vm.myObj.hourlyRate);
                        totalCostCommuteB = commuteMath.oneOriginTotalCost(milesB, hoursB, vm.myObj.mileageRate, vm.myObj.hourlyRate);
                        if (totalCostCommuteA < totalCostCommuteB) {
                            // A is cheaper
                            vm.myObj.closerOrigin = {
                                id: "Origin A",
                                address: response.originAddresses[0]
                            };
                        } else {
                            // B is cheaper
                            vm.myObj.closerOrigin = {
                                id: "Origin B",
                                address: response.originAddresses[1]
                            };
                        }
                        

                        // calculate total monthly cost difference,
                        vm.myObj.costDiff = commuteMath.costDiff(totalCostCommuteA, totalCostCommuteB);


                        // build arrays for results tables
                        // @params (miles, hours, rate, rtMult, wage)
                        vm.myObj.commuteArrA = commuteMath.buildArray(milesA, hoursA, vm.myObj.mileageRate, vm.myObj.roundTripFlag, vm.myObj.hourlyRate);
                        vm.myObj.commuteArrB = commuteMath.buildArray(milesB, hoursB, vm.myObj.mileageRate, vm.myObj.roundTripFlag, vm.myObj.hourlyRate);
                    
                    });
            };

        }]);
}());