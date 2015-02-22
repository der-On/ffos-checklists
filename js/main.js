"use strict";

localforage.config({
  name: 'osm-trip',
  version: 1.0,
  storeName: 'db',
  description: ''
});
localforage.setDriver('indexedDB');

var l10n = require('./../lib/l10n');
var App = require('./../lib/app');
var app = new App();
var Map = require('./../lib/map');
var map = new Map(app);
var Ui = require('./../lib/ui');
var ui = new Ui(app, map);
map.ui = ui;
map.init();
ui.init();
app.map = map;
app.ui = ui;
app.init();
window.app = app;

var Tests = require('./../lib/tests');
window.tests = new Tests(app, map, ui);