"use strict";

module.exports = function(Promise)
{
  Promise.series = function(promises) {
    var promises = promises.slice();

    return new Promise(function(resolve, reject) {
      function next()
      {
        if (promises.length) {
          var promise = promises.shift();

          promise
          .then(next)
          .catch(reject);
        }
        else {
          resolve();
        }
      }

      next();
    });
  }
};