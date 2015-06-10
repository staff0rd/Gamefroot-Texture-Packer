var BinPacker = require('./binpacker');
var GrowingPacker = require('./growingpacker');

var algorithms = {
  'binpacking': binpackingStrict,
  'growing-binpacking': growingBinpacking,
  'horizontal': horizontal,
  'vertical': vertical
};
exports.pack = function (algorithm, files, options) {
  algorithm = algorithm || 'growing-binpacking';
  var remainingFiles = files.concat();
  options.groups = [];

  while (options.groups.length < options.maxGroups || options.maxGroups < 0) {
    // Details for this texture group
    var group = {
      width: options.width,
      height: options.height
    };
    // Perform the fit
    algorithms[algorithm](remainingFiles, group);

    // Find out which files were fit
    var insertedFiles = [];
    var i = remainingFiles.length;
    while (--i >= 0) {
      var item = remainingFiles[i];
      if (item.fit) {
        item.x = item.fit.x;
        item.y = item.fit.y;
        delete item.fit;
        delete item.w;
        delete item.h;
        insertedFiles.push(item);
        remainingFiles.splice(i,1);
      }
    }

    // If we didn't insert any files, don't continue
    if (insertedFiles.length == 0) {
      break;
    } 
    // Otherwise add another texture group to the result
    else {
      group.files = insertedFiles;
      options.groups.push(group);
    }
  }

  // If we stopped before all the files were packed
  // We either need to throw an error or make a record
  // of said files
  if (remainingFiles.length > 0) {
    if (options.validate) {
      throw new Error("Can't fit all textures in given dimensions");
    } else {
      options.excludedFiles = remainingFiles;
    }
  }
};

function growingBinpacking(files, group) { 
  var packer = new GrowingPacker(group.width,group.height);
  packer.fit(files);
  group.width = packer.root.w;
  group.height = packer.root.h;
}

function binpackingStrict(files, group) {
  var packer = new BinPacker(group.width, group.height);
  packer.fit(files);
  group.width = packer.root.w;
  group.height = packer.root.h;
}

function vertical(files, options) {
  var y = 0;
  var maxWidth = 0;
  files.forEach(function (item) {
    item.x = 0;
    item.y = y;
    maxWidth = Math.max(maxWidth, item.width);
    y += item.height;
  });

  options.width = maxWidth;
  options.height = y;
}

function horizontal(files, options) {
  var x = 0;
  var maxHeight = 0;
  files.forEach(function (item) {
    item.x = x;
    item.y = 0;
    maxHeight = Math.max(maxHeight, item.height);
    x += item.width;
  });

  options.width = x;
  options.height = maxHeight;
}