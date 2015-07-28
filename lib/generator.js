var exec = require('child_process').exec;
var fs = require('fs');
var Mustache = require('mustache');
var async = require('async');
var os = require('os');
var path = require('path');

var packing = require('./packing/');
var sorter = require('./sorter/sorter.js');

/**
 * Generate temporary trimmed image files
 * @param {string[]} files
 * @param {object} options
 * @param {boolean} options.trim is trimming enabled
 * @param callback
 */
exports.trimImages = function (files, options, callback) {
	if (!options.trim) return callback(null);

	var i = 0;
	async.eachSeries(files, function (file, next) {
		file.originalPath = file.path;
		i++;
		file.path = path.join(os.tmpDir(), 'spritesheet_js_' + (new Date()).getTime() + '_image_' + i + '.png');

		var scale = options.scale && (options.scale !== '100%') ? ' -resize ' + options.scale : '';
		var fuzz = options.fuzz ? ' -fuzz ' + options.fuzz : '';
		//have to add 1px transparent border because imagemagick does trimming based on border pixel's color
		exec('convert' + scale + ' ' + fuzz + ' -define png:exclude-chunks=date "' + file.originalPath + '" -bordercolor transparent -border 1 -trim "' + file.path + '"', next);
	}, callback);
};

/**
 * Resizes the images to the given cellWidth and cellHeight
 * @param {string[]} files
 * @param {object} options
 * @param {number} options.resizeWidth The width each image should be resized to
 * @param {number} options.resizeHeight The height each image should be resized to
 * @param {function} callback in the form f( err, files )
 */
exports.resizeImages = function (files, options, callback) {
	var i = 0;
	if (options.resizeWidth && options.resizeHeight) {
		async.eachSeries(files, function (file, next) {
			var resizeWidth = options.resizeWidth;
			var resizeHeight = options.resizeHeight;
			var srcPath = file.path;
			if (!file.originalPath) {
				file.originalPath = file.path;
			}
			file.path = path.join(os.tmpDir(), 'spritesheet_js_' + (new Date()).getTime() + '_image_' + i + '.png');
			exec('convert "' + srcPath + '" -resize ' + resizeWidth + 'x' + resizeHeight + '\\! "' + file.path + '"', next);
			i++;
		}, function( err ){
			callback( err, files );
		});
	} else {
		process.nextTick(function(){
			callback( undefined, files );
		});
	}
};

/**
 * Iterates through given files and gets its size
 * @param {string[]} files
 * @param {object} options
 * @param {boolean} options.trim is trimming enabled
 * @param {function} callback
 */
exports.getImagesSizes = function (files, options, callback) {
	if (!options.padding) options.padding = 0;
	if (!options.gutter) options.gutter = 0;
	var filePaths = files.map(function (file) {
		return '"' + file.path + '"';
	});
	exec('identify ' + filePaths.join(' '), function (err, stdout) {
		if (err) return callback(err);

		var sizes = stdout.split('\n');
		sizes = sizes.splice(0, sizes.length - 1);
		// Remove images that are frames of a single image
		var lastFilePath;
		sizes = sizes.filter( function( size ){
			var filePath = size.substring(0, size.indexOf('['));
			var uniqueFilePath = (filePath != lastFilePath);
			lastFilePath = filePath;
			return uniqueFilePath;
		});
		sizes.forEach(function (item, i) {
			var size = item.match(/ ([0-9]+)x([0-9]+) /);
			files[i].width = parseInt(size[1], 10) + options.padding * 2 + options.gutter * 2;
			files[i].height = parseInt(size[2], 10) + options.padding * 2 + options.gutter * 2;
			files[i].area = files[i].width * files[i].height;
			files[i].trimmed = false;

			if (options.trim) {
				var rect = item.match(/ ([0-9]+)x([0-9]+)[\+\-]([0-9]+)[\+\-]([0-9]+) /);
				files[i].trim = {};
				files[i].trim.x = parseInt(rect[3], 10) - 1;
				files[i].trim.y = parseInt(rect[4], 10) - 1;
				files[i].trim.width = parseInt(rect[1], 10) - 2;
				files[i].trim.height = parseInt(rect[2], 10) - 2;

				files[i].trimmed = (
					files[i].trim.width !== files[i].width - options.padding * 2 - options.gutter * 2 || 
					files[i].trim.height !== files[i].height - options.padding * 2 - options.gutter * 2);
			}
		});
		callback(null, files);
	});
};

/**
 * Determines texture size using selected algorithm
 * @param {object[]} files
 * @param {object} options
 * @param {object} options.algorithm (growing-binpacking, binpacking, vertical, horizontal)
 * @param {object} options.square canvas width and height should be equal
 * @param {object} options.powerOfTwo canvas width and height should be power of two
 * @param {function} callback
 */
exports.determineCanvasSize = function (files, options, callback) {
	files.forEach(function (item) {
		item.w = item.width;
		item.h = item.height;
	});
	options.excludedFiles = [];
	var filesCopy = files.concat();

	// sort files based on the choosen options.sort method
	sorter.run(options.sort, filesCopy);
	// Pack groups into 'blocks'
	packing.blockGroups(options.algorithm, filesCopy, options);
	// Sort files again now that groups are blocked
	sorter.run(options.sort, filesCopy);
	// Apply the square and powerOfTwo options to the size
	// to ensure that the packing takes these values into account
	applySquareAndPowerConstraints(options, options.square, options.powerOfTwo);
	// Pack the sizes
	packing.pack(options.algorithm, filesCopy, options);
	// If we are using an alogirithm like growing binpacking, it
	// will dynamically adjust it's size, so we reapply the 
	// square and powerOfTwo options here
	options.atlases.forEach(function(atlas){
		applySquareAndPowerConstraints(atlas, options.square, options.powerOfTwo);
	});

	callback(null, options);
};

function applySquareAndPowerConstraints(options, square, powerOfTwo){
	if (square) {
		options.width = options.height = Math.max(options.width, options.height);
	}
	if (powerOfTwo) {
		options.width = roundToPowerOfTwo(options.width);
		options.height = roundToPowerOfTwo(options.height);
	}
};

/**
 * generates texture data file
 * @param {object[]} files
 * @param {object} options
 * @param {string} options.path path to image file
 * @param {function} callback
 */
exports.generateImage = function (files, options, callback) {
	if (!options.padding) options.padding = 0;
	if (!options.gutter) options.gutter = 0;
	var command = ['convert -define png:exclude-chunks=date -quality 0% -size ' + options.width + 'x' + options.height + ' xc:none'];
	var content = { x:0,y:0, w:0,h:0 };
	files.forEach(function (file) {
		content.x = file.x + options.padding + options.gutter;
		content.y = file.y + options.padding + options.gutter;
		
		if (options.gutter) {
			content.w = file.width - options.padding*2 - options.gutter*2;
			content.h = file.height - options.padding*2 - options.gutter*2;
			// Add the gutters left, top, right, bottom
			command.push(' \\( "' + file.path + '" -crop 1x'+content.h+'+0+0 +repage -sample '+options.gutter+'x'+content.h+'\\! \\) -geometry +' + (file.x + options.padding ) + '+' + content.y + ' -composite');
			command.push(' \\( "' + file.path + '" -crop '+content.w+'x1+0+0 +repage -sample '+content.w+'x'+options.gutter+'\\! \\) -geometry +' + content.x + '+' + (file.y + options.padding) + ' -composite');
			command.push(' \\( "' + file.path + '" -crop 1x'+content.h+'+'+(content.w-1)+'+0 +repage -sample '+options.gutter+'x'+content.h+'\\! \\) -geometry +' + (content.x + content.w) + '+' + content.y + ' -composite');
			command.push(' \\( "' + file.path + '" -crop '+content.w+'x1+0+'+(content.h-1)+' +repage -sample '+content.w+'x'+options.gutter+'\\! \\) -geometry +' + content.x + '+' + (content.y + content.h) + ' -composite');
			// Add the gutters topleft, topright, bottomleft, bottomright
			var gxg = options.gutter+'x'+options.gutter;
			command.push(' \\( "' + file.path + '" -crop 1x1+0+0 +repage -sample '+gxg+'\\! \\) -geometry +' + (file.x + options.padding ) + '+' + (file.y + options.padding) + ' -composite');
			command.push(' \\( "' + file.path + '" -crop 1x1+'+(content.w-1)+'+0 +repage -sample '+gxg+'\\! \\) -geometry +' + (content.x + content.w) + '+' + (file.y + options.padding) + ' -composite');
			command.push(' \\( "' + file.path + '" -crop 1x1+0+'+(content.w-1)+'+0 +repage -sample '+gxg+'\\! \\) -geometry +' + (file.x + options.padding ) + '+' + (content.y + content.h) + ' -composite');
			command.push(' \\( "' + file.path + '" -crop 1x1+'+(content.w-1)+'+'+(content.h-1)+' +repage -sample '+gxg+'\\! \\) -geometry +' + (content.x + content.w) + '+' + (content.y + content.h) + ' -composite');
		}
		// Actual image
		command.push('"' + file.path + '" -geometry +' + content.x + '+' + content.y + ' -composite');
	});
	command.push('"' + options.path + '/' + options.name + '.png"');
	exec(command.join(' '), function (err) {
		if (err) return callback(err);

		unlinkTempFiles(files);
		callback(null);
	});
};

function unlinkTempFiles(files) {
	files.forEach(function (file) {
		if (file.originalPath && file.originalPath !== file.path) {
			fs.unlinkSync(file.path.replace(/\\ /g, ' '));
		}
	});
}

/**
 * generates texture data file
 * @param {object[]} files
 * @param {object} options
 * @param {string} options.path path to data file
 * @param {string} options.dataFile data file name
 * @param {function} callback
 */
exports.generateData = function (files, options, callback) {
	if (!options.padding) options.padding = 0;
	if (!options.gutter) options.gutter = 0;
	var formats = (Array.isArray(options.customFormat) ? options.customFormat : [options.customFormat]).concat(Array.isArray(options.format) ? options.format : [options.format]);
	formats.forEach(function(format, i){
		if (!format) return;
		var path = typeof format === 'string' ? format : __dirname + '/../templates/' + format.template;
		var templateContent = fs.readFileSync(path, 'utf-8');

		// sort files based on the choosen options.sort method
		sorter.run(options.sort, files);

		options.files = files;
		options.files[options.files.length - 1].isLast = true;
		options.files.forEach(function (item, i) {
			item.width  -= options.padding * 2 + options.gutter * 2;
			item.height -= options.padding * 2 + options.gutter * 2;
			item.x += options.padding + options.gutter;
			item.y += options.padding + options.gutter;

			item.index = i;
			if (item.trim) {
				item.trim.frameX = -item.trim.x;
				item.trim.frameY = -item.trim.y;
				item.trim.offsetX = Math.floor(Math.abs(item.trim.x + item.width / 2 - item.trim.width / 2));
				item.trim.offsetY = Math.floor(Math.abs(item.trim.y + item.height / 2 - item.trim.height / 2));
			}
			item.cssName = item.name || "";
			item.cssName = item.cssName.replace("_hover", ":hover");
			item.cssName = item.cssName.replace("_active", ":active");
		});

		var result = Mustache.render(templateContent, options);
		function findPriority(property) {
			var value = options[property];
			var isArray = Array.isArray(value);
			if (isArray) {
				return i < value.length ? value[i] : format[property] || value[0];
			}
			return format[property] || value;
		}
		fs.writeFile(findPriority('path') + '/' + findPriority('name') + '.' + findPriority('extension'), result, callback);
	});
};

/**
 * Rounds a given number to to next number which is power of two
 * @param {number} value number to be rounded
 * @return {number} rounded number
 */
function roundToPowerOfTwo(value) {
	if (typeof value != 'number') return undefined;
	var powers = 2;
	while (value > powers) {
		powers *= 2;
	}

	return powers;
}
