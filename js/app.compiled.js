(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
    promisify(fs, fs.readdir, 'sdcard:/checklists')
    .then(function(files) {
      return Promise.series(files.map(function(file) {
        var p = Checklist.load(file)
        .then(function(checklist) {
          console.log(checklist);
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
},{"./checklist":2,"./modules/checklist":5,"./modules/checklists":6,"./modules/header":7,"./promisify":8,"ffos-fs":9,"mithril":"mithril"}],2:[function(require,module,exports){
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
},{"./promisify":8,"ffos-fs":9}],3:[function(require,module,exports){
"use strict";

module.exports = function(Promise)
{
  Promise.series = function(promises) {
    var promises = promises.slice();

    return new Promise(function(resolve, reject) {
      function next()
      {
        if (promises.length) {
          var promise = promises.shift();

          promise
          .then(next)
          .catch(reject);
        }
        else {
          resolve();
        }
      }

      next();
    });
  }
};
},{}],4:[function(require,module,exports){
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
},{"./app":1,"./checklist":2,"./extend_promises":3,"es6-promise":"es6-promise","ffos-fs":9,"mithril":"mithril","superagent":"superagent","translate.js":"translate.js"}],5:[function(require,module,exports){
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
},{"mithril":"mithril"}],6:[function(require,module,exports){
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

  ctrl.add = function() {
    var name = ctrl.newName.trim();
    if (!name.length) return;

    ctrl.newName = '';

    var checklist = Checklist({
      name: name
    });

    ctrl.mainCtrl.checklists.push(checklist);

    m.startComputation();
    checklist.save()
    .then(function() {
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
  return m('li',m('p',
    m('a[href="javascript:;"',{
      onclick: ctrl.open.bind(ctrl, checklist)
    }, checklist.name),
    m('menu[type="buttons"]', [
      m('a.button[href="javascript:;"]', {
        onclick: ctrl.remove.bind(ctrl, i),
        title: t('remove')
      }, m('span.icon.icon-close', t('remove')))
    ])
  ));
}

function view(ctrl)
{
  return [
    ctrl.mainCtrl.checklists.length ? [
      m('ul[data-type="list"]', ctrl.mainCtrl.checklists.map(checklistView.bind(null, ctrl)))
    ] : m('ul[data-type="list"]', m('li', m('p', t('No checklists yet.')))),

    m('input[type="text"]', {
      placeholder: t('Name for new checklist'),
      oninput: function(e) {
        var el = e.target;
        var value = el.value;
        ctrl.newName = el.value;
      }
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
},{"../checklist":2,"../promisify":8,"ffos-fs":9,"mithril":"mithril"}],7:[function(require,module,exports){
"use strict";

var m = require('mithril');

function controller(mainCtrl)
{
  var ctrl = {
    mainCtrl: mainCtrl
  };

  ctrl.closeChecklist = function()
  {
    ctrl.mainCtrl.checklist = null;
  };

  return ctrl;
}

function view(ctrl)
{
  return m('section.header[role="region"]',
    m('header', [
      (ctrl.mainCtrl.checklist) ? [
        m('menu[type="toolbar"]', [
         m('a.button[href="javascript:;"', {
           onclick: ctrl.save
         }, t('save'))
        ]),
        m('a[href="javascript:;"', {
          onclick: ctrl.closeChecklist,
          title: t('back')
        }, m('span.icon.icon-back')),
        m('h1', ctrl.mainCtrl.checklist.name)
      ] : m('h1', t('Checklists'))
    ])
  );
}

module.exports = {
  controller: controller,
  view: view
};
},{"mithril":"mithril"}],8:[function(require,module,exports){
"use strict";

/**
 * Creates a promise out of a async function call that takes a callback as last argument
 * @param thisArg {Object} - object to call the function on
 * @param fn {Function} - function to call (must take callback as last argument)
 * @param arg1 ... argN - any number of arguments to be passed to the function (except the callback)
 * @returns {Promise}
 */
module.exports = function(/*thisArg, fn, arg1, arg..., argN*/)
{
  var args = Array.prototype.slice.call(arguments);

  var self = args.shift();
  var fn = args.shift();

  return new Promise(function(resolve, reject) {
    function callback() {
      var args = Array.prototype.slice.call(arguments);
      var err = args.shift();

      if (err) {
        reject(err);
        return;
      }

      resolve.apply(null, args);
    }

    args.push(callback);
    fn.apply(self, args);
  });
};
},{}],9:[function(require,module,exports){
module.exports = new (function() {
  function hasDeviceStorage()
  {
    if (!navigator || typeof navigator.getDeviceStorage !== 'function') {
      console.warn('Your Browser does not support device storage.');
      return false;
    }

    return true;
  }

  hasDeviceStorage();

  var self = this;
  var mocked = false;

  function toArray(arr)
  {
    return Array.prototype.slice.apply(arr);
  }

  function getStorageTypeFromPath(path)
  {
    var type = path.split(':', 2)[0];
    return type;
  }

  function getPathWithoutStorageType(path)
  {
    var parts = path.split(':');
    if (parts.length > 1) {
      return parts.slice(1).join(':');
    }
    else {
      return path;
    }
  }

  function getStorage(type)
  {
    if (!hasDeviceStorage()) {
      return null;
    };

    return navigator.getDeviceStorage(type);
  }

  function getStorageForPath(path)
  {
    return getStorage(
      getStorageTypeFromPath(path)
    );
  }

  function getEditableFile(fd, callback)
  {
    if (fd instanceof LockedFile)
    {
      callback(null, fd);
      return;
    }
    else if(fd instanceof File)
    {
      self.open(fd.name, 'w', callback);
      return;
    }
    else if (fd instanceof FileHandle)
    {
      callback(null, fd.open());
    }
    else {
      callback(new Error('No valid File given.'));
      return;
    }
  }

  function getReadableFile(fd, callback)
  {
    if (fd instanceof LockedFile)
    {
      callback(null, fd);
      return;
    }
    else if(fd instanceof File)
    {
      callback(null, fd);
      return;
    }
    else if (fd instanceof FileHandle)
    {
      var request = fd.getFile();
      request.onsuccess = function() {
        callback(null, this.file);
      };
      request.onerror = function()
      {
        callback(this.error);
      };
      return;
    }
    else {
      callback(new Error('No valid File given.'));
      return;
    }
  }

  /**
   * Sets the filesystem to a mocking in-memory filesystem.
   */
  this.mock = function()
  {
    mocked = true;
    require('./mock')();
    console.warn('Using in memory mock for filesystem now.');
  };

  this.open = function(path, flags, callback)
  {
    if (typeof callback !== 'function') {
      var callback = function() {};
    }

    path = path.trim();
    var storage = getStorageForPath(path);

    if (!storage) {
      callback(new Error('Unable to find entry point for ' + path + '.'));
      return;
    }

    var method = 'get';

    switch(flags) {
      case 'r':
        method = 'get';
        break;

      case 'w':
        method = 'getEditable';
        break;
    }

    var request = storage[method](getPathWithoutStorageType(path));

    request.onsuccess = function() {
      callback(null, this.result);
    };
    request.onerror = function() {
      callback(this.error, null);
    };
  };

  this.exists = function(path, callback)
  {
    if (typeof callback !== 'function') {
      var callback = function() {};
    }

    if (mocked) {
      var storage = getStorageForPath(path);
      if (storage) {
        callback(null, (storage.files[path]) ? true : false);
      }
      else {
        callback(new Error('Unable to find entry point for ' + path + '.'));
      }
      return;
    }

    this.open(path, 'r', function(error, file) {
      callback(null, (error) ? false : true);
    });
  };

  this.read = function(fd, blob, offset, length, position, callback)
  {
    if (typeof callback !== 'function') {
      var callback = function() {};
    }

    if (!fd) {
      throw new Error('Missing File.');
      return;
    }
    if (!blob || !(blob instanceof Blob)) {
      throw new Error('Missing or invalid Blob.');
      return;
    }

    getReadableFile(fd, function(error, fd) {
      if (error) {
        callback(error);
        return;
      }

      var offset = offset || 0;
      var length = length || fd.size;
      if (length > fd.size) {
        length = fd.size;
      }
      var position = position || 0;

      blob.splice(
        offset,
        length,
        fd.slice(position, length)
      );
      callback(null, length, blob);
    });
  };

  this.readFile = function(/* filename, [options], callback */)
  {
    var args = toArray(arguments);

    var filename = args.shift();
    var callback = args.pop();
    var opts = args.pop() || {};

    if (typeof callback !== 'function') {
      var callback = function() {};
    }

    var options = {
      encoding: opts.encoding || 'utf8',
      format: opts.format || 'text',
      flag: opts.flag || 'r'
    };

    if (mocked) {
      var storage = getStorageForPath(filename);

      if (!storage) {
        callback(new Error('Unable to find entry point for ' + filename + '.'));
        return;
      }

      var file = storage.files[filename] || null;

      if (file) {
        switch(options.format) {
          case 'text':
            file = file.toString();
            break;

          case 'binary':
            file = file.toString();
            break;

          case 'dataURL':
            if (typeof file === 'string') {
              var buffer = new ArrayBuffer(file.length);
              for (var i = 0; i < file.length; i++) {
                buffer[i] = file.charCodeAt(i);
              }
              file = buffer.toDataURL();
            }

          case 'buffer':
            if (typeof file === 'string') {
              var buffer = new ArrayBuffer(file.length);
              for (var i = 0; i < file.length; i++) {
                buffer[i] = file.charCodeAt(i);
              }
              file = buffer;
            }

          default:
            file = file.toString();
        }
      }

      callback(null, file);
      return;
    }

    this.open(filename, options.flag, function(error, fd) {
      if (error) {
        callback(error);
        return;
      }

      getReadableFile(fd, function(error, fd) {
        if (error) {
          callback(error);
          return;
        }

        var reader = new FileReader();

        reader.onerror = function(error)
        {
          callback(error);
        };
        reader.addEventListener('loadend', function() {
          callback(null, reader.result);
        });

        switch(options.format) {
          case null:
          case 'text':
            reader.readAsText(fd, options.encoding);
            break;
          case 'binary':
            reader.readAsBinaryString(fd);
            break;

          case 'dataURL':
            reader.readAsDataURL(fd);
            break;

          case 'buffer':
            reader.readAsArrayBuffer(fd);
            break;

          default:
            reader.readAsText(fd, options.encoding);
        }
      });
    });
  };

  this.write = function(fd, buffer, offset, length, position, callback)
  {
    if (typeof callback !== 'function') {
      var callback = function() {};
    }

    if (!fd) {
      throw new Error('Missing File.');
      return;
    }
    if (!buffer || !(buffer instanceof ArrayBuffer) || typeof buffer !== 'string') {
      throw new Error('Missing or invalid Buffer.');
      return;
    }

    getEditableFile(fd, function(error, fd) {
      if (error) {
        callback(error);
        return;
      }

      var offset = offset || 0;
      var length = length || buffer.lenght;
      if (length > buffer.lenght) {
        length = buffer.length;
      }
      var position = position || 0;
      var data;

      if (buffer instanceof ArrayBuffer) {
        data = buffer.slice(offset, length);
      }
      else {
        data = buffer.substr(offset, length);
      }

      var request = fd.write(data);
      request.onsuccess = function() {
        callback(null, length, buffer);
      };
      request.onerror = function() {
        callback(this.error, 0, buffer);
      };
    });
  };

  this.writeFile = function(/* filename, data, [options], callback */)
  {
    var args = toArray(arguments);

    var filename = args.shift();
    var data = args.shift();
    var callback = args.pop();
    var opts = args.pop() || {};
    var options = {
      encoding: opts.encoding || 'utf8',
      mimetype: opts.mimetype || 'text/plain',
      flag: opts.flag || 'w'
    };

    if (typeof callback !== 'function') {
      var callback = function() {};
    }

    this.exists(filename, function(error, exists) {
      if (error) {
        callback(error);
        return;
      }

      var storage = getStorageForPath(filename);

      if (!storage) {
        callback(new Error('Unable to find entry point for ' + filename + '.'));
        return;
      }

      if (mocked) {
        storage.files[filename] = data;
        callback(null);
        return;
      }

      var file = (data instanceof Blob) ? data : new Blob([data], { type: options.mimetype });
      var filepath = getPathWithoutStorageType(filename);

      var request = storage.addNamed(file, filepath);
      request.onsuccess = function()
      {
        callback(null);
      };
      request.onerror = function()
      {
        callback(this.error);
      };
    });
  };

  this.readdir = function(path, callback)
  {
    if (typeof callback !== 'function') {
      var callback = function() {};
    }
    var storage = getStorageForPath(path);
    if (!storage) {
      callback(new Error('Unable to find entry point for ' + path + '.'));
      return;
    }

    if (mocked) {
      callback(null, storage.readdir(path));
      return;
    }

    var dirpath = getPathWithoutStorageType(path);
    var cursor = storage.enumerate(dirpath);

    var files = [];

    cursor.onsuccess = function()
    {
      if (this.result) {
        files.push(this.result);

        this.continue();
      }
      else if (this.done) {
        callback(null, files);
      }
    };
    cursor.onerror = function()
    {
      callback(this.error, files);
    }
  };

  this.unlink = function(path, callback)
  {
    if (typeof callback !== 'function') {
      var callback = function() {};
    }
    var filepath = getPathWithoutStorageType(path);
    var storage = getStorageForPath(path);
    if (!storage) {
      callback(new Error('Unable to find entry point for ' + path + '.'));
      return;
    }

    if (mocked) {
      delete storage.files[path];
      callback(null);
      return;
    }

    var request = storage.delete(filepath);
    request.onsuccess = function()
    {
      callback(null);
    };
    request.onerror = function()
    {
      callback(this.error);
    };
  };
})();
},{"./mock":10}],10:[function(require,module,exports){
"use strict";

var Storage = function(type)
{
  var self = this;

  this.type = type;
  this.files = {};
  this.readdir = function(path)
  {
    var files = [];
    Object.keys(self.files).forEach(function(file) {
      if (file.indexOf(path) === 0) {
        files.push(file);
      }
    });

    files.sort();
    return files;
  };
};

module.exports = function() {
  var global = (window || global);
  var navigator = (global.navigator || {});

  var storages = {
    'sdcard': new Storage('sdcard')
  };

  navigator.getDeviceStorage = function (type) {
    return storages[type] || null;
  };
};
},{}]},{},[4])


//# sourceMappingURL=app.compiled.js.map