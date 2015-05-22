var AtomJshint;
var cp = require('child_process');
var JSHINT_Worker = null;
var fs = require('fs');
var path = require('path');
var decorations = {};
var supportedGrammars = {
  'JavaScript': true,
  'JavaScript ES6': true
};

module.exports = AtomJshint = (function(){
  JSHINT_Worker = cp.fork(__dirname + '/worker.js');
  process.on('exit', function() {
    JSHINT_Worker.kill();
  });
  var $ = require('jquery');
  function AtomJsHint(){
    this.configs = {};
    this.currentConfig = null;
    this.npmConfig = this.loadNpmConfig();
    atom.workspace.observeActivePaneItem(function(item){
      if(!item) return;
      if(item.constructor.name === 'TextEditor') {
        this.unsubscribeEditor();
        if (item && item.constructor && item.constructor.name === 'TextEditor'){
          this.editor = item;
          this.subscribeEditor(this.editor);
          this.run(this.editor);
        } else {
          this.resetState();
        }
      }
    }.bind(this));
    this.editor = atom.workspace.getActiveTextEditor();
    if(this.editor){
      setTimeout(function(){
        this.subscribeEditor(this.editor);
        this.run(this.editor);
      }.bind(this), 1000);
    }
  }

  AtomJsHint.prototype.destroy = function(){
    Object.keys(this.configs).forEach(function(configKey){
      var config = this.configs[configKey];
      if (config.fileWatcher){
        config.fileWatcher.close();
        delete config.fileWatcher;
      }
    });
    if (this.editor) {
      this.unsubscribeEditor();
    }
    return this.unsubscribe();
  };

  AtomJsHint.prototype.subscribeEditor = function(editor) {
    this.onChangeGrammar = editor.onDidChangeGrammar(function(){
      this.run(editor);
    }.bind(this));

    if(this.isHintable(editor)) {
      if( atom.config.get('atom-jshint.hintOnModify') ){
        this.onChangeBuffer = editor.onDidStopChanging(function(){
          this.run(editor);
        }.bind(this));
      }
      if( atom.config.get('atom-jshint.hintOnSave') ) {
        this.onChangeSave = editor.onDidSave(function(){
          this.run(editor);
        }.bind(this));
      }
    }
    editor.onDidDestroy(this.unsubscribeEditor);
  };

  AtomJsHint.prototype.unsubscribeEditor = function() {
    delete this.editor;
    if(this.onChangeGrammar) this.onChangeGrammar.dispose();
    if(this.onChangeBuffer) this.onChangeBuffer.dispose();
    if(this.onChangeSave) this.onChangeSave.dispose();
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
      self.updateGutter(jsHintErrors);
      self.updatePane(jsHintErrors);
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
    } else {
      this.resetState();
    }
  };

  AtomJsHint.prototype.resetState = function(){
    this.updateGutter([]);
    this.updatePane([]);
  };

  AtomJsHint.prototype.updatePane = function(errors){
    if(this.hintPanel) this.hintPanel.destroy();
    if( !errors || !atom.config.get('atom-jshint.showErrorPanel') ) return;
    var html = $('<div id="jshint-status-pane" class="atom-jshint-pane" style="height:">');
    function sortByLine(a, b) {
      if (a.line === b.line) {
        return a.character - b.character;
      } else {
        return a.line - b.line;
      }
    }
    var self = this;
    errors.sort(sortByLine).forEach(function(error){
      var line = $('<span>Line: ' + error.line + ' Char:' + error.character + ' ' + error.reason + '</span>');
      html.append(line);
      line.click(function(){
        var position = [error.line - 1, error.character - 1];
        self.editor.setCursorBufferPosition(position);
      });
      html.append('<br/>');
    });
    this.hintPanel = atom.workspace.addBottomPanel({item: html, visible: true, className: 'atom-jshint-pane'});
  };

  AtomJsHint.prototype.updateGutter = function(errors){
    if(!this.editor) return;
    // should get a bit clever in here and see if we need to keep any existing decorators before removing them all.
    if(!decorations[this.editor.id]) decorations[this.editor.id] = [];
    decorations[this.editor.id].forEach(function(dec) {
      dec.destroy();
    });
    decorations[this.editor.id] = [];

    errors.forEach(function(error){
      var range = [[error.line-1, 0], [error.line-1, 0]];
      var marker = this.editor.markBufferRange(range);
      var decoration = this.editor.decorateMarker(marker, {type: 'line-number', class: 'atom-jshint-error'});
      decorations[this.editor.id].push(decoration);
    }.bind(this));
  };

  AtomJsHint.prototype.isHintable = function(editor){
    if( !editor ) return false;
    var grammar = editor.getGrammar();
    if (!grammar || !supportedGrammars[grammar.name]) return false;
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
