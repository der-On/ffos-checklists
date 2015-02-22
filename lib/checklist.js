"use strict";

var fs = require('ffos-fs');
var promisify = require('./promisify');

var Checklist = module.exports = function Checklist(data)
{
  data = data || {};

  var checklist = {
    name: data.name,
    filename: null,
    items: data.items || []
  };

  checklist.save = function(overwrite, filename)
  {
    checklist.filename = filename || 'sdcard:checklists/' + checklist.name.toLowerCase().replace(/\s/g, '_') + '.json';

    if (!overwrite) {
      return new Promise(function(resolve, reject) {
        promisify(fs, fs.exists, checklist.filename)
        .then(function(exists) {
          if (exists) {
            if (!confirm(t('Checklist already exists. Do you want to overwrite write?'))) {
              reject(new Error('Checklist already exists.'));
              return;
            }
          }
          checklist.overwriten = true;
          return promisify(fs, fs.writeFile, checklist.filename, checklist.toString());
        })
        .then(resolve)
        .catch(reject);
      });
    }
    else {
      return promisify(fs, fs.writeFile, checklist.filename, checklist.toString());
    }
  };

  checklist.addItem = function(item)
  {
    checklist.items.push(item);
  };

  checklist.removeItem = function(index)
  {
    checklist.items.splice(index, 1);
  };

  checklist.moveItemUp = function(index)
  {
    if (index === 0) return;
    var item = checklist.items[index];
    checklist.items.splice(index, 1);
    checklist.items.splice(index - 1, 0, item);
  };

  checklist.moveItemDown = function(index)
  {
    if (index === checklist.items.length - 1) return;
    var item = checklist.items[index];
    checklist.items.splice(index, 1);
    checklist.items.splice(index + 1, 0, item);
  };

  checklist.clearItems = function()
  {
    checklist.items.splice(0, checklist.items.length);
  };

  checklist.toString = function()
  {
    var data = {
      name: checklist.name,
      items: checklist.items
    };
    return JSON.stringify(data, null, 2);
  };

  return checklist;
};

module.exports.load = function(filename)
{
  return new Promise(function(resolve, reject) {
    promisify(fs, fs.readFile, filename)
    .then(function(content) {
      try {
        var data = JSON.parse(content);
      }
      catch(err) {
        reject(err);
        return;
      }
      var checklist = Checklist(data);
      checklist.filename = filename;
      resolve(checklist);
    })
    .catch(reject);
  });
};