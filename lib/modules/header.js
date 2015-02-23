"use strict";

var m = require('mithril');

function controller(mainCtrl)
{
  var ctrl = {
    mainCtrl: mainCtrl
  };

  ctrl.closeChecklist = function()
  {
    ctrl.mainCtrl.checklist.edit = false;
    ctrl.mainCtrl.checklist = null;
  };

  ctrl.editChecklist = function()
  {
    ctrl.mainCtrl.checklist.edit = true;
  };

  ctrl.saveChecklist = function()
  {
    var checklist = ctrl.mainCtrl.checklist;
    checklist.edit = false;
    m.startComputation();
    checklist.save(true, checklist.filename)
    .then(function() {
      m.endComputation();
    })
    .catch(function(err) {
      console.error(err);
      alert(t('errors.checklist.save'));
      m.endComputation();
    });
  };

  return ctrl;
}

function listView(ctrl)
{
  return m('section.header[role="region"]',
    m('header', [
      m('h1', t('Checklists'))
    ])
  );
}

function checklistView(ctrl)
{
  var checklist = ctrl.mainCtrl.checklist;

  return m('section.header[role="region"]',
    m('header', [
      m('menu[type="toolbar"]', [
        checklist.edit ?
          m('a.button[href="javascript:;"', {
            onclick: ctrl.saveChecklist
          }, t('done'))
          : m('a.button[href="javascript:;"', {
          onclick: ctrl.editChecklist
        }, t('edit'))
      ]),
      m('a[href="javascript:;"', {
        onclick: ctrl.closeChecklist,
        title: t('back')
      }, m('span.icon.icon-back')),
      m('h1', checklist.edit ? m('input[type="text"]', {
        value: checklist.name,
        oninput: function(e)
        {
          var value = e.target.value;
          checklist.name = value;
        }
      }) : checklist.name)
    ])
  );
}

function view(ctrl)
{
  return ctrl.mainCtrl.checklist ?
  checklistView(ctrl) : listView(ctrl);
}

module.exports = {
  controller: controller,
  view: view
};