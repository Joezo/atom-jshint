'use strict';

var JSHINT = require('jshint').JSHINT;

process.on('message', function(m) {
  if (m.method === 'run') {
    if (!JSHINT(m.text, m.options, m.config)) {
      //sometimes jshint creates a null object in the array
      process.send(JSHINT.errors.filter(function(error) {
        return error !== null;
      }));
    } else {
      process.send([]);
    }
  }
});
