

var Vertical = function(w,h){
	this.init(w,h);
};

Vertical.prototype = {

	init: function(w,h){
		this.maxWidth = w || 9999999;
		this.maxHeight = h || 9999999;
	},

	fit: function(blocks){
		var self = this;
		this.width = 0;
		this.height = 0;
		var x = 0;
		var y = 0;
		var maxWidth = 0;
		var maxHeight = 0;
		var lastItem  
		blocks.forEach(function (item) {
			if (y + item.h > self.maxHeight) {
				maxHeight = Math.max(maxHeight, y)
				y = 0;
				x += maxWidth;
				maxWidth = 0;
			}
			if (x + item.w < self.maxWidth) {
				maxWidth = Math.max(maxWidth, item.w);
				item.fit = { x:x, y:y, w:item.w, h:item.h };
				y += item.h;
			}
		});
		this.width = x + maxWidth;
		this.height = y + maxHeight;
	}
};

module.exports = Vertical;