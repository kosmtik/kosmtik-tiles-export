var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
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
    if (this.options.bbox) bounds = this.options.bbox.split(',').map(function (x) {return +x;});
    else bounds = this.project.mml.bounds;
    if (!this.options.output) return this.log('Missing destination dir. Use --output <path/to/dir>');
    this.log('Starting tiles export to', this.options.output);
    if (this.options.minZoom > this.options.maxZoom) return this.log('Invalid zooms');
    this.log('Starting tiles export, with bounds', bounds, 'and from zoom', this.options.minZoom, 'to', this.options.maxZoom);
    var mapPool = this.project.createMapPool();
    var currentZoom = this.options.minZoom;
    function iter (err) {
        if (err) throw err;
        if (currentZoom > self.options.maxZoom) {
            mapPool.drain(function() {
                mapPool.destroyAllNow();
            });
        } else {
            self.processZoom(currentZoom++, bounds, mapPool, self.project, iter);
        }
    }
    iter();
};

TilesExporter.prototype.processZoom = function (zoom, bounds, mapPool, project, callback) {
    var leftTop = zoomLatLngToXY(zoom, bounds[3], bounds[0]),
        rightBottom = zoomLatLngToXY(zoom, bounds[1], bounds[2]),
        self = this;
    this.log('Processing zoom', zoom);
    var toProcess = [];
    for (var x = leftTop[0]; x <= rightBottom[0]; x++) {
        for (var y = leftTop[1]; y <= rightBottom[1]; y++) {
            toProcess.push([x, y]);
        }
    }
    this.log(toProcess.length, 'tiles to process');
    function iter (err) {
        if (err) return callback(err);
        var next = toProcess.pop();
        if (!next) return callback();
        if (toProcess.length % 1000 == 0) self.log(toProcess.length, 'tiles to process for zoom', zoom);
        self.processTile(zoom, next[0], next[1], mapPool, project, iter);
    }
    for (var i = 0; i < os.cpus().length / 2; i++) {
        // Let's run more than one in //.
        // TODO: add a command line option to control?
        iter();
    }
};

TilesExporter.prototype.processTile = function (zoom, x, y, mapPool, project, callback) {
    // this.log('Processing tile', zoom, x, y);
    var self = this;
    mapPool.acquire(function (err, map) {
        if (err) return callback(err);
        var tile = new MetatileBasedTile(zoom, x, y, {metatile: project.mml.metatile}),
            filepath = path.join(self.options.output, zoom.toString(), x.toString(), y + '.png');
        return tile.render(project, map, function (err, im) {
            if (err) return callback(err);
            im.encode('png', function (err, buffer) {
                if (err) return callback(err);
                mkdirs(path.dirname(filepath), function (err) {
                    if (err) return callback(err);
                    fs.writeFile(filepath, buffer, function (err) {
                        mapPool.release(map);
                        callback(err);
                    });
                });
            });
        });
    });
};

exports.Exporter = TilesExporter;
