var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    MetatileBasedTile = require(path.join(kosmtik.src, 'back/MetatileBasedTile.js')).Tile,
    mkdirs = require(path.join(kosmtik.src, 'back/Utils.js')).mkdirs,
    zoomLatLngToXY = require(path.join(kosmtik.src, 'back/GeoUtils.js')).zoomLatLngToXY,
    BaseExporter = require(path.join(kosmtik.src, 'plugins/base-exporters/Base.js')).BaseExporter;

var TilesExporter = function (project, options) {
    BaseExporter.call(this, project, options);
};

util.inherits(TilesExporter, BaseExporter);

TilesExporter.prototype.export = function (callback) {
    var bounds;
    if (this.options.bounds) bounds = this.options.bounds.split(',').map(function (x) {return +x;});
    else bounds = this.project.mml.bounds;
    if (!this.options.output) return this.log('Missing destination dir. Use --output <path/to/dir>');
    this.log('Starting tiles export to', this.options.output);
    if (this.options.minZoom > this.options.maxZoom) return this.log('Invalid zooms');
    this.log('Starting tiles export, with bounds', bounds, 'and from zoom', this.options.minZoom, 'to', this.options.maxZoom);
    var mapPool = this.project.createMapPool();
    for (var i = this.options.minZoom; i <= this.options.maxZoom; i++) {
        this.processZoom(i, bounds, mapPool, this.project);
    }
    mapPool.drain(function() {
        mapPool.destroyAllNow();
    });
};

TilesExporter.prototype.processZoom = function (zoom, bounds, mapPool, project) {
    var leftTop = zoomLatLngToXY(zoom, bounds[3], bounds[0]),
        rightBottom = zoomLatLngToXY(zoom, bounds[1], bounds[2]),
        self = this;
    this.log('Processing zoom', zoom);
    var count = (rightBottom[0] - leftTop[0] + 1) * (rightBottom[1] - leftTop[1] + 1);
    this.log(count, 'tiles to process');
    for (var x = leftTop[0]; x <= rightBottom[0]; x++) {
        for (var y = leftTop[1]; y <= rightBottom[1]; y++) {
            self.processTile(zoom, x, y, mapPool, project);
        }
    }
};

TilesExporter.prototype.processTile = function (zoom, x, y, mapPool, project) {
    var self = this;
    mapPool.acquire(function (err, map) {
        if (err) throw err;
        var tile = new MetatileBasedTile(zoom, x, y, {metatile: project.mml.metatile}),
            filepath = path.join(self.options.output, zoom.toString(), x.toString(), y + '.png');
        return tile.render(project, map, function (err, im) {
            if (err) throw err;
            im.encode('png', function (err, buffer) {
                if (err) throw err;
                // self.log('Dumping tile to', filepath);
                mkdirs(path.dirname(filepath), function (err) {
                    if (err) throw err;
                    fs.writeFile(filepath, buffer, function (err) {
                        mapPool.release(map);
                        if (err) throw err;
                    });            
                });
            });
        });
    });
};

exports.Exporter = TilesExporter;
