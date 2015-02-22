"use strict";

var m = require('mithril');

function controller(mainCtrl)
{
  var ctrl = {
    mainCtrl: mainCtrl,
    newItem: ''
  };

  ctrl.add = function()
  {
    var item = ctrl.newItem.trim();
    if (!item.length) return;

    ctrl.newItem = '';
    ctrl.mainCtrl.checklist.addItem(item);

    return false;
  };

  return ctrl;
}

function itemView(checklist, item, i)
{
  return m('li',
    m('p', [
      m('label', [
        m('input[type="checkbox"]'),
        item
      ]),
      m('menu[type="buttons"]', [
        m('a.button[href="javascript:;"]', {
          onclick: checklist.moveItemUp.bind(checklist, i)
        }, t('up')),
        m('a.button[href="javascript:;"]', {
          onclick: checklist.moveItemDown.bind(checklist, i)
        }, t('down')),
        m('a.button[href="javascript:;"]', {
          onclick: checklist.removeItem.bind(checklist, i)
        }, t('remove'))
      ])
    ])
  );
}

function view(ctrl)
{
  var checklist = ctrl.mainCtrl.checklist;

  return [
    m('ul[data-type="list"]',
      checklist.items.map(itemView.bind(null, checklist))
    ),
    m('input[type="text"]', {
      placeholder: t('Description of new item'),
      value: ctrl.newItem,
      oninput: function(e) {
        var value = e.target.value;
        ctrl.newItem = value;
      }
    }),
    m('a.button[href="javascript:;"]', {
      onclick: ctrl.add
    }, t('create item'))
  ];
}

module.exports = {
  controller: controller,
  view: view
};