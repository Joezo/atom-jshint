var Subscriber, AtomJshint;
var JSHINT = require('./vendor/jshint').JSHINT;
var Subscriber = require('emissary').Subscriber;
var fs = require('fs');

module.exports = AtomJshint = (function(){

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
      return function() {
        return buffer.transact(function() {
          self.run(editor);
        });
      };
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
    if( !JSHINT(text, this.config.options, this.config.globals) ){
      //sometimes jshint creates a null object in the array
      var jsHintErrors = JSHINT.errors.filter(function (error) { return error !== null; });
      if( editor.cursors[0] ){
        self.updateStatus(jsHintErrors, editor.cursors[0].getBufferRow());
      }
      self.updateGutter(jsHintErrors);
      self.updatePane(jsHintErrors);
      this.subscribe(atom.workspaceView, 'cursor:moved', function () {
        if( editor.cursors[0] ){
          self.updateStatus(jsHintErrors, editor.cursors[0].getBufferRow());
        }
      });
      this.subscribe(editor, 'scroll-top-changed', function () {
        self.updateGutter(jsHintErrors);
      });
    } else {
      self.resetState(editor);
    }
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
    if( fs.existsSync(atom.project.path + '/.jshintrc') ){
      var configFile = fs.readFileSync(atom.project.path + '/.jshintrc','UTF8');
      var conf = {};
      try {
        conf = JSON.parse(configFile);
      } catch(e){
        console.error('error parsing config file');
      }
      return this.setConfig(conf);
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
