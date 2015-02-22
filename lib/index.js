"use strict";

require('es6-promise').polyfill();
require('./extend_promises')(Promise);
var global = (window || global);
var translate = require('translate.js');
var request = require('superagent');
var t = global.t = null;
var locale = 'en';
var m = require('mithril');

var fs = require('ffos-fs');

// set filesystem to in memory mock mode if its not supported
if (!navigator.getDeviceStorage) {
  fs.mock();
  var Checklist = require('./checklist');
  var checklist = Checklist({
    name: 'test',
    items: ['test1', 'test2', 'test3', 'test4']
  });

  checklist.save();
}

// extend mithril with submodule method
m.submodule = function(/*module, arg1, ..., argN*/) {
  var args = Array.prototype.slice.call(arguments);
  var module = args.shift();

  return module.view.bind(this, module.controller.apply(this, args));
};

var app = require('./app');

// load translations
request.get('/locales/' + locale + '.json',
  function(err, res) {
    if (err) throw err;

    global.t = translate(res.body, {
      debug: true,
      namespaceSplitter: '.'
    });

    app();
  }
);