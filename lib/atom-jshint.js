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
    this.currentConfig = null;
    this.npmConfig = this.loadNpmConfig();
    this.subscribe(atom.workspaceView, 'pane-container:active-pane-item-changed',
        function(event,editor){
        this.unsubscribeEditor(this.editor);
        this.currentConfig = null;
        if (editor && editor.constructor && editor.constructor.name === 'Editor'){
          this.editor = editor;
          this.subscribeEditor(editor);
          this.run(editor);
        } else {
          this.resetState();
        }
      }.bind(this)
    );
    this.editor = atom.workspace.getActiveEditor();
    if(this.editor){
      setTimeout(function(){
        this.subscribeEditor(this.editor);
        this.run(this.editor);
      }.bind(this), 1000);
    }
  }
  Subscriber.includeInto(AtomJsHint);

  AtomJsHint.prototype.destroy = function(){
    Object.keys(this.configs).forEach(function(configKey){
      var config = this.configs[configKey];
      if (config.fileWatcher){
        config.fileWatcher.close();
        delete config.fileWatcher;
      }
    });
    if (this.editor) {
      this.unsubscribeEditor(this.editor);
    }
    return this.unsubscribe();
  };

  AtomJsHint.prototype.subscribeEditor = function(editor) {
    var buffer = editor.getBuffer();
    this.subscribe(editor, 'grammar-changed', function(){
      this.unsubscribeEditor(editor);
      this.subscribeEditor(editor);
      this.run(editor);
    }.bind(this));

    if(this.isHintable(editor)) {
      var listenFor = [];
      if( atom.config.get('atom-jshint.hintOnModify') ){ listenFor.push('contents-modified'); }
      if( atom.config.get('atom-jshint.hintOnSave') ) { listenFor.push('saved'); }

      this.subscribe(buffer, listenFor.join(' '), (function(self) {
        return _.debounce(function() {
          self.run(editor);
        },50);
      })(this));
    }

    this.subscribe(buffer, 'destroyed', (function(self) {
      return function() {
        return self.unsubscribeEditor(editor);
      };
    })(this));
  };

  AtomJsHint.prototype.unsubscribeEditor = function(editor) {
    if (editor){
      delete this.editor;
      return this.unsubscribe(editor) && this.unsubscribe(editor.getBuffer());
    }
  };

  AtomJsHint.prototype.run = function(editor){
    var self = this;
    var text = this.getContents(editor);
    if( !text ) {
      this.resetState();
      return;
    }

    var cb = function (jsHintErrors) {
      JSHINT_Worker.removeListener('message', cb);
      if(jsHintErrors.length === 0) {
        self.resetState();
      }
      if( editor.cursors[0] ){
        self.updateStatus(jsHintErrors, editor.cursors[0].getBufferRow());
      }
      self.updateGutter(jsHintErrors);
      self.updatePane(jsHintErrors);
      self.cursorHandler = function () {
        if( editor.cursors[0] ){
          self.updateStatus(jsHintErrors, editor.cursors[0].getBufferRow());
        }
      };
      self.subscribe(atom.workspaceView, 'cursor:moved', self.cursorHandler);
      self.subscribe(editor, 'scroll-top-changed', function () {
        self.updateGutter(jsHintErrors);
      });
    };
    JSHINT_Worker.on('message', cb);

    var config = this.getConfig(editor.getPath());
    if (config.message) {
      JSHINT_Worker.send({
        method: 'run',
        text:text,
        options: config.message.options,
        config: config.message.globals
      });
    } else if (config.error) {
      this.resetState();
      this.updateStatus(config.error);
    } else {
      this.resetState();
    }
  };

  AtomJsHint.prototype.resetState = function(){
    this.updateStatus(false);
    this.updateGutter([]);
    this.updatePane([]);
    if (this.cursorHandler) {
      atom.workspaceView.off('cursor:moved', this.cursorHandler);
      this.cursorHandler = null;
    }
  };

  AtomJsHint.prototype.updatePane = function(errors){
    $('#jshint-status-pane').remove();
    if( !errors || !atom.config.get('atom-jshint.showErrorPanel') ) return;
    var html = $('<div id="jshint-status-pane" class="atom-jshint-pane" style="height:">');
    var editorView = atom.workspaceView.getActiveView();
    function sortByLine(a, b) {
      if (a.line === b.line) {
        return a.character - b.character;
      } else {
        return a.line - b.line;
      }
    }
    errors.sort(sortByLine).forEach(function(error){
      var line = $('<span>Line: ' + error.line + ' Char:' + error.character + ' ' + error.reason + '</span>');
      html.append(line);
      line.click(function(){
        var position = [error.line - 1, error.character - 1];
        editorView.editor.setCursorBufferPosition(position);
      });
      html.append('<br/>');
    });
    atom.workspaceView.prependToBottom(html);
  };

  AtomJsHint.prototype.updateGutter = function(errors){
    var activeView = atom.workspaceView.getActiveView();
    if (activeView && activeView.gutter) {
      var gutter = activeView.gutter;
      gutter.removeClassFromAllLines('atom-jshint-error');
      errors.forEach(function(error){
        gutter.addClassToLine(error.line - 1, 'atom-jshint-error');
      });
    }
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
        msg = 'Error: ' + lineErrors[0].line +
          ':' + lineErrors[0].character +
          ' ' + lineErrors[0].reason;
      } else {
        msg = errors.length > 0 ? errors.length +
          ' JSHint error' + (errors.length>1?'s':'') : '';
      }
    } else if (typeof errors === 'string') {
      msg = errors;
    }
    if (msg) {
      atom.workspaceView.statusBar.appendLeft(
        '<span id="jshint-status" class="inline-block">' + msg + '</span>');
    }
  };


  AtomJsHint.prototype.isHintable = function(editor){
    if( !editor ) return false;
    var grammar = editor.getGrammar();
    if (!grammar || grammar.name !== 'JavaScript') return false;
    return true;
  };
  AtomJsHint.prototype.getContents = function(editor){
    if(!this.isHintable(editor)) return false;
    var text = editor.getText();
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

  AtomJsHint.prototype.getConfig = function(filePath){
    function loadConfig(filePath) {
      var workingPath = filePath || '';
      var dirs = workingPath.split(path.sep);
      dirs.pop();
      while ( dirs.length >= 1 ) {
        var dir = dirs.join(path.sep);
        var config = this.configs[dir];
        if (config && !config.stale){
          return config;
        }
        var configPath = path.join(dir, '/.jshintrc');
        if( fs.existsSync(configPath) ){
          if (config) {
            config.stale = false;
          } else {
            config = {stale: false, fileWatcher: this.watchConfig(configPath)};
          }
          try {
            var configFile = fs.readFileSync(configPath, 'UTF8');
            var conf = JSON.parse(configFile);
            config.message = this.getConfigMessage(conf);
          } catch(e){
            console.error('Error parsing config file', e.message);
            config.error = 'Could not load: ' + configPath + ': ' + e.message;
          }
          this.configs[dir] = config;
          return config;
        }
        dirs.pop();
      }
      return {};
    }

    if (this.npmConfig) {
      return {message: this.npmConfig};
    } else if(this.currentConfig && !this.currentConfig.stale){
      return this.currentConfig;
    } else {
      var config = loadConfig.call(this, filePath);
      this.currentConfig = config;
      return config;
    }
  };

  AtomJsHint.prototype.getConfigMessage = function(conf){
    if(!conf) return null;
    var config = {globals:{},options:{}};
    config.globals = conf.globals || {};
    if( conf.globals ) { delete conf.globals; }
    config.options = conf;
    return config;
  };

  AtomJsHint.prototype.watchConfig = function(configFile){
    return fs.watch(configFile, { persistent: false },
      function (event) {
        var dir = path.dirname(configFile);
        var config = this.configs[dir];
        if (event === 'rename') {
          config.fileWatcher.close();
          if(config === this.currentConfig){
            this.currentConfig = null;
          }
          delete this.configs[dir];
        } else {
          config.stale=true;
          config.message=null;
          config.error=null;
        }
      }.bind(this)
    );
  };

  return AtomJsHint;

})();
