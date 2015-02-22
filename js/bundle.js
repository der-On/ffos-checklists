(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{"./../lib/app":3,"./../lib/l10n":8,"./../lib/map":9,"./../lib/tests":17,"./../lib/ui":20}],2:[function(require,module,exports){
"use strict";

var Animation = function Animation()
{
  var self = this;

  this.keyframes = [];
  this.playing = false;
  this.offset = 0;
  this.current = null;
  this.prev = null;
  this.next = null;
  this.currentIndex = -1;
  this.duration = 0;
  this.frameRate = 30;
  this.timeStretch = 1;
  this.frameOffset = 0;

  function frame()
  {
    if (self.offset === 0) {
      self.current = self.keyframes[0].to;
      self.onUpdate(self.current);
    }
    else if (self.offset >= 1) {
      self.current = self.keyframes[self.keyframes.length - 1].to;
      self.onUpdate(self.current);
      self.stop();
      self.onDone();
    }
    else {
      var prev = getPrevKeyframe(self.offset);
      var next = self.keyframes[prev.index + 1];

      var relOffset = self.offset - prev.offset;
      var offset = relOffset / (next.offset - prev.offset);

      self.current = self.interpolate(prev.to, next.to, offset);
      self.onUpdate(self.current);
    }

    self.offset += self.frameOffset;
  }

  function getPrevKeyframe(offset)
  {
    if (offset === 0) {
      return null;
    }

    var keyframe;
    var i = 1;

    while(i < self.keyframes.length) {
      keyframe = self.keyframes[i];
      if (keyframe.offset >= offset) {
        return self.keyframes[i - 1];
      }
      i++;
    }

    return self.keyframes[0];
  }

  function getNextKeyFrame(offset)
  {
    if (offset === 1) {
      return null;
    }

    var keyframe;
    var i = self.keyframes.length - 1;

    while(i >= 0) {
      keyframe = self.keyframes[i];
      if (keyframe.offset <= offset) {
        return self.keyframes[i + 1];
      }
      i--;
    }

    return self.keyframes[self.keyframes.length - 1];
  }

  function calculate(timeStretch)
  {
    self.timeStretch = timeStretch || self.timeStretch;
    self.frameOffset = (1 / self.duration) * timeStretch;
  }

  this.addKeyframe = function(to, offset)
  {
    this.keyframes.push({ to: to, offset: offset, index: this.keyframes.length });
  };

  this.clearKeyframes = function()
  {
    this.keyframes.splice(0, this.keyframes.length);
  };

  this.play = function(timeStretch)
  {
    calculate(timeStretch);
    this.playing = true;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(frame, 1000 / this.frameRate);
  };

  this.playFrom = function(offset, timeStretch)
  {
    this.offset = offset;
    this.play(timeStretch);
  };

  this.pause = function()
  {
    this.playing = false;
    clearInterval(this.intervalId);
  };

  this.stop = function()
  {
    this.playing = false;
    clearInterval(this.intervalId);
  };

  // implement this
  this.interpolate = Animation.interpolate.bind(this);

  // implement this
  this.onUpdate = function(current)
  {

  };

  // implement this
  this.onDone = function()
  {

  };
};

Animation.interpolate = function(from, to, offset)
{
  var diff = to - from;
  return from + (diff * offset);
};

module.exports = Animation;
},{}],3:[function(require,module,exports){
"use strict";

var gpx = require('./gpx');
var GpxParser = require('./gpx_parser');
var fs = require('ffos-fs');
var shared = require('./shared');
var geocoder = require('./geocoder');

// app singleton
module.exports = function () {
  var self = this;
  this.map = null;
  this.ui = null;
  this.geocoder = geocoder;
  this.geocoder.query = '';
  this.geocoder.results = null;
  this.manifest = {};

  // thin wrapper around geolocation API
  this.getCurrentPosition = function(cb)
  {
    navigator.geolocation.getCurrentPosition(cb);
  };

  this.watchPosition = function(cb)
  {
    return navigator.geolocation.watchPosition(function(position) {
      self.config.position = gpx.Position.fromJSON(position);
      saveConfig();

      cb(position);
    }, function(error) {
      console.error(error.message);
      console.log(error);
    }, {enableHighAccuracy: true});
  };

  this.unwatchPosition = function(id)
  {
    navigator.geolocation.clearWatch(id);
  };

  this.startRecording = function()
  {
    if (!this.recording) {
      var segment = new gpx.TrackSegment();
      if (this.recordedGpx.tracks.length === 0) {
        this.recordedGpx.tracks.push(new gpx.Track());
      }
      this.recordedGpx.tracks[0].segments.push(segment);
      this.recordingWatchId = this.watchPosition(this.recordPosition.bind(this, segment));
      this.recording = true;
    }
  };

  this.recordPosition = function(segment, position)
  {
    if (position) {
      position.date = new Date();
      segment.points.push(gpx.Position.fromJSON(position));

      saveRecordedGpx();
    }
  };

  this.stopRecording = function()
  {
    if (this.recordingWatchId) {
      this.unwatchPosition(this.recordingWatchId);
      this.recording = false;
    }
  };

  this.toggleRecording = function()
  {
    if (this.recording) {
      this.stopRecording();
    }
    else {
      this.startRecording();
    }
  };

  this.saveRecording = function(filename, callback)
  {
    var now = new Date();
    var gpx = this.recordedGpx.toString();

    if (typeof callback !== 'function') {
      var callback = function() {};
    }

    if (!filename) {
      var filename = 'osm_trip_planner/trip_' + now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() + '_' + now.getHours() + '-' + now.getMinutes() + '-' + now.getSeconds() + '.gpx';
    }

    fs.writeFile('sdcard:' + filename, gpx, function(error) {
      if (error) {
        console.warn('Error saving GPX track to ' + filename);
        console.log(error);
        callback(error, filename);
        return;
      }

      console.log('File "' + filename + '" successfully saved.');

      // we can now remove the temporary gpx track from the database
      self.clearRecordedGpx(function(error) {
        callback(null, filename);
      });
    });
  };

  this.clearRecordedGpx = function(cb)
  {
    this.recordedGpx.tracks.splice(0);
    saveRecordedGpx(cb);
  };

  this.getTracks = function(cb)
  {
    var tracks = [];

    fs.readdir('sdcard:osm_trip_planner', function(error, files) {
      if (error) {
        console.warn('Error listing GPX tracks.');
        console.log(error);
        return;
      }

      var tracks = files.filter(function(file) {
        return (file.name.substr(-4) === '.gpx');
      });

      cb(tracks);
    });
  };

  this.createGpxFromString = function(gpxStr)
  {
    var _gpx = (new GpxParser()).parse(gpxStr);
    return _gpx;
  };

  this.loadPlaceMarkers = function()
  {
    localforage.keys(function(keys) {
      keys.forEach(function(key) {
        if (key.search('place_marker_') === 0) {
          localforage.getItem(key, function(marker) {
            if (!marker.id) {
              marker.id = parseInt(key.replace('place_marker_', ''));
            }

            marker = self.map.createPlaceMarker(marker.title, [marker.lat, marker.lon], marker.id);
          });
        }
      })
    });
  };

  this.savePlaceMarker = function(marker, cb)
  {
    if (typeof cb !== 'function') {
      var cb = function() {};
    }

    var latLon = marker.getLatLng();

    localforage.setItem('place_marker_' + marker.id, {
      id: marker.id,
      title: marker.title,
      lat: latLon.lat,
      lon: latLon.lng
    }, function() {
      cb(null);
    });
  };

  this.removePlaceMarker = function(id, cb)
  {
    if (typeof cb !== 'function') {
      var cb = function() {};
    }

    localforage.removeItem('place_marker_' + id, function() {
      cb(null);
    });
  };

  function saveRecordedGpx(cb)
  {
    if (typeof cb !== 'function') {
      var cb = function() {};
    }
    // update gpx track in Database
    var _gpx = self.recordedGpx.toJSON();

    localforage.setItem('recordedGpx', _gpx, function() {
      cb(null);
    });
  }

  function saveConfig()
  {
    var config = shared.copy(self.config);
    config.position = config.position.toJSON();

    var tries = 0;

    localforage.setItem('config', config, function() {

    });
  }

  function applyConfig()
  {
    self.map.map.setView(
      [self.config.position.coords.latitude, self.config.position.coords.longitude],
      self.config.zoom
    );

    if (self.config.following && !self.map.following) {
      self.map.follow(self.map.userMarkers.user);
    }
    else if (!self.config.following) {
      self.map.unfollow();
    }

    self.map.offline = self.config.offline;

    self.map.setBaseLayerType(self.config.baseLayerType, true);
  }

  this.init = function() {
    this.recordedGpx = new gpx.Gpx();
    this.recording = false;
    this.recordedGpx.tracks.push(new gpx.Track());

    this.config = {
      position: new gpx.Position(),
      zoom: 12,
      following: true,
      baseLayerType: 'osm_mapnik',
      offline: false
    };

    // try to load recorded gpx track
    localforage.getItem('recordedGpx', function(_gpx) {
      if (!_gpx) return;

      self.recordedGpx = gpx.Gpx.fromJSON(_gpx);

      // display the recorded track as marker trace
      if (self.map) {
        self.map.userMarkers.user.drawGpx(self.recordedGpx);
      }
    });

    // try to load config
    localforage.getItem('config', function(config) {
      for(var key in config) {
        self.config[key] = config[key];
      }
      self.config.position = gpx.Position.fromJSON(self.config.position);

      if (self.map) {
        applyConfig();
      }
    });

    // load all and display place markers
    this.loadPlaceMarkers();

    function onZoom() {
      self.config.zoom = self.map.map.getZoom();
      saveConfig();
    }

    function onFollow() {
      self.config.following = (self.map.following) ? true : false;
      saveConfig();
    }

    function onBaseLayerTypeChange()
    {
      self.config.baseLayerType = self.map.baseLayerType;
      saveConfig();
    }

    function onOfflineChange()
    {
      self.config.offline = self.map.offline;
      saveConfig();
    }

    // listen for map events
    if (this.map) {
      this.map.map.addEventListener('zoomend', onZoom);
      this.map.on('follow', onFollow);
      this.map.on('unfollow', onFollow);
      this.map.on('baseLayerTypeChange', onBaseLayerTypeChange);
      this.map.on('offline', onOfflineChange);
      this.map.on('online', onOfflineChange);
    }
  };
};
},{"./geocoder":4,"./gpx":5,"./gpx_parser":6,"./shared":15,"ffos-fs":36}],4:[function(require,module,exports){
"use strict";

module.exports = new (function() {
  this.url = 'http://nominatim.openstreetmap.org/search';

  this.search = function(query, bounds, cb) {
    if (typeof cb !== 'function') {
      var cb = function() {};
    }

    var req = new XMLHttpRequest();
    var url = this.url + '/' + encodeURIComponent(query);

    if (bounds) {
      url += '?viewboxlbrt=' + bounds.toBBoxString() + '&bounded=1&format=json';
    }
    else {
      url += '?format=json';
    }

    req.open('GET', url, true);
    req.responseType = 'json';
    req.onload = function()
    {
      cb(null, req.response);
    };
    req.onerror = function(error)
    {
      console.log(this, error);
      cb(error, null);
    };
    req.send();
  }
})();
},{}],5:[function(require,module,exports){
"use strict";

var pgk = require('../package.json');
var GpxStats = require('./gpx_stats');

function Gpx()
{
  this.tracks = [];
  this.metadata = {};
  this.waypoints = [];
  this.stats = new GpxStats(this);
}
Gpx.prototype = {
  toString: function()
  {
    var now = new Date();

    var lines = [
      '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
        '<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="OSM Trip-Planner ' + pgk.version + '" version="1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
      '<metadata>',
      '  <link href="http://www.garmin.com">',
      '   <text>Garmin International</text>',
      '  </link>',
        '  <time>' + now.toISOString() + '</time>',
        '  <bounds maxlat="' + this.getMaxLat() + '" maxlon="' + this.getMaxLon() + '" minlat="' + this.getMinLat() + '" minlon="' + this.getMinLon() + '"/>',
      '</metadata>'
    ];
    var indent = '';
    this.tracks.forEach(function(track) {
      lines.push('  <trk>');
      lines.push('    <name>' + now.toISOString() + '</name>');

      track.segments.forEach(function(segment) {
        lines.push('    <trkseg>');

        segment.points.forEach(function(point) {
          lines.push('      <trkpt lat="' + point.coords.latitude + '" lon="' + point.coords.longitude + '">');
          if (point.coords.altitude) {
            lines.push('        <ele>' + point.coords.altitude + '</ele>');
          }
          if (point.date) {
            lines.push('        <time>' + point.date.toISOString() + '</time>');
          }
          // store as much additional data as possible
          /*['accuracy', 'altitudeAccuracy', 'heading', 'speed'].forEach(function(key) {
            if (key in point.coords && !isNaN(point.coords[key])) {
              lines.push('        <' + key + '>' + point.coords[key] + '<' + key + '>');
            }
          });*/
          lines.push('      </trkpt>');
        });

        lines.push('    </trkseg>');
      });
      lines.push('  </trk>');
    });

    lines.push('</gpx>');

    return lines.join('\n');
  },
  toJSON: function()
  {
    var json = {
      metadata: {},
      tracks: [],
      waypoints: []
    };

    this.tracks.forEach(function(track) {
      json.tracks.push(track.toJSON());
    });

    this.waypoints.forEach(function(waypoint) {
      json.waypoints.push(waypoint.toJSON());
    });

    return json;
  },
  _getMax: function(what)
  {
    var max = null;

    this.tracks.forEach(function(track) {
      track.segments.forEach(function(segment) {
        segment.points.forEach(function(point) {
          if (max === null || max < point.coords[what]) {
            max = point.coords[what];
          }
        });
      });
    });

    return max;
  },
  _getMin: function(what)
  {
    var min = null;

    this.tracks.forEach(function(track) {
      track.segments.forEach(function(segment) {
        segment.points.forEach(function(point) {
          if (min === null || min > point.coords[what]) {
            min = point.coords[what];
          }
        });
      });
    });

    return min;
  },
  getMaxLat: function()
  {
    return this._getMax('latitude');
  },
  getMaxLon: function()
  {
    return this._getMax('longitude');
  },
  getMinLat: function()
  {
    return this._getMin('latitude');
  },
  getMinLon: function()
  {
    return this._getMin('longitude');
  },
  calculate: function()
  {
    this.tracks.forEach(function(track) {
      track.segments.forEach(function(segment) {
        segment.calculate();
      });
    });
  },
  clone: function()
  {
    var gpx = new Gpx();
    this.tracks.forEach(function(track) {
      var _track = new Track();
      gpx.tracks.push(_track);

      track.segments.forEach(function(segment) {
        var _segment = new TrackSegment();
        _track.segments.push(_segment);

        segment.points.forEach(function(point) {
          var _point = point.clone();
          _segment.points.push(_point);
        });
      })
    });

    return gpx;
  }
};
Gpx.fromJSON = function(json)
{
  var gpx = new Gpx();
  gpx.metadata = json.metadata || {};

  if (json.tracks) {
    json.tracks.forEach(function(track) {
      gpx.tracks.push(Track.fromJSON(track));
    });
  }

  if (json.waypoints) {
    json.waypoints.forEach(function(waypoint) {
      gpx.waypoints.push(Waypoint.fromJSON(waypoint));
    });
  }

  return gpx;
};
module.exports.Gpx = Gpx;

var Position = function(lat, lon, alt)
{
  this.coords = {
    latitude: lat || 0,
    longitude: lon || 0,
    altitude: alt || 0,
    heading: null,
    speed: null
  };
  this.date = new Date();
};
Position.prototype.clone = function()
{
  var pos = new Position(this.coords.latitude, this.coords.longitude, this.coords.altitude);
  pos.date = this.date;
  pos.coords.heading = this.coords.heading;
  pos.coords.speed = this.coords.speed;
  return pos;
};
Position.prototype.toJSON = function()
{
  return {
    coords: {
      latitude: this.coords.latitude,
      longitude: this.coords.longitude,
      altitude: this.coords.altitude,
      heading: this.coords.heading,
      speed: this.coords.speed
    },
    date: this.date
  };
};
Position.fromJSON = function(json)
{
  var pos = new Position(json.coords.latitude, json.coords.longitude, json.coords.altitude);
  pos.coords.heading = json.coords.heading;
  pos.coords.speed = json.coords.speed;
  pos.date = json.date || new Date();
  return pos;
};
module.exports.Position = Position;

function Waypoint()
{
  this.name = null;
  this.position = null;
}
Waypoint.prototype.toJSON = function()
{
  return {
    name: this.name,
    position: (this.position) ? this.position.toJSON() : null
  };
};
Waypoint.fromJSON = function(json)
{
  var waypoint = new Waypoint();
  waypoint.name = json.name || null;
  waypoint.position = Position.fromJSON(json.position);
  return waypoint;
};
module.exports.Waypoint = Waypoint;

function Track()
{
  this.name = null;
  this.segments = [];
}
Track.prototype.toJSON = function()
{
  var json = {
    name: this.name,
    segments: []
  };

  this.segments.forEach(function(segment) {
    json.segments.push(segment.toJSON());
  });

  return json;
};
Track.fromJSON = function(json)
{
  var track = new Track();
  track.name = json.name || null;

  if (json.segments) {
    json.segments.forEach(function(segment) {
      track.segments.push(TrackSegment.fromJSON(segment));
    });
  }

  return track;
};
module.exports.Track = Track;

function TrackSegment()
{
  this.points = [];
}
TrackSegment.prototype.calculate = function()
{
  var lastPoint;
  this.points.forEach(function(point) {
    if (lastPoint) {
      if (typeof point.coords.heading !== 'number') {
        point.coords.heading = L.GeometryUtil.computeAngle(
          L.point(lastPoint.coords.latitude, lastPoint.coords.longitude),
          L.point(point.coords.latitude, point.coords.longitude)
        );
      }
      if (typeof point.distance !== 'number') {
        var distance = L.latLng(point.coords.latitude, point.coords.longitude).distanceTo(L.latLng(lastPoint.coords.latitude, lastPoint.coords.longitude));
        point.distance = distance;
      }
      if (typeof point.coords.speed !== 'number') {
        var timeDiff = point.date.getTime() - lastPoint.date.getTime();
        var t = timeDiff / 1000;
        point.coords.speed = (point.distance / t);
      }
    }

    lastPoint = point;
  });
};
TrackSegment.prototype.toJSON = function()
{
  var json = {
    points: []
  };

  this.points.forEach(function(point) {
    json.points.push(point.toJSON());
  });
  return json;
};
TrackSegment.fromJSON = function(json)
{
  var segment = new TrackSegment();

  if (json.points) {
    json.points.forEach(function(point) {
      segment.points.push(Position.fromJSON(point));
    });
  }

  return segment;
};
module.exports.TrackSegment = TrackSegment;
},{"../package.json":38,"./gpx_stats":7}],6:[function(require,module,exports){
"use strict";

var gpx = require('./gpx');

function GpxParser()
{
  this.parser = new DOMParser();

  this.parse = function(data)
  {
    var toArray = function(arr) {
      return Array.prototype.slice.apply(arr);
    };
    var getText = function(node) {
      return node.innerHTML;
    };
    var getFirstText = function(node, tagName)
    {
      var tags = node.getElementsByTagName(tagName);
      if (tags.length > 0) {
        return getText(tags[0]);
      }
      else {
        return null;
      }
    };

    var xml = this.parser.parseFromString(data, 'application/xml');

    var _gpx = new gpx.Gpx();

    var tracks = toArray(xml.getElementsByTagName('trk'));
    tracks.forEach(function(track, i) {
      var segments = toArray(track.getElementsByTagName('trkseg'));
      track = new gpx.Track();

      segments.forEach(function(segment, i) {
        var points = toArray(segment.getElementsByTagName('trkpt'));

        segment = new gpx.TrackSegment();

        points.forEach(function(point, i) {
          var position = new gpx.Position(
            parseFloat(point.getAttribute('lat')),
            parseFloat(point.getAttribute('lon')),
            parseFloat(getFirstText(point ,'ele'))
          );
          position.date = new Date(getFirstText(point, 'time'));
          points[i] = position;
        });

        segment.points = points;
        segments[i] = segment;
      });

      track.segments = segments;
      tracks[i] = track;
    });

    var waypoints = toArray(xml.getElementsByTagName('wpt'));

    waypoints.forEach(function(waypoint, i) {
      var position = new gpx.Position(
        parseFloat(waypoint.getAttribute('lat')),
        parseFloat(waypoint.getAttribute('lon')),
        0
      );

      var name = getFirstText(waypoint, 'name');
      waypoint = new gpx.Waypoint();
      waypoint.name = name;
      waypoint.position = position;
      waypoints[i] = waypoint;
    });

    _gpx.tracks = tracks;
    _gpx.waypoints = waypoints;
    return _gpx;
  };
}

module.exports = GpxParser;
},{"./gpx":5}],7:[function(require,module,exports){
"use strict";

function GpxStats(gpx)
{
  this.gpx = gpx;
}
GpxStats.prototype = new (function() {
  this._eachPoint = function(cb)
  {
    this.gpx.tracks.forEach(function(track) {
      track.segments.forEach(function(segment) {
        segment.points.forEach(function(point) {
          cb(point);
        });
      });
    });
  }

  this.maxSpeed = function()
  {
    var max = 0;

    this.gpx.calculate();

    this._eachPoint(function(point) {
      if (point.coords.speed && max < point.coords.speed) {
        max = point.coords.speed;
      }
    });

    return max;
  };

  this.averageSpeed = function()
  {
    var total = 0;
    var count = 0;

    this.gpx.calculate();

    this._eachPoint(function(point) {
      if (point.coords.speed) {
        total += point.coords.speed;
        count++;
      }
    });

    return total / count;
  };

  this.length = function()
  {
    var length = 0;

    this.gpx.calculate();

    this._eachPoint(function(point) {
      if (point.distance) {
        length += point.distance;
      }
    });

    return length;
  };

  this.maxAltitude = function()
  {
    var max = null;

    this._eachPoint(function(point) {
      if (point.coords.altitude && (max === null || max < point.coords.altitude)) {
        max = point.coords.altitude;
      }
    });

    return max || 0;
  };

  this.minAltitude = function()
  {
    var min = null;

    this._eachPoint(function(point) {
      if (point.coords.altitude && (min === null || min > point.coords.altitude)) {
        min = point.coords.altitude;
      }
    });

    return min || 0;
  };

  this.altitudeDifference = function()
  {
    var min = this.minAltitude();
    var max = this.maxAltitude();
    return max - min;
  };
});

module.exports = GpxStats;
},{}],8:[function(require,module,exports){
'use strict';

var sprintf = require('sprintf-js');
var defaultLocale = 'en';
var locale = document.documentElement.lang || defaultLocale;

module.exports = (function(window) {
  window.l = {};

  window.t = function(/* value, args ... */)
  {
    var args = Array.prototype.slice.apply(arguments);
    var value = args.shift();
    return sprintf.vsprintf(value, args);
  };

  var req = new XMLHttpRequest();
  req.open('GET', 'locales/' + locale + '.json', true);
  req.responseType = 'json';
  req.onload = function()
  {
    var data = req.response;
    for(var key in data) {
      window.l[key] = data[key];
    }

    setTitle();

    $(document).trigger('localeLoad');
  };
  req.onerror = function(error)
  {
    console.warn('Error loading locale file.');
    console.log(error);
  };
  req.send();

  function setTitle()
  {
    window.title = l.app.name;
  }
})(window);
},{"sprintf-js":37}],9:[function(require,module,exports){
"use strict";

var Animation = require('./../animation');
var Position = require('./../gpx').Position;
var UserMarker = require('./user_marker');
var PlaceMarker = require('./place_marker');
var events = require('events');
var util = require('util');
var MapCache = require('./map_cache');

function Map(app) {
  var self = this;
  events.EventEmitter.call(this);

  this.app = app;
  this.ui = null;
  this.offline = false;
  this.mapCache = new MapCache(this);

  this.userMarkers = {};
  this.placeMarkers = {};

  this.createUserMarker = function(name, color)
  {
    this.userMarkers[name] = UserMarker.create(this, name, color);
    return this.userMarkers[name];
  };

  this.removeUserMarker = function(name)
  {
    if (this.userMarkers[name]) {
      var marker = this.userMarkers[name];

      this.map.removeLayer(marker);
      delete this.userMarkers[name];
    }
  };

  this.createPlaceMarker = function(title, latLon, id)
  {
    var marker = PlaceMarker.create(this, title, latLon, id);
    this.placeMarkers[marker.id] = marker;

    return marker;
  };

  this.removePlaceMarker = function(id)
  {
    if (this.placeMarkers[id]) {
      var marker = this.placeMarkers[id];

      this.map.removeLayer(marker);
      delete this.placeMarkers[id];
    }
  };

  function onFollow()
  {
    if (self.following) self.map.setView(self.following.getLatLng());
  }

  this.follow = function(marker)
  {
    if (this.following === marker) {
      marker.removeEventListener('move', onFollow);
    }
    this.following = marker;
    marker.addEventListener('move', onFollow);
    this.map.setView(marker.getLatLng());

    this.emit('follow');
  };

  this.unfollow = function(marker)
  {
    if (this.following === marker) {
      marker.removeEventListener('move', onFollow);
    }
    this.following = null;

    this.emit('unfollow');
  };

  this.toggleFollowing = function(marker)
  {
    if (this.following === marker) {
      this.unfollow(marker);
    }
    else {
      this.follow(marker);
    }
  };

  this.centerViewOn = function(marker)
  {
    this.map.setView(marker.getLatLng());
  };

  this.endWatching = function()
  {
    if (this.watchPositionId) {
      this.app.unwatchPosition(this.watchPositionId);
    }
  };

  this.startWatching = function()
  {
    this.endWatching();

    var marker = this.userMarkers.user;

    // start following the user
    this.watchPositionId = this.app.watchPosition(function(position) {
      self.ui.setState('position', 1000);
      marker.updatePosition(position);
    });
  };

  this.clearGpx = function()
  {
    // remove previously drawn gpx
    if (this.drawnGpx) {
      this.map.removeLayer(this.drawnGpx);
      this.drawnGpx = null;

      if (this.map.hasLayer(this.userMarkers.track)) {
        this.map.removeLayer(this.userMarkers.track);
      }
    }
  };

  this.drawGpx = function(gpx, color, view)
  {
    this.clearGpx();

    if (gpx.tracks.length === 0 ||
        gpx.tracks[0].segments.length === 0 ||
        gpx.tracks[0].segments[0].points.length === 0) {
      return;
    }

    var latLng = L.latLng(
      gpx.tracks[0].segments[0].points[0].coords.latitude,
      gpx.tracks[0].segments[0].points[0].coords.longitude
    );
    this.drawnGpx = L.polyline(latLng, {color: color, opacity: 0.25, smoothness: 1.5});

    gpx.tracks.forEach(function(track) {
      track.segments.forEach(function(segment) {
        var points = segment.points;
        points.forEach(function(point) {
          self.drawnGpx.addLatLng(L.latLng(point.coords.latitude, point.coords.longitude));
        });
      });
    });

    this.drawnGpx.addTo(this.map);

    if (!this.map.hasLayer(this.userMarkers.track)) {
      this.userMarkers.track.addTo(this.map);
    }

    if (view && this.drawnGpx) {
      this.map.fitBounds(this.drawnGpx.getBounds());
    }

    return this.drawnGpx;
  };

  this.setBaseLayerType = function(type, silent)
  {
    this.baseLayerType = type;

    switch(type) {
      case 'osm_mapnik':
        this.baseLayerUrl = 'http://{s}.tile.osm.org/{z}/{x}/{y}.png';
        break;

      case 'osm_cyclemap':
        this.baseLayerUrl = 'http://{s}.tile.opencyclemap.org/cycle/{z}/{x}/{y}.png';
        break;

      case 'osm_transmap':
        this.baseLayerUrl = 'http://{s}.tile2.opencyclemap.org/transport/{z}/{x}/{y}.png';
        break;

      default:
        this.baseLayerUrl = 'http://{s}.tile.osm.org/{z}/{x}/{y}.png';
    }

    if (this.baseLayer) this.baseLayer.redraw();

    if (!silent) this.emit('baseLayerTypeChange');
  };

  this.setOffline = function(offline)
  {
    this.offline = (offline) ? true : false;
    if (this.baseLayer) this.baseLayer.redraw();
    this.emit(this.offline ? 'offline' : 'online');
  };

  this.init = function()
  {
    this.baseLayerUrl = '';
    this.setBaseLayerType('osm_mapnik', true);

    this.map = L.map('map', {
      minZoom: 4, maxZoom: 17,
      zoomControl: true
    }).setView([0, 0], 4);

    // scale control
    this.scaleControl = L.control.scale({
      position: 'topleft',
      metric: true,
      imperial: false,
      updateWhenIdle: true
    });
    this.scaleControl.addTo(this.map);

    // add an OpenStreetMap tile layer
    this.baseLayer = new L.TileLayer.Functional(function(view) {
      var url = self.baseLayerUrl
        .replace('{z}', view.zoom)
        .replace('{y}', view.tile.row)
        .replace('{x}', view.tile.column)
        .replace('{s}', view.subdomain);

      function onHasMapTile(has)
      {
        // tile is not in tiles cache, so directly return the url, maybe it's in browser cache
        if (!has) {
          console.log('Map tile not found: ' + url);
          deferred.reject(new Error('Map tile not found.'));
          //deferred.resolve(url);
        }
        // map tile available in cache, return it base64 encoded
        else {
          self.mapCache.getMapTile(self.baseLayerType, view.tile.column, view.tile.row, view.zoom, onGetMapTile);
        }
      }

      function onGetMapTile(err, mapTile) {
        if (err) {
          deferred.reject(err);
        }
        else {
          deferred.resolve(mapTile);
        }
      }

      // we are offline, so we are trying get a cached map tile
      if (self.offline) {
        var deferred = $.Deferred();
        self.mapCache.hasMapTile(self.baseLayerType, view.tile.column, view.tile.row, view.zoom, onHasMapTile);

        return deferred.promise();
      }

      // we are online, so return the url
      return url;
    }).addTo(this.map);

    var trackMarker = this.createUserMarker('track', '#00f');
    trackMarker.setZIndexOffset(-100);
    var marker = this.createUserMarker('user', '#f00');
    this.map.removeLayer(trackMarker);

    this.follow(marker);

    this.startWatching();
  };
}
util.inherits(Map, events.EventEmitter);
module.exports = Map;

},{"./../animation":2,"./../gpx":5,"./map_cache":10,"./place_marker":11,"./user_marker":12,"events":30,"util":35}],10:[function(require,module,exports){
"use strict";

function noop() {};

module.exports = function MapCache(map) {
  var self = this;
  this.map = map;

  function getTileUrls(bounds, tileLayer, zoom) {
    var min = self.map.map.project(bounds.getNorthWest(), zoom).divideBy(256).floor(),
      max = self.map.map.project(bounds.getSouthEast(), zoom).divideBy(256).floor(),
      urls = [];

    for (var i = min.x; i <= max.x; i++) {
      for (var j = min.y; j <= max.y; j++) {
        var coords = new L.Point(i, j);
        coords.z = zoom;
        urls.push(tileLayer.getTileUrl(coords));
      }
    }

    return urls;
  }

  this.saveMapRegion = function(bounds, progressCb, cb)
  {
    if (typeof progressCb !== 'function') {
      var progressCb = function() {};
    }
    if (typeof cb !== 'function') {
      var cb = function() {};
    }

    var numParallel = 3;
    var numTiles = 0;
    var tilesDone = 0;
    var nextTileIndex = 0;
    var minZoom = self.map.map.getZoom();
    var maxZoom = self.map.map.getMaxZoom();
    var urls = [];
    var errorTiles = 0;
    var done = false;

    // clear saved map tiles lookup
    this.savedMapTiles = null;

    function nextTile()
    {
      var url;

      if (tilesDone === numTiles && !done) {
        done = true;
        cb(null, errorTiles, numTiles);
        return;
      }
      else if (nextTileIndex < numTiles) {
        url = urls[nextTileIndex];
        nextTileIndex++;
        var parts = url.replace('.png','').split('/');
        var y = parseInt(parts.pop());
        var x = parseInt(parts.pop());
        var z = parseInt(parts.pop());
        self.saveMapTile(self.map.baseLayerType, x, y, z, url, onSaveMapTile);
      }

      function onSaveMapTile(err)
      {
        tilesDone++;
        progressCb(tilesDone / numTiles);

        for(var i = 0; i < numParallel; i++) {
          nextTile();
        }
      }
    }

    for(var zoom = minZoom; zoom <= maxZoom; zoom++) {
      urls = urls.concat(getTileUrls(bounds, self.map.baseLayer, zoom));
    }

    numTiles = urls.length;

    console.log('Will download ' + numTiles + ' map tiles.');

    for(var i = 0; i < numParallel; i++) {
      nextTile();
    }
  };

  this.clearSavedMapRegions = function(cb)
  {
    var numTiles = 0;

    // clear saved map tiles lookup
    this.savedMapTiles = null;

    localforage.keys(function(keys) {
      keys.forEach(function(key) {
        if (key.indexOf('map_tile_') === 0) {
          numTiles++;
          localforage.removeItem(key, noop);
        }
      });
      cb(null, numTiles);
    });
  };

  this.saveMapTile = function(type, x, y, z, srcUrl, cb)
  {
    if (typeof cb !== 'function') {
      var cb = function() {};
    }

    var id = 'map_tile_' + type + '_' + x + '_' + y + '_' + z;
    var mimetype;

    var mapTile = {
      type: type,
      x: x,
      y: y,
      z: z,
      url: srcUrl,
      image: null
    };

    localforage.getItem(id, onMapTileLoaded);

    function onMapTileLoaded(_mapTile) {
      if (!_mapTile) {
        loadImage(onImageLoaded);
      }
      else {
        cb(null);
      }
    }

    function loadImage(cb)
    {
      var req = new XMLHttpRequest();
      req.open('GET', srcUrl, true);
      req.responseType = 'arraybuffer';
      req.onload = function()
      {
        mimetype = req.getResponseHeader('content-type');
        var blob = new Blob([req.response], { type: mimetype });
        cb(null, blob);
      };
      req.onerror = function(error)
      {
        console.log(this, error);
        cb(error, null);
      };
      req.send();
    }

    function onImageLoaded(error, blob)
    {
      if (error) {
        console.warn('Unable to load image: ' + srcUrl);
        cb(error);
        return;
      }

      if (blob) {
        saveBlob(blob);
      }
    }

    function saveBlob(blob)
    {
      var reader = new FileReader();
      reader.onload = function()
      {
        mapTile.image = reader.result;
        localforage.setItem(id, mapTile, onMapTileSaved);
      };
      reader.onerror = function(error)
      {
        cb(error);
      };
      reader.readAsDataURL(blob);
    }

    function onMapTileSaved()
    {
      cb(null);
    }
  };

  this.getMapTile = function(type, x, y, z, cb)
  {
    if (typeof cb !== 'function') {
      var cb = function() {};
    }

    var id = 'map_tile_' + type + '_' + x + '_' + y + '_' + z;

    localforage.getItem(id, function(mapTile) {
      if (!mapTile) {
        cb(new Error('Unable to load ' + id));
      }
      else {
        cb(null, mapTile.image);
      }
    });
  };

  this.hasMapTile = function(type, x, y, z, cb)
  {
    if (typeof cb !== 'function') {
      var cb = function() {};
    }

    var id = 'map_tile_' + type + '_' + x + '_' + y + '_' + z;

    if (!this.savedMapTiles) {
      localforage.keys(function(keys) {
        self.savedMapTiles = [];

        keys.forEach(function(key) {
          if (key.indexOf('map_tile_') === 0){
            self.savedMapTiles.push(key);
          }
        });

        cb(self.savedMapTiles.indexOf(id) !== -1);
      });
    }
    else {
      cb(this.savedMapTiles.indexOf(id) !== -1);
    }


  };
};
},{}],11:[function(require,module,exports){
var mixin = require('./../mixin');

var PlaceMarker = {
  create: function(map, title, latLon, id)
  {
    var marker = L.marker(latLon, {
      title: title
    }).addTo(map.map);

    mixin(marker, PlaceMarker, [
      'save',
      'remove'
    ]);

    marker.title = title;
    marker.id = id || (new Date()).getTime();
    marker.map = map;
    marker.lat = latLon[0];
    marker.lon = latLon[1];

    marker.bindPopup(
        '<p>' + title + '</p>' +
        '<a href="javascript:void(0);" role="button" data-place-marker-id="' + marker.id + '" data-action="save" class="button place-marker-btn recommend save ' + (id ? 'invisible' : '') + '"><i class="fa fa-save"></i></a>' +
        '<a href="javascript:void(0);" role="button" data-place-marker-id="' + marker.id + '" data-action="remove" class="button place-marker-btn danger remove"><i class="fa fa-trash-o"></i></a>'
    );

    // listen for popupopen events and attach handlers to the created elements
    map.map.on('popupopen', function(event) {
      if (event.popup === marker.getPopup()) {
        $('[data-place-marker-id="' + marker.id + '"][data-action="save"]').on('click', marker.save.bind(marker));
        $('[data-place-marker-id="' + marker.id + '"][data-action="remove"]').on('click', marker.remove.bind(marker));
      }
    });

    return marker;
  },
  save: function()
  {
    var self = this;

    this.map.app.savePlaceMarker(this, function() {
      $('[data-place-marker-id="' + self.id + '"][data-action="save"]').addClass('invisible');
    });
  },
  remove: function()
  {
    var self = this;

    if (confirm(t(l.markers.removeConfirm))) {
      this.map.removePlaceMarker(this.id);
      this.map.app.removePlaceMarker(this.id);
    }
  }
};
module.exports = PlaceMarker;

},{"./../mixin":13}],12:[function(require,module,exports){
var Position = require('./../gpx').Position;
var Animation = require('./../animation');
var mixin = require('./../mixin');

var UserMarker = {
  create: function(map, name, color)
  {
    var icon = L.divIcon({
      className: 'user-marker-icon ' + name,
      html: '<span class="user-marker-icon-circle" style="background: ' + color + ';"></span>'
    });

    var marker = L.marker([0, 0],{
      icon: icon
    }).addTo(map.map);

    marker.color = color;
    marker.map = map;
    marker.speed = 0;
    marker.altitude = 0;
    marker.heading = 0;
    marker.lastPosition = null;
    marker.positionUpdatedAt = null;
    marker.trackHeading = 0;
    marker.trackDistance = 0;
    marker.tracing = false;
    marker.traces = [];

    mixin(marker, UserMarker, [
      'interpolatePosition',
      'updatePosition',
      'followGpx',
      'unfollowGpx',
      'startTracing',
      'endTracing',
      'clearTraces',
      'drawGpx'
    ]);

    marker.animation = new Animation();
    marker.animation.interpolate = UserMarker.interpolatePosition.bind(marker);
    marker.animation.onUpdate = marker.updatePosition.bind(marker);

    return marker;
  },

  interpolatePosition: function(from, to, offset)
  {
    var pos = new Position(
      Animation.interpolate(from.coords.latitude, to.coords.latitude, offset),
      Animation.interpolate(from.coords.longitude, to.coords.longitude, offset),
      Animation.interpolate(from.coords.altitude, to.coords.altitude, offset)
    );

    if (from.coords.heading) pos.coords.heading = Animation.interpolate(from.coords.heading, to.coords.heading, offset);
    if (from.coords.speed) pos.coords.speed = Animation.interpolate(from.coords.speed, to.coords.speed, offset);
    return pos;
  },

  updatePosition: function(position)
  {
    var currLatLng = this.getLatLng();

    if (typeof position === 'undefined') {
      var position = new Position(currLatLng.lat, currLatLng.lng, this.altitude);
    }

    var latLng = L.latLng(position.coords.latitude, position.coords.longitude);

    if (position.coords.heading) {
      this.heading = position.coords.heading;
    }
    // calculate heading
    else if (this.lastPosition) {
      this.heading = L.GeometryUtil.computeAngle(
        L.point(this.lastPosition.coords.latitude, this.lastPosition.coords.longitude),
        L.point(position.coords.latitude, position.coords.longitude)
      );
    }
    if (position.coords.speed) {
      this.speed = position.coords.speed;
    }
    // calculate speed
    else if (this.lastPosition)  {
      var distance = this.getLatLng().distanceTo(L.latLng(this.lastPosition.coords.latitude, this.lastPosition.coords.longitude));
      var timeDiff = (new Date()).getTime() - this.positionUpdatedAt.getTime();
      var t = timeDiff / 1000;
      this.speed = (distance / t);
    }
    if (position.coords.altitude) {
      this.altitude = position.coords.altitude;
    }

    if (!currLatLng.equals(latLng)) {
      // calculate track heading and distance
      if (this.map.drawnGpx) {
        var closestFraction = L.GeometryUtil.locateOnLine(this.map.map, this.map.drawnGpx, latLng);
        var closest = L.GeometryUtil.interpolateOnLine(this.map.map, this.map.drawnGpx, closestFraction);

        this.trackHeading = (L.GeometryUtil.computeAngle(
          L.point(latLng.lat, latLng.lng),
          L.point(closest.latLng.lat, closest.latLng.lng)
        )) % 360;
        this.trackDistance = latLng.distanceTo(closest.latLng);

        // position track marker
        this.map.userMarkers.track.setLatLng(closest.latLng);

        if (this.trackDistance < 10) {
          this.map.userMarkers.track.setOpacity(0);
        }
        else {
          this.map.userMarkers.track.setOpacity(1);
        }
      }

      // draw trace if tracing
      if (this.tracing) {
        this.traces[this.traces.length - 1].addLatLng(latLng);
      }

      this.setLatLng(latLng);
    }

    this.lastPosition = position;
    this.positionUpdatedAt = new Date();
  },

  followGpx: function(gpx, timeStretch, cb)
  {
    var self = this;
    this.gpx = gpx;
    this.animation.onDone = cb;

    var points = gpx.tracks[0].segments[0].points;
    var startTime = points[0].date.getTime();
    var endTime = points[points.length - 1].date.getTime();
    var duration = endTime - startTime;

    this.animation.duration = duration;

    points.forEach(function(point, i) {
      var time = point.date.getTime();
      var relTime = time - startTime;
      var offset = relTime / duration;
      // TODO: calculate heading and speed
      self.animation.addKeyframe(point, offset);
    });

    this.animation.play(timeStretch);
  },

  unfollowGpx: function()
  {
    this.gpx = null;
    this.animation.onDone = null;
    this.animation.stop();
    this.animation.clearKeyframes();
  },

  drawGpx: function(gpx)
  {
    if (gpx.tracks.length === 0 ||
      gpx.tracks[0].segments.length === 0 ||
      gpx.tracks[0].segments[0].points.length === 0) {
      return;
    }

    var latLng = L.latLng(
      gpx.tracks[0].segments[0].points[0].coords.latitude,
      gpx.tracks[0].segments[0].points[0].coords.longitude
    );
    var polyline = L.polyline(latLng, {color: this.color, opacity: 0.25, smoothness: 1.5});
    this.traces.push(polyline);

    gpx.tracks.forEach(function(track) {
      track.segments.forEach(function(segment) {
        var points = segment.points;
        points.forEach(function(point) {
          polyline.addLatLng(L.latLng(point.coords.latitude, point.coords.longitude));
        });
      });
    });

    polyline.addTo(this.map.map);
  },

  startTracing: function()
  {
    this.tracing = true;
    this.traces.push(L.polyline(this.getLatLng(), {color: this.color, opacity: 0.25, smoothness: 1.5}).addTo(this.map.map));
  },

  endTracing: function()
  {
    this.tracing = false;
  },

  clearTraces: function()
  {
    if (this.traces.length) {
      this.traces.forEach(this.map.map.removeLayer.bind(this.map.map));
      this.traces = [];
    }
  }
};
module.exports = UserMarker;
},{"./../animation":2,"./../gpx":5,"./../mixin":13}],13:[function(require,module,exports){
module.exports = function(dest, src, what)
{
  if (typeof what === 'undefined') {
    var what = Object.keys(src);
  }

  what.forEach(function(key) {
    if (src.hasOwnProperty(key)) {
      switch(typeof src[key]) {
        case 'function':
          dest[key] = src[key].bind(dest);
          break;

        default:
          dest[key] = src[key];
      }
    }
  });
};
},{}],14:[function(require,module,exports){
"use strict";

// custom data-* binder
rivets.binders['data-*'] = function(el, value) {
  var attr = this.type;
  el.setAttribute(attr, value);
};

// custom formatters
rivets.formatters.eq = function (value, args) {
  return value === args;
};
rivets.formatters.neq = function (value, args) {
  return value !== args;
};
rivets.formatters.gt = function(value, args) {
  return value > args;
};
rivets.formatters.gte = function(value, args) {
  return value >= args;
};
rivets.formatters.lt = function(value, args) {
  return value < args;
};
rivets.formatters.lte = function(value, args) {
  return value <= args;
};
rivets.formatters.length = function(value) {
  if (!value) {
    return 0;
  }
  return value.length || 0;
};
rivets.formatters.truthy = function (value, args) {
  return (value) ? true : false;
};
rivets.formatters.falsy = function (value, args) {
  return (!value) ? true : false;
};
rivets.formatters.toFixed = function(value, digits) {
  if (!value) {
    value = 0;
  }
  return value.toFixed(digits);
};
rivets.formatters.fraction = function(value, min, max)
{
  if (value < min) {
    return  0;
  }
  if (value > max) {
    return 1;
  }
  return (value - min) / (max - min);
};
rivets.formatters.sub = function(value, amount)
{
  return value - amount;
};
rivets.formatters.add = function(value, amount)
{
  return value + amount;
};
rivets.formatters.multiply = function(value, amount)
{
  return value * amount;
};
rivets.formatters.divide = function(value, amount)
{
  return value / amount;
};
rivets.formatters.t = window.t;

// custom binders
rivets.binders['rotate-x'] = function(el, value) {
  el.style.MozTransform = 'rotate(' + value + 'deg)';
};
rivets.binders.opacity = function(el, value) {
  if (value < 0) value = 0;
  if (value > 1) value = 1;
  el.style.opacity = value;
};
},{}],15:[function(require,module,exports){
"use strict";

module.exports.toArray = function(arr)
{
  return Array.prototype.slice.apply(arr);
};
module.exports.copy = function(src)
{
  var dest = {};
  Object.keys(src).forEach(function(key) {
    if (src.hasOwnProperty(key)) {
      dest[key] = src[key];
    }
  });

  return dest;
};
},{}],16:[function(require,module,exports){
var TestRunner = function()
{
  var self = this;
  this.tests = [];
  this.numTests = 0;
  this.testsRun = 0;

  this.addTest = function(test, callback)
  {
    this.tests.push({test: test, callback: callback});
  };

  this.runTests = function()
  {
    this.numTests = this.tests.length;
    this.testsRun = 0;
    runNextTest();
  };

  function testDone()
  {
    self.testsRun++;
    runNextTest();
  };

  function runNextTest()
  {
    if (self.testsRun < self.numTests) {
      var test = self.tests[self.testsRun];

      console.log((self.testsRun + 1) + '/' + self.numTests + ':\t' + test.test);

      // synchronous test
      if (test.callback.length === 0) {
        test.callback();
        testDone();
      }
      // async test
      else {
        test.callback(testDone);
      }
    }
    else {
      done();
    }
  };

  function done()
  {
    console.log('All tests finished.');
  };
};

module.exports = TestRunner;
},{}],17:[function(require,module,exports){
var TestRunner = require('./test_runner');
var request = require('browser-request');
var GpxParser = require('./gpx_parser');
var gpx = require('./gpx');
var assert = require('assert');
var testGpx;

module.exports = function(app, map, ui) {
  var self = this;

  this.app = app;
  this.map = map;
  this.ui = ui;

  this.testRunner = new TestRunner();
  this.run = this.testRunner.runTests.bind(this.testRunner);

  var test = this.testRunner.addTest.bind(this.testRunner);

  test('load gpx', function(next) {
    request('./tests/fixtures/1719117.gpx', function(error, res) {
      if (error) {
        throw error;
        return;
      }

      testGpx = (new GpxParser()).parse(res.body);
      testGpx.calculate();
      next();
    });
  });

  test('convert gpx to json and back', function() {
    var gpxJson = testGpx.toJSON();
    assert.equal(gpxJson.tracks.length, testGpx.tracks.length);

    gpxJson.tracks.forEach(function(jsonTrack, i) {
      var track = testGpx.tracks[i];
      assert.equal(jsonTrack.segments.length, track.segments.length);
      assert.equal(jsonTrack.name, track.name);

      jsonTrack.segments.forEach(function(jsonSegment, i) {
        var segment = track.segments[i];
        assert.equal(jsonSegment.points.length, segment.points.length);

        jsonSegment.points.forEach(function(jsonPoint, i) {
          var point = segment.points[i];

          assert.deepEqual(jsonPoint.coords, point.coords);
          assert.equal(jsonPoint.date, point.date);
        });
      });
    });

    assert.equal(gpxJson.waypoints.length, testGpx.waypoints.length);
    gpxJson.waypoints.forEach(function(jsonWaypoint, i) {
      var waypoint = testGpx.waypoints[i];
      assert.deepEqual(jsonWaypoint.position.coords, waypoint.position.coords);
      assert.equal(jsonWaypoint.position.date, waypoint.position.date);
      assert.equal(jsonWaypoint.name, waypoint.name);
    });

    var _gpx = gpx.Gpx.fromJSON(gpxJson);
    assert.deepEqual(_gpx, testGpx);
    /*
    assert.equal(_gpx.tracks.length, testGpx.tracks.length);

    _gpx.tracks.forEach(function(jsonTrack, i) {
      var track = testGpx.tracks[i];
      assert.equal(jsonTrack.segments.length, track.segments.length);
      assert.equal(jsonTrack.name, track.name);

      jsonTrack.segments.forEach(function(jsonSegment, i) {
        var segment = track.segments[i];
        assert.equal(jsonSegment.points.length, segment.points.length);

        jsonSegment.points.forEach(function(jsonPoint, i) {
          var point = segment.points[i];

          assert.deepEqual(jsonPoint.coords, point.coords);
          assert.equal(jsonPoint.date, point.date);
        });
      });
    });

    assert.equal(_gpx.waypoints.length, testGpx.waypoints.length);
    _gpx.waypoints.forEach(function(jsonWaypoint, i) {
      var waypoint = testGpx.waypoints[i];
      assert.deepEqual(jsonWaypoint.position.coords, waypoint.position.coords);
      assert.equal(jsonWaypoint.position.date, waypoint.position.date);
      assert.equal(jsonWaypoint.name, waypoint.name);
    });*/
  });

  test('draw a gpx route', function(next) {
    self.map.drawGpx(testGpx, '#000', true);

    setTimeout(function() {
      self.map.clearGpx();
      next();
    }, 2000);
  });

  test('follow a gpx route', function(next) {
    self.map.unfollow(self.map.userMarkers.user);
    var marker = self.map.createUserMarker('gpx-test', '#000');
    var gpx = testGpx.clone();

    // only use the first 100 points
    gpx.tracks[0].segments[0].points.splice(100);

    self.map.follow(marker);
    self.map.map.setZoom(12);

    marker.followGpx(gpx, 10000, function() {
      self.map.unfollow(marker);
      marker.unfollowGpx();
      marker.endTracing();
      marker.clearTraces();
      self.map.removeUserMarker('gpx-test');
      next();
    });
    marker.startTracing();
  });

  test('display and loosely follow a gpx track', function(next) {
    // unwatch user marker
    self.app.unwatchPosition(self.map.watchPositionId);

    self.map.endWatching();

    var marker = self.map.userMarkers.user;
    var gpx = testGpx.clone();

    // only use the first 100 points
    gpx.tracks[0].segments[0].points.splice(100);

    var gpxShifted = gpx.clone();
    gpxShifted.tracks[0].segments[0].points.forEach(function(point) {
      point.coords.latitude += 0.01;
      point.coords.longitude += 0.01;
    });

    self.map.follow(marker);
    self.map.map.setZoom(16);
    self.map.drawGpx(gpx, '#00f');

    marker.followGpx(gpxShifted, 1000, function() {
      self.map.unfollow(marker);
      marker.unfollowGpx();

      self.map.clearGpx();
      next();
    });
  });

  test('record a gpx track', function(next) {
    // empty segments
    self.app.recordedGpx.tracks[0].segments.splice(0);

    // unwatch user marker
    self.app.unwatchPosition(self.map.watchPositionId);

    self.map.endWatching();

    // monkey patch app.watchPosition
    var _watchPosition = self.app.watchPosition;
    var _unwatchPosition = self.app.unwatchPosition;
    var watchPositionCb;

    self.app.watchPosition = function(cb)
    {
      watchPositionCb = cb;
      return 1;
    };
    self.app.unwatchPosition = function(id)
    {

    };

    self.map.startWatching();
    self.app.startRecording();

    assert.equal(self.app.recordedGpx.tracks[0].segments.length, 1);

    var marker = self.map.userMarkers.user;
    var gpx = testGpx.clone();
    var currentPointIndex = 0;

    marker.addEventListener('move', function() {
      var position = gpx.tracks[0].segments[0].points[currentPointIndex];
      watchPositionCb(position);
      currentPointIndex++;
    });

    // only use the first 100 points
    gpx.tracks[0].segments[0].points.splice(100);

    self.map.follow(marker);
    self.map.map.setZoom(12);

    marker.followGpx(gpx, 10000, function() {
      self.app.watchPosition = _watchPosition;
      self.app.unwatchPosition = _unwatchPosition;

      marker.unfollowGpx();
      self.map.unfollow(marker);
      self.app.stopRecording();

      var segment = self.app.recordedGpx.tracks[0].segments[0];
      assert.equal(segment.points.length, 100);
      gpx.tracks[0].segments[0].points.forEach(function(point, i) {
        var _point = segment.points[i];
        assert.deepEqual(point.coords, _point.coords);
      });

      self.map.clearGpx();
      self.app.saveRecording();
      next();
    });
  });
};
},{"./gpx":5,"./gpx_parser":6,"./test_runner":16,"assert":27,"browser-request":26}],18:[function(require,module,exports){
"use strict";

module.exports = new (function() {
  this.toggleBaseLayers = function()
  {
    if (!this.show.baseLayers) {
      this.baseLayers.forEach(function (baseLayer) {
        if (!baseLayer.name) {
          baseLayer.name = t(l.layers.types[baseLayer.type]);
        }
      });
    }
    this.show.baseLayers = (this.show.baseLayers) ? false : true;
  };

  this.selectBaseLayer = function(type)
  {
    this.map.setBaseLayerType(type);
    this.show.baseLayers = false;
    this.hideMainMenu();
  };

  // event handlers
  this.initBaseLayers = function() {
    var self = this;

    this.onBaseLayersBtn = this.toggleBaseLayers.bind(this);

    this.onBaseLayerOption = function()
    {
      self.selectBaseLayer(this.dataset.type);
    };

    this.onBaseLayersCancelBtn = function()
    {
      self.show.baseLayers = false;
    };
  };
})();
},{}],19:[function(require,module,exports){
"use strict";

module.exports = new (function() {
  this.geocode = function()
  {
    var self = this;

    this.app.geocoder.results = null;
    this.show.geocoderResults = true;
    this.app.geocoder.search(this.app.geocoder.query, this.app.map.map.getBounds(), function(error, results) {
      if (error) {
        console.warn('Unable to geocode.');
        return;
      }

      self.app.geocoder.results = results;
    });
  };

  this.toggleGeocoder = function()
  {
    this.show.subMenu = (this.show.subMenu === "geocoder") ? false : "geocoder";

    if (this.show.subMenu !== 'geocoder') {
      this.show.geocoderResults = false;
    }
  };

  // event handlers
  this.initGeocoder = function() {
    var self = this;

    this.onGeocoderBtn = this.toggleGeocoder.bind(this);
    this.onGeocoderSearchBtn = this.geocode.bind(this);
    this.onGeocoderInputKeyup = function(event) {
      if (event.which === 13) {
        self.geocode();
      }
    };
    this.onGeocoderResultBtn = function() {
      var lat = parseFloat(this.dataset.lat);
      var lon = parseFloat(this.dataset.lon);
      var title = this.dataset.title;

      self.map.map.setView([lat, lon]);
      self.map.createPlaceMarker(title, [lat, lon]);
      self.map.unfollow();
      self.show.geocoderResults = false;
      self.show.subMenu = false;
    };
  };
})();
},{}],20:[function(require,module,exports){
"use strict";

var shared = require('./../shared');
var mixin = require('./../mixin');
var rv_extra = require('./../rivets_extra');

module.exports = function(app, map) {
  this.app = app;
  this.map = map;
  this.state = null;

  this.show = {
    header: true,
    mainMenu: false,
    map: true,
    toolbar: true,
    tracks: false,
    hud: true,
    saveMapRegion: false,
    progress: false,
    subMenu: false,
    geocoderResults: false,
    stats: false,
    headerBack: false,
    places: false
  };

  this.progress = {
    title: null,
    value: 0,
    max: 100
  };

  this.tracks = [];

  this.baseLayers = [
    { type: 'osm_mapnik', name: null },
    { type: 'osm_cyclemap', name: null },
    { type: 'osm_transmap', name: null }
  ];

  var self = this;

  this.noop = function() {};

  this.setState = function(name, revertAfter)
  {
    var state = this.state;
    this.state = name;

    if (revertAfter) {
      setTimeout(
        self.setState.bind(self, state),
        revertAfter
      );
    }
  };

  this.tests = function()
  {
    this.hideMainMenu();
    tests.run();
  };

  this.findMe = function()
  {
    this.map.centerViewOn(this.map.userMarkers.user);
    this.map.startWatching();
  };

  this.toggleFollowing = function()
  {
    this.map.toggleFollowing(this.map.userMarkers.user);
  };

  mixin(this, require('./main_menu'));
  mixin(this, require('./tracks'));
  mixin(this, require('./base_layers'));
  mixin(this, require('./geocoder'));
  mixin(this, require('./map_cache'));
  mixin(this, require('./stats'));
  mixin(this, require('./places'));

  this.init = function() {
    this.initMainMenu();
    this.initTracks();
    this.initBaseLayers();
    this.initGeocoder();
    this.initMapCache();
    this.initStats();
    this.initPlaces();

    // header buttons
    this.onHeaderBackBtn = this.noop;

    // main menu buttons
    this.onTestsBtn = this.tests.bind(this);

    // footer buttons
    this.onToggleOfflineBtn = function()
    {
      self.map.setOffline((self.map.offline) ? false : true);
    };
    this.onFollowBtn = this.toggleFollowing.bind(this);
    this.onFindMeBtn = this.findMe.bind(this);

    // initialize the rivets magic
    this.appElement = document.getElementById('app');

    this.view = rivets.bind(this.appElement, {
      ui: this,
      l: window.l
    });
    rivets.configure();

    this.setState('waiting');
  };
};
},{"./../mixin":13,"./../rivets_extra":14,"./../shared":15,"./base_layers":18,"./geocoder":19,"./main_menu":21,"./map_cache":22,"./places":23,"./stats":24,"./tracks":25}],21:[function(require,module,exports){
"use strict";

module.exports = new (function() {
  this.toggleMainMenu = function() {
    if (this.show.mainMenu) {
      this.hideMainMenu();
    }
    else {
      this.showMainMenu();
    }
  };

  this.hideMainMenu = function()
  {
    this.show.mainMenu = false;
    this.show.stats = false;
    this.show.places = false;
    this.show.toolbar = true;
    this.show.map = true;
  };

  this.showMainMenu = function()
  {
    this.show.mainMenu = true;
    this.show.toolbar = false;
    this.show.map = false;
    this.show.stats = false;
    this.show.places = false;
  };

  // event handlers
  this.initMainMenu = function() {
    var self = this;

    this.onMainMenuBtn = this.toggleMainMenu.bind(this);
    this.onMainMenuCancelBtn = this.hideMainMenu.bind(this);
  };
})();
},{}],22:[function(require,module,exports){
"use strict";

module.exports = new (function() {
  this.saveMapRegion = function()
  {
    this.map.unfollow();
    this.hideMainMenu();
    this.show.saveMapRegion = true;
  };

  this.clearSavedMapRegions = function()
  {
    if (confirm(t(l.mapCache.clearConfirm))) {

      this.map.mapCache.clearSavedMapRegions(function(error, numTiles) {
        if (error) {
          alert(t(l.mapCache.clearError));
          return;
        }

        alert(t(l.mapCache.clearSuccess, numTiles));
      });
    }
  };

  // event handlers
  this.initMapCache = function () {
    var self = this;

    this.onSaveMapRegionBtn = this.saveMapRegion.bind(this);
    this.onClearSavedMapRegionsBtn = this.clearSavedMapRegions.bind(this);

    this.onSaveMapRegionOkBtn = function()
    {
      self.show.saveMapRegion = false;
      self.progress.value = 0;
      self.show.progress = true;

      function onProgress(progress)
      {
        self.progress.value = progress * 100;
      }

      function onDone(error, errorTiles, numTiles)
      {
        self.show.progress = false;
        self.progress.title = null;
        self.progress.value = 0;

        if (error) {
          alert(t(l.mapCache.saveError));
        }

        var msg = t(l.mapCache.saveSuccess, numTiles);
        if (errorTiles > 0) {
          msg = t(l.mapCache.savePartly, errorTiles, numTiles);
        }
        alert(msg);
      }

      // if map is in offline mode, make it online now
      self.map.setOffline(false);
      self.map.mapCache.saveMapRegion(self.map.map.getBounds(), onProgress, onDone);
    };
    this.onSaveMapRegionCancelBtn = function()
    {
      self.show.saveMapRegion = false;
    };
  };
})();
},{}],23:[function(require,module,exports){
"use strict";

module.exports = new (function() {
  this.togglePlaces = function()
  {
    if (this.show.places) {
      this.showPlaces();
    }
    else {
      this.hidePlaces();
    }
  };

  this.showPlaces = function()
  {
    this.placeMarkers = [];
    for(var id in this.map.placeMarkers) {
      this.placeMarkers.push(this.map.placeMarkers[id]);
    }
    this.placeMarkers.sort(function(a, b) {
      return (a.title < b.title) ? -1 : 1;
    });

    this.hideMainMenu();
    this.show.places = true;
  };

  this.hidePlaces = function()
  {
    this.show.places = false;
    this.showMainMenu();
  };

  // event handlers
  this.initPlaces = function() {
    var self = this;

    this.onPlacesBtn = this.showPlaces.bind(this);
    this.onPlacesCancelBtn = this.hidePlaces.bind(this);
    this.onPlaceBtn = function()
    {
      var lat = parseFloat(this.dataset.lat);
      var lon = parseFloat(this.dataset.lon);

      self.map.map.setView([lat, lon]);
      self.map.unfollow();
      self.show.places = false;
    }
  };
})();
},{}],24:[function(require,module,exports){
"use strict";

function Stat(gpx, id, title) {
  this.gpx = gpx;
  this.id = id;
  this.tabId = 'tab-' + this.id;
  this.href = '#' + this.id;
  this.title = title;
}

module.exports = new (function() {
  this.toggleStats = function() {
    if (this.show.stats) {
      this.hideStats();
    } else {
      this.showStats();
    }
  };

  this.hideStats = function() {
    this.show.stats = false;
    this.show.toolbar = true;
    this.show.map = true;
    this.show.headerBack = false;
    this.onHeaderBackBtn = this.noop;
  };

  this.showStats = function() {
    this.show.stats = true;
    this.show.mainMenu = false;
    this.show.toolbar = false;
    this.show.map = false;
    this.show.headerBack = true;
    this.onHeaderBackBtn = this.hideStats.bind(this);
  };

  this.initStats = function() {
    var self = this;

    $(document).one('localeLoad', function() {
      self.stats = [
        new Stat(self.app.recordedGpx, 'recorded-track-stat', l.stats.recordedTrack),
        new Stat(self.map.drawnGpx, 'drawn-track-stat', l.stats.loadedTrack)
      ];
    });

    this.onStatsBtn = this.showStats.bind(this);
    this.onStatsCancelBtn = this.hideStats.bind(this);
  }
})();
},{}],25:[function(require,module,exports){
"use strict";

var path = require('path');
var fs = require('ffos-fs');
var request = require('browser-request');

module.exports = new (function() {
  this.toggleTrackRecorder = function () {
    this.show.subMenu = (this.show.subMenu === "trackRecorder") ? false : "trackRecorder";
  };

  this.toggleGeocoder = function () {
    this.show.subMenu = (this.show.subMenu === "geocoder") ? false : "geocoder";

    if (this.show.subMenu !== 'geocoder') {
      this.show.geocoderResults = false;
    }
  };

  this.showTracks = function()
  {
    var self = this;

    this.show.tracks = true;

    if (!navigator.getDeviceStorage) {
      var _tracks = [{ name: 'tests/fixtures/1719117.gpx' }];
      onTracksLoaded(_tracks);
    }
    else {
      this.app.getTracks(onTracksLoaded);
    }

    function onTracksLoaded(tracks) {
      // empty current tracks
      self.tracks.splice(0, self.tracks.length);

      tracks.filter(function(track) {
        return path.extname(track.name) === '.gpx';
      });

      tracks.forEach(function(track, i) {
        track.index = i;
        track.basename = path.basename(track.name);

        self.tracks.push(track);
      });
    }
  };

  this.hideTracks = function()
  {
    this.show.tracks = false;
  };

  this.showTrack = function(track)
  {
    var self = this;

    function onGpxLoaded(error, gpxStr) {
      if (error) {
        console.warn('Error reading gpx track.');
        console.log(error);
        alert(t(l.tracks.loadError));
        return;
      }

      var gpx = self.app.createGpxFromString(gpxStr);

      self.map.drawGpx(gpx, '#00f', true);
      self.map.userMarkers.user.updatePosition();
      self.stats[1].gpx = gpx;
      self.hideTracks();
      self.hideMainMenu();
    }

    if (!navigator.getDeviceStorage) {
      request(track.name, function(error, req, body) {
        onGpxLoaded(error, body);
      });
    }
    else {
      fs.readFile('sdcard:' + track.name, onGpxLoaded);
    }
  };

  this.record = function() {
    this.app.startRecording();
    this.map.userMarkers.user.startTracing();
  };

  this.pause = function() {
    this.app.stopRecording();
    this.map.userMarkers.user.endTracing();
  };

  this.save = function() {
    this.show.subMenu = false;
    this.app.saveRecording(null, function(error, filename) {
      if (error) {
        alert(t(l.tracks.saveError));
        return;
      }

      alert(t(l.tracks.saveSuccess, filename));
    });
  };

  this.clearRecorded = function()
  {
    this.show.trackRecorder = false;
    if (confirm(t(l.tracks.clearRecordedConfirm))) {
      this.app.clearRecordedGpx();
      this.map.userMarkers.user.clearTraces();
    }
  };

  // event handlers
  this.initTracks = function() {
    var self = this;

    this.onTrackRecorderBtn = this.toggleTrackRecorder.bind(this);
    this.onRecordBtn = this.record.bind(this);
    this.onPauseBtn = this.pause.bind(this);
    this.onSaveRecordingBtn = this.save.bind(this);
    this.onClearRecordedBtn = this.clearRecorded.bind(this);
    this.onTracksBtn = this.showTracks.bind(this);
    this.onTracksCancelBtn = this.hideTracks.bind(this);
    this.onTracksOption = function() {
      self.showTrack(self.tracks[parseInt(this.dataset.track)]);
    };
  };
})();
},{"browser-request":26,"ffos-fs":36,"path":32}],26:[function(require,module,exports){
// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var XHR = XMLHttpRequest
if (!XHR) throw new Error('missing XMLHttpRequest')

module.exports = request
request.log = {
  'trace': noop, 'debug': noop, 'info': noop, 'warn': noop, 'error': noop
}

var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request(options, callback) {
  // The entry-point to the API: prep the options object and pass the real work to run_xhr.
  if(typeof callback !== 'function')
    throw new Error('Bad callback given: ' + callback)

  if(!options)
    throw new Error('No options given')

  var options_onResponse = options.onResponse; // Save this for later.

  if(typeof options === 'string')
    options = {'uri':options};
  else
    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

  options.onResponse = options_onResponse // And put it back.

  if (options.verbose) request.log = getLogger();

  if(options.url) {
    options.uri = options.url;
    delete options.url;
  }

  if(!options.uri && options.uri !== "")
    throw new Error("options.uri is a required argument");

  if(typeof options.uri != "string")
    throw new Error("options.uri must be a string");

  var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupported_options.length; i++)
    if(options[ unsupported_options[i] ])
      throw new Error("options." + unsupported_options[i] + " is not supported")

  options.callback = callback
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.body    = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if(options.headers.host)
    throw new Error("Options.headers.host is not supported");

  if(options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if(options.method !== 'GET')
      options.headers['content-type'] = 'application/json'

    if(typeof options.json !== 'boolean')
      options.body = JSON.stringify(options.json)
    else if(typeof options.body !== 'string')
      options.body = JSON.stringify(options.body)
  }

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if(options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // XXX Browsers do not like this.
  //if(options.body)
  //  options.headers['content-length'] = options.body.length;

  // HTTP basic authentication
  if(!options.headers.authorization && options.auth)
    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

  return run_xhr(options)
}

var req_seq = 0
function run_xhr(options) {
  var xhr = new XHR
    , timed_out = false
    , is_cors = is_crossDomain(options.uri)
    , supports_cors = ('withCredentials' in xhr)

  req_seq += 1
  xhr.seq_id = req_seq
  xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if(is_cors && !supports_cors) {
    var cors_err = new Error('Browser does not support cross-origin request: ' + options.uri)
    cors_err.cors = 'unsupported'
    return options.callback(cors_err, xhr)
  }

  xhr.timeoutTimer = setTimeout(too_late, options.timeout)
  function too_late() {
    timed_out = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id':xhr._id, 'milliseconds':options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response':false, 'loading':false, 'end':false}

  xhr.onreadystatechange = on_state_change
  xhr.open(options.method, options.uri, true) // asynchronous
  if(is_cors)
    xhr.withCredentials = !! options.withCredentials
  xhr.send(options.body)
  return xhr

  function on_state_change(event) {
    if(timed_out)
      return request.log.debug('Ignoring timed out state change', {'state':xhr.readyState, 'id':xhr.id})

    request.log.debug('State change', {'state':xhr.readyState, 'id':xhr.id, 'timed_out':timed_out})

    if(xhr.readyState === XHR.OPENED) {
      request.log.debug('Request started', {'id':xhr.id})
      for (var key in options.headers)
        xhr.setRequestHeader(key, options.headers[key])
    }

    else if(xhr.readyState === XHR.HEADERS_RECEIVED)
      on_response()

    else if(xhr.readyState === XHR.LOADING) {
      on_response()
      on_loading()
    }

    else if(xhr.readyState === XHR.DONE) {
      on_response()
      on_loading()
      on_end()
    }
  }

  function on_response() {
    if(did.response)
      return

    did.response = true
    request.log.debug('Got response', {'id':xhr.id, 'status':xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if(is_cors && xhr.statusCode == 0) {
      var cors_err = new Error('CORS request rejected: ' + options.uri)
      cors_err.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      return options.callback(cors_err, xhr)
    }

    options.onResponse(null, xhr)
  }

  function on_loading() {
    if(did.loading)
      return

    did.loading = true
    request.log.debug('Response body loading', {'id':xhr.id})
    // TODO: Maybe simulate "data" events by watching xhr.responseText
  }

  function on_end() {
    if(did.end)
      return

    did.end = true
    request.log.debug('Request done', {'id':xhr.id})

    xhr.body = xhr.responseText
    if(options.json) {
      try        { xhr.body = JSON.parse(xhr.responseText) }
      catch (er) { return options.callback(er, xhr)        }
    }

    options.callback(null, xhr, xhr.body)
  }

} // request

request.withCredentials = false;
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

//
// defaults
//

request.defaults = function(options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if(typeof params === 'string')
        params = {'uri': params};
      else {
        params = JSON.parse(JSON.stringify(params));
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ];
shortcuts.forEach(function(shortcut) {
  var method = shortcut.toUpperCase();
  var func   = shortcut.toLowerCase();

  request[func] = function(opts) {
    if(typeof opts === 'string')
      opts = {'method':method, 'uri':opts};
    else {
      opts = JSON.parse(JSON.stringify(opts));
      opts.method = method;
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]));
    return request.apply(this, args);
  }
})

//
// CouchDB shortcut
//

request.couch = function(options, callback) {
  if(typeof options === 'string')
    options = {'uri':options}

  // Just use the request API to do JSON.
  options.json = true
  if(options.body)
    options.json = options.body
  delete options.body

  callback = callback || noop

  var xhr = request(options, couch_handler)
  return xhr

  function couch_handler(er, resp, body) {
    if(er)
      return callback(er, resp, body)

    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      // The body is a Couch JSON object indicating the error.
      er = new Error('CouchDB error: ' + (body.error.reason || body.error.error))
      for (var key in body)
        er[key] = body[key]
      return callback(er, resp, body);
    }

    return callback(er, resp, body);
  }
}

//
// Utility
//

function noop() {}

function getLogger() {
  var logger = {}
    , levels = ['trace', 'debug', 'info', 'warn', 'error']
    , level, i

  for(i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if(typeof console !== 'undefined' && console && console[level])
      logger[level] = formatted(console, level)
  }

  return logger
}

function formatted(obj, method) {
  return formatted_logger

  function formatted_logger(str, context) {
    if(typeof context === 'object')
      str += ' ' + JSON.stringify(context)

    return obj[method].call(obj, str)
  }
}

// Return whether a URL is a cross-domain request.
function is_crossDomain(url) {
  var rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from window.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = location.href }
  catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement( "a" );
    ajaxLocation.href = "";
    ajaxLocation = ajaxLocation.href;
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
    , parts = rurl.exec(url.toLowerCase() )

  var result = !!(
    parts &&
    (  parts[1] != ajaxLocParts[1]
    || parts[2] != ajaxLocParts[2]
    || (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
    )
  )

  //console.debug('is_crossDomain('+url+') -> ' + result)
  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64_enc (data) {
    // Encodes string using MIME base64 algorithm
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc="", tmp_arr = [];

    if (!data) {
        return data;
    }

    // assume utf8 data
    // data = this.utf8_encode(data+'');

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1<<16 | o2<<8 | o3;

        h1 = bits>>18 & 0x3f;
        h2 = bits>>12 & 0x3f;
        h3 = bits>>6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join('');

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
        break;
        case 2:
            enc = enc.slice(0, -1) + '=';
        break;
    }

    return enc;
}

},{}],27:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":29}],28:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],29:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("FWaASH"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":28,"FWaASH":33,"inherits":31}],30:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],31:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],32:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("FWaASH"))
},{"FWaASH":33}],33:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],34:[function(require,module,exports){
module.exports=require(28)
},{}],35:[function(require,module,exports){
module.exports=require(29)
},{"./support/isBuffer":34,"FWaASH":33,"inherits":31}],36:[function(require,module,exports){
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
},{}],37:[function(require,module,exports){
/*! sprintf.js | Copyright (c) 2007-2013 Alexandru Marasteanu <hello at alexei dot ro> | 3 clause BSD license */

(function(ctx) {
	var sprintf = function() {
		if (!sprintf.cache.hasOwnProperty(arguments[0])) {
			sprintf.cache[arguments[0]] = sprintf.parse(arguments[0]);
		}
		return sprintf.format.call(null, sprintf.cache[arguments[0]], arguments);
	};

	sprintf.format = function(parse_tree, argv) {
		var cursor = 1, tree_length = parse_tree.length, node_type = '', arg, output = [], i, k, match, pad, pad_character, pad_length;
		for (i = 0; i < tree_length; i++) {
			node_type = get_type(parse_tree[i]);
			if (node_type === 'string') {
				output.push(parse_tree[i]);
			}
			else if (node_type === 'array') {
				match = parse_tree[i]; // convenience purposes only
				if (match[2]) { // keyword argument
					arg = argv[cursor];
					for (k = 0; k < match[2].length; k++) {
						if (!arg.hasOwnProperty(match[2][k])) {
							throw(sprintf('[sprintf] property "%s" does not exist', match[2][k]));
						}
						arg = arg[match[2][k]];
					}
				}
				else if (match[1]) { // positional argument (explicit)
					arg = argv[match[1]];
				}
				else { // positional argument (implicit)
					arg = argv[cursor++];
				}

				if (/[^s]/.test(match[8]) && (get_type(arg) != 'number')) {
					throw(sprintf('[sprintf] expecting number but found %s', get_type(arg)));
				}
				switch (match[8]) {
					case 'b': arg = arg.toString(2); break;
					case 'c': arg = String.fromCharCode(arg); break;
					case 'd': arg = parseInt(arg, 10); break;
					case 'e': arg = match[7] ? arg.toExponential(match[7]) : arg.toExponential(); break;
					case 'f': arg = match[7] ? parseFloat(arg).toFixed(match[7]) : parseFloat(arg); break;
					case 'o': arg = arg.toString(8); break;
					case 's': arg = ((arg = String(arg)) && match[7] ? arg.substring(0, match[7]) : arg); break;
					case 'u': arg = arg >>> 0; break;
					case 'x': arg = arg.toString(16); break;
					case 'X': arg = arg.toString(16).toUpperCase(); break;
				}
				arg = (/[def]/.test(match[8]) && match[3] && arg >= 0 ? '+'+ arg : arg);
				pad_character = match[4] ? match[4] == '0' ? '0' : match[4].charAt(1) : ' ';
				pad_length = match[6] - String(arg).length;
				pad = match[6] ? str_repeat(pad_character, pad_length) : '';
				output.push(match[5] ? arg + pad : pad + arg);
			}
		}
		return output.join('');
	};

	sprintf.cache = {};

	sprintf.parse = function(fmt) {
		var _fmt = fmt, match = [], parse_tree = [], arg_names = 0;
		while (_fmt) {
			if ((match = /^[^\x25]+/.exec(_fmt)) !== null) {
				parse_tree.push(match[0]);
			}
			else if ((match = /^\x25{2}/.exec(_fmt)) !== null) {
				parse_tree.push('%');
			}
			else if ((match = /^\x25(?:([1-9]\d*)\$|\(([^\)]+)\))?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-fosuxX])/.exec(_fmt)) !== null) {
				if (match[2]) {
					arg_names |= 1;
					var field_list = [], replacement_field = match[2], field_match = [];
					if ((field_match = /^([a-z_][a-z_\d]*)/i.exec(replacement_field)) !== null) {
						field_list.push(field_match[1]);
						while ((replacement_field = replacement_field.substring(field_match[0].length)) !== '') {
							if ((field_match = /^\.([a-z_][a-z_\d]*)/i.exec(replacement_field)) !== null) {
								field_list.push(field_match[1]);
							}
							else if ((field_match = /^\[(\d+)\]/.exec(replacement_field)) !== null) {
								field_list.push(field_match[1]);
							}
							else {
								throw('[sprintf] huh?');
							}
						}
					}
					else {
						throw('[sprintf] huh?');
					}
					match[2] = field_list;
				}
				else {
					arg_names |= 2;
				}
				if (arg_names === 3) {
					throw('[sprintf] mixing positional and named placeholders is not (yet) supported');
				}
				parse_tree.push(match);
			}
			else {
				throw('[sprintf] huh?');
			}
			_fmt = _fmt.substring(match[0].length);
		}
		return parse_tree;
	};

	var vsprintf = function(fmt, argv, _argv) {
		_argv = argv.slice(0);
		_argv.splice(0, 0, fmt);
		return sprintf.apply(null, _argv);
	};

	/**
	 * helpers
	 */
	function get_type(variable) {
		return Object.prototype.toString.call(variable).slice(8, -1).toLowerCase();
	}

	function str_repeat(input, multiplier) {
		for (var output = []; multiplier > 0; output[--multiplier] = input) {/* do nothing */}
		return output.join('');
	}

	/**
	 * export to either browser or node.js
	 */
	ctx.sprintf = sprintf;
	ctx.vsprintf = vsprintf;
})(typeof exports != "undefined" ? exports : window);

},{}],38:[function(require,module,exports){
module.exports={
  "name": "osm-trip",
  "version": "0.0.5",
  "description": "Plan and do your trips with OpenStreetMaps",
  "main": "index.js",
  "directories": {
    "test": "tests"
  },
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "Ondrej Brinkel <info@anzui.de>",
  "license": "MIT",
  "devDependencies": {
    "node-static": "^0.7.3",
    "browserify": "^4.1.7",
    "jake": "^0.7.15",
    "watchify": "^0.10.2",
    "leaflet-geometryutil": "^0.3.0",
    "sprintf-js": "0.0.7",
    "watch-glob": "^0.1.3"
  }
}

},{}]},{},[1])