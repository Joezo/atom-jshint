var Subscriber, AtomJshint;
var cp = require('child_process');
var _ = require('underscore-plus');
var JSHINT_Worker = null;

var Subscriber = require('emissary').Subscriber;
var fs = require('fs');
var path = require('path');

module.exports = AtomJshint = (function(){
  JSHINT_Worker = cp.fork(__dirname + '/worker.js');
  process.on('exit', function() {
    JSHINT_Worker.kill();
  });
  var $ = require('atom').$;
  function AtomJsHint(){
    atom.workspace.eachEditor((function(self) {
      return function(editor) {
        return self.handleEvents(editor);
      };
    })(this));
    this.config = {globals:{},options:{}};
    this.loadConfig();
  }
  Subscriber.includeInto(AtomJsHint);

  AtomJsHint.prototype.destroy = function(){
    return this.unsubscribe();
  };

  AtomJsHint.prototype.handleEvents = function(editor) {
    var buffer = editor.getBuffer();
    var listenFor = [];
    if( atom.config.get('atom-jshint.hintOnModify') ){ listenFor.push('contents-modified'); }
    if( atom.config.get('atom-jshint.hintOnSave') ) { listenFor.push('saved'); }

    this.subscribe(atom.workspaceView, 'pane-container:active-pane-item-changed', function(){
      this.run(editor);
    }.bind(this));
    this.subscribe(buffer, listenFor.join(' '), (function(self) {
      return _.debounce(function() {
        self.run(editor);
      },50);
    })(this));
    this.subscribe(buffer, 'destroyed', (function(self) {
      return function() {
        return self.unsubscribe(buffer);
      };
    })(this));
  };

  AtomJsHint.prototype.run = function(editor){
    var self = this;
    var text = this.getContents();
    if( !text ) {
      this.resetState(editor);
      return;
    }

    var cb = function (jsHintErrors) {
      JSHINT_Worker.removeListener('message', cb);
      if(jsHintErrors.length === 0) {
        self.resetState(editor);
      }
      if( editor.cursors[0] ){
        self.updateStatus(jsHintErrors, editor.cursors[0].getBufferRow());
      }
      self.updateGutter(jsHintErrors);
      self.updatePane(jsHintErrors);
      self.subscribe(atom.workspaceView, 'cursor:moved', function () {
        if( editor.cursors[0] ){
          self.updateStatus(jsHintErrors, editor.cursors[0].getBufferRow());
        }
      });
      self.subscribe(editor, 'scroll-top-changed', function () {
        self.updateGutter(jsHintErrors);
      });
    };
    JSHINT_Worker.on('message', cb);

    JSHINT_Worker.send({
      method: 'run',
      text:text,
      options: this.config.options,
      config: this.config.globals
    });
  };

  AtomJsHint.prototype.resetState = function(editor){
    this.updateStatus(false);
    this.updateGutter([]);
    this.updatePane([]);
    atom.workspaceView.off('cursor:moved');
    this.unsubscribe(editor);
  };

  AtomJsHint.prototype.updatePane = function(errors){
    $('#jshint-status-pane').remove();
    if( !errors || !atom.config.get('atom-jshint.showErrorPanel') ) return;
    var html = $('<div id="jshint-status-pane" class="atom-jshint-pane" style="height:">');
    errors.forEach(function(error){
      html.append('Line: ' + error.line + ' Char:' + error.character + ' ' + error.reason);
      html.append('<br/>');
    });
    atom.workspaceView.prependToBottom(html);
  };

  AtomJsHint.prototype.updateGutter = function(errors){
    atom.workspaceView.eachEditorView(function(editorView){
      if (editorView.active) {
        var gutter = editorView.gutter;
        gutter.removeClassFromAllLines('atom-jshint-error');
        errors.forEach(function(error){
          gutter.addClassToLine(error.line - 1, 'atom-jshint-error');
        });
      }
    });
  };

  AtomJsHint.prototype.updateStatus = function(errors, row){
    var status = document.getElementById('jshint-status');
    var msg = '';
    if( status ) status.parentElement.removeChild(status);
    if( !errors ) return;
    if (row >= 0) {
      var lineErrors = errors.filter(function (error) {
        return error.line === row + 1;
      });
      if (lineErrors.length > 0) {
        msg = 'Error: ' + lineErrors[0].line + ':' + lineErrors[0].character + ' ' + lineErrors[0].reason;
      } else {
        msg = errors.length > 0 ? errors.length + ' JSHint error' + (errors.length>1?'s':'') : '';
      }
      atom.workspaceView.statusBar.appendLeft('<span id="jshint-status" class="inline-block">' + msg + '</span>');
    }
  };


  AtomJsHint.prototype.getContents = function(){
    if( !atom.workspace.activePaneItem ) return false;
    var filename = atom.workspace.activePaneItem.getUri();
    if( !filename ) return false;
    if( filename.slice(-3) !== '.js' ) return false;
    var text = atom.workspace.activePaneItem.getText();
    if( !text ) return false;
    return text;
  };

  AtomJsHint.prototype.loadConfig = function(){
    if( fs.existsSync(atom.project.path + '/package.json') ){
      var packageJson = require(atom.project.path + '/package.json');
      if( packageJson.jshintConfig ) {
        return this.setConfig(packageJson.jshintConfig);
      }
    }
    var workingPath = atom.project.path || '';
    var dirs = workingPath.split(path.sep);
    while ( dirs.length >= 1 ) {
      var configPath = path.join(dirs.join(path.sep), '/.jshintrc');
      if( fs.existsSync(configPath) ){
        var configFile = fs.readFileSync(configPath, 'UTF8');
        var conf = {};
        try {
          conf = JSON.parse(configFile);
        } catch(e){
          console.error('error parsing config file');
        }
        return this.setConfig(conf);
      }
      dirs.pop();
    }
  };

  AtomJsHint.prototype.setConfig = function(conf){
    var config = {globals:{},options:{}};
    config.globals = conf.globals || {};
    if( conf.global ) { delete conf.globals; }
    config.options = conf;
    this.config = config;
  };

  return AtomJsHint;

})();
