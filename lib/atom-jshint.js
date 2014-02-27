var Subscriber, AtomJshint;
var JSHINT = require('./vendor/jshint').JSHINT;
var Subscriber = require('emissary').Subscriber;

module.exports = AtomJshint = (function(){
  Subscriber.includeInto(AtomJsHint);

  function AtomJsHint(){
    atom.workspace.eachEditor((function(self) {
      return function(editor) {
        return self.handleEvents(editor);
      };
    })(this));
  }

  AtomJsHint.prototype.destroy = function(){
    return this.unsubscribe();
  };

  AtomJsHint.prototype.handleEvents = function(editor) {
    var buffer = editor.getBuffer();
    this.subscribe(buffer, 'saved', (function(self) {
      return function() {
        if( atom.config.get('atom-jshint.hintOnSave') ){
          return buffer.transact(function() {
            self.run();
          });
        }
      };
    })(this));
    this.subscribe(buffer, 'destroyed', (function(self) {
      return function() {
        return self.unsubscribe(buffer);
      };
    })(this));
  };

  AtomJsHint.prototype.run = function(){
    var text = this.getContents();
    if( !text ) return;
    if( !JSHINT(text) ){
      var jsHintErrors = JSHINT.errors;
      var errors = {
        total: jsHintErrors.length,
        msg: []
      };
      for(i=0;i<jsHintErrors.length;i++){
        var error = jsHintErrors[i];
        if( error ){
          errors.msg.push('Line: ' + error.line + ': ' + error.reason);
        }
      }
      this.updateStatus(errors);
    } else {
      this.updateStatus(false);
    }
  };

  AtomJsHint.prototype.updateStatus = function(errors){
    var status = document.getElementById('jshint-status');
    if( status ) status.parentElement.removeChild(status);
    if( !errors ) return;
    var msg = errors.total > 0 ? errors.total + ' error' + (errors.total>1?'s ':' ') : '';
    msg += errors.msg[0];

    atom.workspaceView.statusBar.appendLeft('<span id="jshint-status">' + msg + '</span>');
  };


  AtomJsHint.prototype.getContents = function(){
    var filename = atom.workspace.activePaneItem.getUri();
    if( filename.slice(-3) !== '.js' ) return false;
    var text = atom.workspace.activePaneItem.getText();
    if( !text ) return false;
    return text;
  };

  return AtomJsHint;

})();
