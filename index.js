var path = require('path');

exports.Plugin = function (config) {
    config.commands.export.option('minZoom', {
        help: 'Min zoom to be considered for export',
        metavar: 'INT',
        default: 0
    });
    config.commands.export.option('maxZoom', {
        help: 'Max zoom to be considered for export',
        metavar: 'INT',
        default: 18
    });
    config.commands.export.option('tileFormat', {
        help: 'Format for tiles (png, jpeg, etc.)',
        default: 'png'
    });
    config.commands.export.option('workers', {
        help: 'Number of workers to run [Default: number of CPUs]',
        metavar: 'INT'
    });
    config.commands.export.option('overwrite', {
        flag: true,
        help: 'Overwrite existing tiles instead of skiping.'
    });
    config.registerExporter('tiles', path.join(__dirname, 'Export.js'));
};
