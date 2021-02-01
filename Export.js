var fs = require('fs'),
    path = require('path'),
    os = require('os'),
    MetatileBasedTile = require(path.join(kosmtik.src, 'back/MetatileBasedTile.js')).Tile,
    mkdirs = require(path.join(kosmtik.src, 'back/Utils.js')).mkdirs,
    zoomLatLngToXY = require(path.join(kosmtik.src, 'back/GeoUtils.js')).zoomLatLngToXY,
    BaseExporter = require(path.join(kosmtik.src, 'plugins/base-exporters/Base.js')).BaseExporter;

class TilesExporter extends BaseExporter {

    export(callback) {
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
        this.metatile = this.project.metatile();
        this.log('Using metatiles of', this.metatile);
        this.size = this.options.tileSize;
        this.log('Tile size is', this.size);
        this.mapPool = this.project.createMapPool({size: this.size * this.metatile});
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

    processZoom(zoom, bounds, callback) {
        var leftTop = zoomLatLngToXY(zoom, bounds[3], bounds[0]),
            rightBottom = zoomLatLngToXY(zoom, bounds[1], bounds[2]),
            self = this;
        this.log('** Processing zoom', zoom);
        var queue = [], key, workers = 0, scale = this.size / 256,
            minX = Math.floor(leftTop[0] / scale),
            minY = Math.floor(leftTop[1] / scale);
        minX = minX - (minX % this.metatile);
        minY = minY - (minY % this.metatile);
        for (var x = minX; x <= (rightBottom[0] / scale); x += this.metatile) {
            for (var y = minY; y <= (rightBottom[1] / scale); y += this.metatile) {
                queue.push([x, y]);
            }
        }
        this.log(new Date().toUTCString(), '—', queue.length, 'metatiles to process (', queue.length * this.metatile * this.metatile, 'tiles)');
        function iter (err) {
            if (err) return callback(err);
            var next = queue.pop();
            if (!next) return done();
            self.processMetatile(zoom, next[0], next[1], iter);
            if (queue.length % 100 == 0) self.log(new Date().toUTCString(), '—', queue.length, 'metatiles to process for zoom', zoom);
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

    processMetatile(zoom, left, top, callback) {
        var self = this, tiles = [];
        for (var x = left; x < left + this.metatile; x++) {
            for (var y = top; y < top + this.metatile; y++) {
                tiles.push([x, y]);
            }
        }
        function iter (err) {
            var next = tiles.pop();
            if (!next || err) return callback(err);
            self.processTile(zoom, next[0], next[1], iter);
        }
        iter();
    };

    processTile(zoom, x, y, callback) {
        // this.log('Processing tile', zoom, x, y);
        var self = this,
            filepath = path.join(self.options.output, zoom.toString(), x.toString(), y + '.' + this.ext);
        // Do we need an option to overwrite existing tiles?
        fs.exists(filepath, function (exists) {
            if (exists && !self.options.overwrite) return callback();
            self.mapPool.acquire(function (err, map) {
                if (err) return callback(err);
                var tile = new MetatileBasedTile(zoom, x, y, {metatile: self.project.metatile(), size: self.size});
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
}

exports = module.exports = { Exporter: TilesExporter };
