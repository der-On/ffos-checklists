"use strict";

var m = require('mithril');
var promisify = require('./promisify');
var Checklist = require('./checklist');
var fs = require('ffos-fs');

function controller() {
  var ctrl = {
    checklist: null,
    checklists: []
  };

  ctrl.loading = false;

  ctrl.loadChecklists = function()
  {
    ctrl.loading = true;
    m.redraw();

    m.startComputation();
    ctrl.checklists.splice(0, ctrl.checklists.length);

    // load checklists
    promisify(fs, fs.readdir, 'sdcard:checklists')
    .then(function(files) {
      files = files.filter(function(file) {
        return (file.name.substr(-('.checklist.json').length) === '.checklist.json');
      });

      return Promise.series(files.map(function(file) {
        var p = Checklist.load('sdcard:' + file.name)
        .then(function(checklist) {
          ctrl.checklists.push(checklist);
        })
        .catch(function(err) {
          console.error(err);
        });

        return p;
      }));
    })
    .then(function() {
      ctrl.loading = false;
      m.endComputation();
    })
    .catch(function() {
      ctrl.loading = false;
      m.endComputation();
    });
  };

  ctrl.headerModule = m.submodule(require('./modules/header'), ctrl);
  ctrl.checklistsModule = m.submodule(require('./modules/checklists'), ctrl);
  ctrl.checklistModule = m.submodule(require('./modules/checklist'), ctrl);

  ctrl.loadChecklists();

  return ctrl;
}

function view(ctrl)
{
  return [
    ctrl.headerModule(),
    ctrl.loading ? m('p', t('Loading checklists')) : null,
    ctrl.checklist ? ctrl.checklistModule() : ctrl.checklistsModule()
  ]
}

module.exports = function()
{
  m.module(document.getElementById('app'), {
    controller: controller,
    view: view
  })
};