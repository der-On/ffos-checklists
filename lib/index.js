"use strict";

require('es6-promise').polyfill();
require('./extend_promises')(Promise);
var global = (window || global);
var translate = require('translate.js');
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
var req = new XMLHttpRequest();
req.open('GET', 'locales/' + locale + '.json', true);
req.responseType = 'json';
req.onload = function()
{
  var data = req.response;

  global.t = translate(data, {
    debug: true,
    namespaceSplitter: '.'
  });

  app();
};
req.onerror = function(error)
{
  if (err) throw err;
};
req.send();