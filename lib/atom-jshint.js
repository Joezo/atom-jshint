var JSHINT = require('./vendor/jshint').JSHINT;
var getText = function(){
  var text = atom.workspace.activePaneItem.getSelection().getText();
  if( !text ) return false;
  return text;
};
module.exports = {
  activate: function(){
    return atom.workspaceView.command("atom-jshint:run", this.run);
  },
  run: function(){
    var text = false;
    if( text = getText() ){
      if( !text ) return console.log('No text selected');
      if( !JSHINT(text) ){
        var errors = JSHINT.errors;
        var msg = [];
        for(i=0;i<errors.length;i++){
          var error = errors[i];
          if( error ){
            msg.push('Line: ' + error.line + ': ' + error.reason);
          }
        }
        console.log(msg.join("\n"));
      } else {
        console.log('Passed jshint, go you!');
      }
    }
  }
};
