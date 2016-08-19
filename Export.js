var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    values = require('object.values'),
    MetatileBasedTile = require(path.join(kosmtik.src, 'back/MetatileBasedTile.js')).Tile,
    mkdirs = require(path.join(kosmtik.src, 'back/Utils.js')).mkdirs,
    zoomLatLngToXY = require(path.join(kosmtik.src, 'back/GeoUtils.js')).zoomLatLngToXY,
    BaseExporter = require(path.join(kosmtik.src, 'plugins/base-exporters/Base.js')).BaseExporter;

var TilesExporter = function (project, options) {
    BaseExporter.call(this, project, options);
};

util.inherits(TilesExporter, BaseExporter);

TilesExporter.prototype.export = function (callback) {
    var bounds, self = this;
    this.tileFormat = this.options.tileFormat;
    this.ext = this.tileFormat.match(/^[a-z]*/);
    this.workers = this.options.workers || os.cpus().length;
    if (this.options.bounds) bounds = this.options.bounds.split(',').map(function (x) {return +x;});
    else bounds = this.project.mml.bounds;
    if (!this.options.output) return this.log('Missing destination dir. Use --output <path/to/dir>');
    this.log('Starting tiles export to', this.options.output);
    if (this.options.minZoom > this.options.maxZoom) return this.log('Invalid zooms');
    this.log('Starting tiles export, with bounds', bounds, 'and from zoom', this.options.minZoom, 'to', this.options.maxZoom);
    this.mapPool = this.project.createMapPool();
    var currentZoom = this.options.minZoom;
    function iter (err) {
        if (err) throw err;
        if (currentZoom > self.options.maxZoom) {
            self.mapPool.drain(function() {
                self.mapPool.destroyAllNow();
            });
            return;
        }
        self.processZoom(currentZoom++, bounds, iter);
    }
    iter();
};

TilesExporter.prototype.processZoom = function (zoom, bounds, callback) {
    var leftTop = zoomLatLngToXY(zoom, bounds[3], bounds[0]),
        rightBottom = zoomLatLngToXY(zoom, bounds[1], bounds[2]),
        self = this;
    this.log('Processing zoom', zoom);
    var queue = {}, key, metatile = self.project.mml.metatile || 1, workers = 0, count = 0;
    for (var x = leftTop[0]; x <= rightBottom[0]; x++) {
        for (var y = leftTop[1]; y <= rightBottom[1]; y++) {
            key = Math.floor(x / metatile) + '.' + Math.floor(y / + metatile);
            queue[key] = queue[key] || [];
            queue[key].push([x, y]);
            count++;
        }
    }
    queue = values(queue);
    this.log(count, 'tiles to generate');
    this.log(queue.length, 'metatiles to process');
    function iter (err) {
        if (err) return callback(err);
        var next = queue.pop();
        if (!next) return done();
        self.processMetatile(zoom, next, iter);
        if (queue.length % 100 == 0) self.log(queue.length, 'metatiles to process for zoom', zoom);
        delete next;
    }
    function done () {
        if (!--workers) return callback();
    }
    for (var i = 0; i < this.workers; i++) {
        workers++;
        iter();
    }
    self.log('Running with', workers, 'worker(s)');
};

TilesExporter.prototype.processMetatile = function (zoom, tiles, callback) {
    var self = this;
    function iter (err) {
        var next = tiles.pop();
        if (!next || err) return callback(err);
        self.processTile(zoom, next[0], next[1], iter);
        delete next;
    }
    iter();
};

TilesExporter.prototype.processTile = function (zoom, x, y, callback) {
    // this.log('Processing tile', zoom, x, y);
    var self = this,
        filepath = path.join(self.options.output, zoom.toString(), x.toString(), y + '.' + this.ext);
    // Do we need an option to overwrite existing tiles?
    fs.exists(filepath, function (exists) {
        if (exists && !self.options.overwrite) return callback();
        self.mapPool.acquire(function (err, map) {
            if (err) return callback(err);
            var tile = new MetatileBasedTile(zoom, x, y, {metatile: self.project.mml.metatile});
            return tile.render(self.project, map, function (err, im) {
                if (err) return callback(err);
                im.encode(self.tileFormat, function (err, buffer) {
                    if (err) return callback(err);
                    mkdirs(path.dirname(filepath), function (err) {
                        if (err) return callback(err);
                        fs.writeFile(filepath, buffer, function (err) {
                            self.mapPool.release(map);
                            callback(err);
                        });
                    });
                });
            });
        });
    });
};

exports.Exporter = TilesExporter;
