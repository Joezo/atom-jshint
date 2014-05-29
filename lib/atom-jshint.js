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
    this.configs = {};
    this.npmConfig = this.loadNpmConfig();
    atom.workspace.eachEditor((function(self) {
      return function(editor) {
        return self.handleEvents(editor);
      };
    })(this));
    this.subscribe(atom.workspaceView, 'pane-container:active-pane-item-changed', function(event,editor){
      this.run(editor);
    }.bind(this));
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

    var config = this.loadConfig(editor.getPath());

    JSHINT_Worker.send({
      method: 'run',
      text:text,
      options: config.options,
      config: config.globals
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
    var grammar = atom.workspace.activePaneItem.getGrammar();
    if (!grammar || grammar.name !== 'JavaScript') return false;
    var text = atom.workspace.activePaneItem.getText();
    if( !text ) return false;
    return text;
  };

  AtomJsHint.prototype.loadNpmConfig = function(){
    if( fs.existsSync(atom.project.path + '/package.json') ){
      var packageJson = require(atom.project.path + '/package.json');
      if( packageJson.jshintConfig ) {
        return this.getConfigMessage(packageJson.jshintConfig);
      }
    }
  };

  AtomJsHint.prototype.loadConfig = function(filePath){
    if (this.npmConfig) {
      return this.npmConfig;
    }
    var workingPath = filePath || '';
    var dirs = workingPath.split(path.sep);
    dirs.pop();
    var fileDir = dirs.join(path.sep);
    while ( dirs.length >= 1 ) {
      var dir = dirs.join(path.sep);
      if (this.configs[dir]){
        this.configs[fileDir] = this.configs[dir];
        return this.configs[dir];
      }
      var configPath = path.join(dir, '/.jshintrc');
      if( fs.existsSync(configPath) ){
        var configFile = fs.readFileSync(configPath, 'UTF8');
        var conf = {};
        try {
          conf = JSON.parse(configFile);
        } catch(e){
          console.error('error parsing config file');
        }
        var configMessage = this.getConfigMessage(conf);
        this.configs[fileDir] = configMessage;
        this.configs[dir] = configMessage;
        return configMessage;
      }
      dirs.pop();
    }
  };

  AtomJsHint.prototype.getConfigMessage = function(conf){
    var config = {globals:{},options:{}};
    config.globals = conf.globals || {};
    if( conf.globals ) { delete conf.globals; }
    config.options = conf;
    return config;
  };

  return AtomJsHint;

})();
