"use strict";

var m = require('mithril');
var fs = require('ffos-fs');
var promisify = require('../promisify');
var Checklist = require('../checklist');

function controller(mainCtrl)
{
  var ctrl = {
    mainCtrl: mainCtrl,
    newName: ''
  };

  ctrl.open = function(checklist) {
    ctrl.mainCtrl.checklist = checklist;
  };

  function checklistIndexByFilename(filename)
  {
    for (var i = 0; i < ctrl.mainCtrl.checklists.length; i++) {
      if (ctrl.mainCtrl.checklists.filename === filename) return i;
    }

    return -1;
  }

  ctrl.add = function() {
    var name = ctrl.newName.trim();
    if (!name.length) return;

    ctrl.newName = '';

    var checklist = Checklist({
      name: name
    });

    m.startComputation();
    checklist.save()
    .then(function() {
      checklist.edit = true;
      if (checklist.overwriten) {
        var index = checklistIndexByFilename(checklist.filename);
        ctrl.mainCtrl.checklists.splice(index, 1, checklist);
      }
      else {
        ctrl.mainCtrl.checklists.push(checklist);
      }

      mainCtrl.checklist = checklist;
      m.endComputation();
    })
    .catch(function() {
      m.endComputation();
      alert(t('errors.checklist.create'));
    });

    return false;
  };

  ctrl.remove = function(index)
  {
    var checklist = ctrl.mainCtrl.checklists[index];
    if (checklist) {
      if (confirm(t('Are you sure you want to remove this checklist?'))) {
        ctrl.mainCtrl.checklists.splice(index, 1);

        m.startComputation();
        promisify(fs, fs.unlink, checklist.filename)
        .then(function() {
          m.endComputation();
        })
        .catch(function() {
          alert(t('errors.checklist.remove'));
          m.endComputation();
        });
      }
    }
  };

  return ctrl;
}

function checklistView(ctrl, checklist, i) {
  return m('li', [
    m('aside.pack-end',
        m('a.gaia-icon.icon-delete[href="javascript:;"]', {
          onclick: ctrl.remove.bind(ctrl, i),
          title: t('remove')
        })
    ),
    m('p', [
      m('a[href="javascript:;"', {
        onclick: ctrl.open.bind(ctrl, checklist)
      }, checklist.name)
    ]),
  ]);
}

function view(ctrl)
{
  return [
    ctrl.mainCtrl.checklists.length ?
    m('ul[data-type="list"]', ctrl.mainCtrl.checklists.map(checklistView.bind(null, ctrl)))
    : m('ul[data-type="list"]', m('li', m('p', t('No checklists yet.')))),

    m('input[type="text"]', {
      placeholder: t('Name for new checklist'),
      oninput: function(e) {
        var el = e.target;
        var value = el.value;
        ctrl.newName = el.value;
      },
      onkeyup: function(e) {
        if (e.keyCode === 13) {
          ctrl.add();
          e.target.blur();
        }
      },
      value: ctrl.newName
    }),
    m('a.button', {
      onclick: ctrl.add
    }, t('create checklist'))
  ]
}

module.exports = {
  controller: controller,
  view: view
};