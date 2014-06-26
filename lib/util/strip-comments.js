var stripComments = function(configFile) {
  var lines = [];
  var line = '';
  for (var i = 0; i < configFile.length; i++) {
    var char = configFile[i];
    line += char;
    if (char === '\n') {
      lines.push(line);
      line = '';
    }
  }
  for (var j = 0; j < lines.length; j++) {
    var myline = lines[j];
    var match = myline.match(/\s+\/\/.+\n/);
    if (match && match[0] === myline) {
      lines[j] = '';
    }
  }
  return lines.join('\n');
};

module.exports = stripComments;
