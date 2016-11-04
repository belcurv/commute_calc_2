(function() {
   'use strict';

   angular

   .module('commuteApp', [])

   .factory('gmapsDistanceAPI', ['$rootScope', '$q', function($rootScope, $q) {

      // fetch distance matrix from google.maps
      // @params  [string] oA    [Origin A address]
      // @params  [string] oB    [Origin B address]
      // @params  [string] d     [Destination address]
      // @returns [object]       [Returns deferred promise]
      return function(oA, oB, d) {
         
         // init variables and deferred promise
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

         // Distance Matrix Service callback
         // @params  [object]   results   [gMaps distance matrix object]
         // @params  [string]   status    [gMaps response status code]
         // @returns [object]   deferred.resolve()
         function callback(results, status) {
            if (status === 'OK') {
               $rootScope.$apply(function() {
                  return deferred.resolve(results);
               });
            } else {
               $rootScope.$apply(function() {
                  return deferred.reject(status);
               });
            }
         }

         service = new google.maps.DistanceMatrixService();
         service.getDistanceMatrix(request, callback);
         return deferred.promise;
      };
   }])

   .factory('commuteMath', [function() {

      // calculate total round-trip cost from one origin to destination
      // @params  [number] miles       [one-way distance from origin to dest]
      // @params  [number] hours       [one-way duration from origin to dest]
      // @params  [number] mileageRate [money cost per mile]
      // @params  [number] hourlyRate  [money cost per hour]
      // @returns [number]             [total round trip cost]
      function oneOriginTotalCost(miles, hours, mileageRate, hourlyRate) {
         return (2 * (miles * mileageRate + hours * hourlyRate));
      }

      // convert response object distance from meters to miles
      // @params  [number] meters   [distance value from gmaps response object]
      // @returns [number]          [distance in miles]
      function metersToMiles(meters) {
         return meters / 1609.344;
      }

      // convert response object duration from seconds to hours
      // @params  [number] seconds  [duration value from gmaps response object]
      // @returns [number]          [value in hours]
      function secondsToHours(seconds) {
         return seconds / 3600;
      }

      // subtract commute costs, multiply by weeks days per month (260/12)
      // @params  [number] costA [round-trip cost from originA to destination]
      // @params  [number] costB [round-trip cost from originB to destination]
      // @returns [number]       [positive cost difference between commutes]
      function costDiff(costA, costB) {
         return (260/12) * (Math.abs(costA - costB));
      }

      // build array from distance and duration.
      // multiplier array elements are function of 260 week days per year.
      // Examples:
      //   "Day" multiplier is 1 (260/260) "week days per day"
      //   "Week" multiplier is 5 (260/52) "week days per week"
      //   "Month" multiplier is ~21.67 (260/12) "week days per month"
      // @params  [number] miles    [one-way distance from origin to dest]
      // @params  [number] hours    [one-way duration from origin to dest]
      // @params  [number] rate     [money cost per mile]
      // @params  [number] rtMult   [rount-trip multiplier, either 1 or 2]
      // @params  [number] wage     [money cost per hour]
      // @returns [array]           [matrix of time periods and costs]   
      function buildArray(miles, hours, rate, rtMult, wage) {
         var i,
             arr = [],
             label = ["Day", "Week", "Month", "Year", "5 Years", "10 Years"],
             multiplier = [(260 / 260), (260 / 52), (260 / 12), 260, (260 * 5), (260 * 10)];

         for (i = 0; i < label.length; i += 1) {
            arr.push({
               per: label[i],
               time: rtMult * hours * multiplier[i],
               dist: rtMult * miles * multiplier[i],
               carCost: rtMult * miles * rate * multiplier[i],
               timeCost: rtMult * hours * wage * multiplier[i]
            });
         }
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

   .controller('commuteController', ['gmapsDistanceAPI', 'commuteMath', function(gmapsDistanceAPI, commuteMath) {

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

      // main exec block
      // Calls gmapsDistanceAPI factory, which returns a promise.
      // The promise calls anon function, which calls various
      // functions from commuteMath factory.
      // @params  [string] originA     [origin address A]
      // @params  [string] originB     [origin address B]
      // @params  [string] destination [destination address]
      vm.calcCommute = function(originA, originB, destination) {
         gmapsDistanceAPI(originA, originB, destination)
            .then(function(response) {

               // bind whole response to model
               vm.myObj.responseObject = response;
            
               // init local variables
               var milesA, milesB, hoursA, hoursB,
                   totalCostCommuteA, totalCostCommuteB;

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

               // calculate total monthly cost difference & bind to model
               vm.myObj.costDiff = commuteMath.costDiff(totalCostCommuteA, totalCostCommuteB);

               // build arrays for results tables and bind to model
               vm.myObj.commuteArrA = commuteMath.buildArray(milesA, hoursA, vm.myObj.mileageRate, vm.myObj.roundTripFlag, vm.myObj.hourlyRate);
               vm.myObj.commuteArrB = commuteMath.buildArray(milesB, hoursB, vm.myObj.mileageRate, vm.myObj.roundTripFlag, vm.myObj.hourlyRate);

            });
      };

   }]);
}());