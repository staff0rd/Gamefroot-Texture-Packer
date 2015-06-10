var binpacking = require('binpacking');

var algorithms = {
  'binpacking': binpackingStrict,
  'growing-binpacking': growingBinpacking,
  'horizontal': horizontal,
  'vertical': vertical
};
exports.pack = function (algorithm, files, options) {
  algorithm = algorithm || 'growing-binpacking';
  algorithms[algorithm](files, options);

  if (options.validate) {
    validate(files, options);
  }
};

function validate(files, options) {
  files.forEach(function (item) {
    if (item.x + item.width > options.width || item.y + item.height > options.height) {
      throw new Error("Can't fit all textures in given spritesheet size");
    }
  });

  var intersects = function(x_1, y_1, width_1, height_1, x_2, y_2, width_2, height_2)
  {
    return !(x_1 >= x_2+width_2 || x_1+width_1 <= x_2 || y_1 >= y_2+height_2 || y_1+height_1 <= y_2);
  }

  files.forEach(function (a) {
    files.forEach(function (b) {
      if (a !== b && intersects(a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height)) {
        console.log(a, b);
        throw new Error("Can't fit all textures in given spritesheet size");
     }
    });
  });
}

function growingBinpacking(files, options) { 
  var allFiles = files.concat();
  var remainingFiles = files.concat();
  files.length = 0;

  var numGroups = 0;
  while (numGroups < options.maxGroups || options.maxGroups < 0) {
    var packer = new binpacking.GrowingPacker();
    files.push([]);
    packer.fit(remainingFiles);

    var inserted = 0;
    allFiles.forEach(function (item) {
      if (item.fit) {
        item.x = item.fit.x;
        item.y = item.fit.y;
        delete item.fit;
        delete item.w;
        delete item.h;
        inserted++;
        remainingFiles.splice(remainingFiles.indexOf(item),1);
        files[numGroups].push(item);
      }
    });

    // If we didn't insert any files, don't continue
    if (inserted == 0) {
      files.pop();
      break;
    }
  }

  // If there are leftover files make note of them
  if (remainingFiles.length > 0) {
    options.excludedFiles = remainingFiles;
  }
}


function binpackingStrict(files, options) {
  var allFiles = files.concat();
  var remainingFiles = files.concat();
  files.length = 0;
  
  var numGroups = 0;
  while (numGroups < options.maxGroups || options.maxGroups < 0) {
    var packer = new binpacking.Packer(options.width, options.height);
    files.push([]);
    packer.fit(remainingFiles);

    var inserted = 0;
    allFiles.forEach(function (item) {
      if (item.fit) {
        item.x = item.fit.x;
        item.y = item.fit.y;
        delete item.fit;
        delete item.w;
        delete item.h;
        inserted++;
        remainingFiles.splice(remainingFiles.indexOf(item),1);
        files[numGroups].push(item);
      }
    });
    numGroups++;
    
    // If we didn't insert any files, don't continue
    if (inserted == 0) {
      files.pop();
      break;
    }
  }
  
  // If there are leftover files make note of them
  if (remainingFiles.length > 0) {
    options.excludedFiles = remainingFiles;
  }
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