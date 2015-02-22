"use strict";

/**
 * Creates a promise out of a async function call that takes a callback as last argument
 * @param thisArg {Object} - object to call the function on
 * @param fn {Function} - function to call (must take callback as last argument)
 * @param arg1 ... argN - any number of arguments to be passed to the function (except the callback)
 * @returns {Promise}
 */
module.exports = function(/*thisArg, fn, arg1, arg..., argN*/)
{
  var args = Array.prototype.slice.call(arguments);

  var self = args.shift();
  var fn = args.shift();

  return new Promise(function(resolve, reject) {
    function callback() {
      var args = Array.prototype.slice.call(arguments);
      var err = args.shift();

      if (err) {
        reject(err);
        return;
      }

      resolve.apply(null, args);
    }

    args.push(callback);
    fn.apply(self, args);
  });
};