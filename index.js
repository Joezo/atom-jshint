var AtomJsHint = require('./lib/atom-jshint.js');

module.exports = {
  config: {
    hintOnSave: {
      type: 'boolean',
      default: true
    },
    hintOnModify: {
      type: 'boolean',
      default: true
    },
    showErrorPanel: {
      type: 'boolean',
      default: true
    },
    watchConfig: {
      type: 'boolean',
      default: true
    }
  },
  activate: function(){
    return this.atomJsHint = new AtomJsHint();
  },
  deactivate: function(){
    return this.atomJsHint.destroy();
  }
};
