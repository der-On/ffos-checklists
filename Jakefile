"use strict";

var path = require('path');
var staticServer = require('node-static');
var http = require('http');

var browserifyOpts = {
  src: [path.join(__dirname, 'lib/index.js')],
  dest: path.join(__dirname, 'js/app.compiled.js'),
  vendorDest: path.join(__dirname, 'js/vendors.compiled.js'),
  vendorInclude: [
    'mithril',
    'ffos-os',
    'translate.js',
    'superagent',
    'es6-promise'
  ]
};

var stylusOpts = {
  src: [path.join(__dirname, 'lib/stylus/*.styl')],
  dest: path.join(__dirname, 'css'),
  watchPaths: [path.join(__dirname, 'lib/stylus/*/**.styl')]
};

task('build', function buildTask() {
  var wu = require('jake-web-utils');
  wu.compileBrowserify(browserifyOpts, function() {
    wu.compileStylus(stylusOpts, copyFiles);
  });

  function copyFiles() {
    jake.rmRf('./dist');
    jake.mkdirP('./dist');

    var copy = new jake.FileList();
    copy.include([
      './index.html',
      './manifest.*',
      './humans.txt',
      './README.md',
      './js/*.js',
      './images/**/*.*',
      './gaia/**/*',
      './fonts/**/*',
      './css/*.css',
      './locales/**/*',

      // tests
      './tests/**/*',

      // font-awesome
      './node_modules/font-awesome/fonts/fontawesome-webfont.woff',
      './node_modules/font-awesome/css/font-awesome.min.css'
    ]);

    var distDir = path.join(__dirname, 'dist');

    copy.forEach(function(file) {
      var destDir = path.join(distDir, path.dirname(file));
      jake.mkdirP(destDir);
      jake.cpR(file, destDir);
    });

    complete();
  }
});

task('serve', function serveTask() {
  var server = new staticServer.Server('./');
  http.createServer(function(req, res) {
    req.addListener('end', function() {
      server.serve(req, res);
    }).resume();
  }).listen(8000);

  console.log('listening on localhost:8000');
});

task('watch', { async: true }, function watchTask() {
  var wu = require('jake-web-utils');
  wu.watchBrowserify(browserifyOpts);
  wu.watchStylus(stylusOpts);
});

task('build', { async: true }, function bundleTask() {
  var wu = require('jake-web-utils');
  wu.compileBrowserify(browserifyOpts, function() {
    wu.compileStylues(stylusOpts, complete);
  });
});