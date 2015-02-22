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

  checklist.save = function(filename)
  {
    checklist.filename = filename || 'sdcard:/checklists/' + checklist.name + '.json';
    return promisify(fs, fs.writeFile, checklist.filename, checklist.toString());
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
    var item = checklist[index];
    checklist.items.splice(index, 1);
    checklist.items.splice(index, 0, item);
  };

  checklist.moveItemDown = function(index)
  {
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