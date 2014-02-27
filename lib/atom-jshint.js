var JSHINT = require('./vendor/jshint').JSHINT;
var getText = function(){
  var text = atom.workspace.activePaneItem.getText();
  if( !text ) return false;
  return text;
};
var updateStatus = function(text){
  var status = document.getElementById('jshint-status');
  if( status ) status.parentElement.removeChild(status);
  var msg = text.split('\n')[0];
  atom.workspaceView.statusBar.appendLeft('<span id="jshint-status">' + msg + '</span>');
};
module.exports = {
  activate: function(){
    return atom.workspaceView.command("atom-jshint:run", this.run);
  },
  run: function(){
    var text = getText();
    if( !text ) return updateStatus('No text selected!');
    if( !JSHINT(text) ){
      var errors = JSHINT.errors;
      var msg = [];
      for(i=0;i<errors.length;i++){
        var error = errors[i];
        if( error ){
          msg.push('Line: ' + error.line + ': ' + error.reason);
        }
      }
      updateStatus(msg.join("\n"));
    } else {
      updateStatus('Passed jshint');
    }
  }
};
