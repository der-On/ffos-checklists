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

  ctrl.remove = function(index) {
    if (confirm(t('Do you really want to remove this item?'))) {
      ctrl.mainCtrl.checklist.removeItem(index);
    }
  };

  return ctrl;
}

function itemView(ctrl, checklist, item, i)
{
  return m('li',
    m('label.pack-checkbox', [
      m('input[type="checkbox"]'),
      m('span')
    ]),
    m('aside.pack-end', {style:'display: block' }, [
      i > 0 ?
      m('a.move-item-btn[href="javascript:;"]', {
        onclick: checklist.moveItemUp.bind(checklist, i)
      }, t('up')) : null,
      i < checklist.items.length - 1 ?
      m('a.move-item-btn[href="javascript:;"]', {
        onclick: checklist.moveItemDown.bind(checklist, i)
      }, t('down')) : null,
      m('a.remove-item-btn.gaia-icon.icon-delete[href="javascript:;"]', {
        onclick: ctrl.remove.bind(ctrl, i),
        title: t('remove')
      })
    ]),
    m('a[href="javascript:;"]', m('p', item))
  );
}

function view(ctrl)
{
  var checklist = ctrl.mainCtrl.checklist;

  return [
    m('section[data-type="list"]',
      m('ul[data-type="edit"]', checklist.items.map(itemView.bind(null, ctrl, checklist)))
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