/* eslint-disable no-alert, no-console */
'use strict';

const pm2 = require('pm2');
const pmx = require('pmx');
const os = require('os');

const hostname = os.hostname();
const conf = pmx.initModule();

var Gelf = require('gelf');
var gelf = new Gelf({
    graylogPort: conf.graylogPort,
    graylogHostname: conf.graylogHostname,
    connection: conf.connection,
    maxChunkSizeWan: conf.maxChunkSizeWan,
    maxChunkSizeLan: conf.maxChunkSizeLan
});

function cleanup(data) {
    // clean up the formatting
    data = data
                   .replace(/\n$/, '')
                   .replace(/\[(?:\d+?m)?/g,'');
    return data;
}


pm2.Client.launchBus(function(err, bus) {
    if (err) return console.error('PM2-GELF:', err);

    console.log('PM2 GELF Connector: Bus connected, sending logs to ' + 
                 conf.graylogHostname + ':' + conf.graylogPort);
 
    const extra_fields = function() {
        if (conf.extra_fields) {
            try {
                return extra_fields = JSON.parse(conf.extra_fields);
            } catch (err) {
                try {
                    return extra_fields = eval('(' + conf.extra_fields + ')')
                } catch (err) {
                    return extra_fields = {_extra_fields:conf.extra_fields}
                }
            }
        }
        return null;
    }();

    bus.on('log:out', function(log) {
        if (log.process.name !== 'pm2-gelf') {
            if (log.data && log.data.indexOf("/health-check") < 0) {
                // clean up the formatting
                let data = cleanup(log.data)
                var message = {
                    'version': '1.1',
                    'host': hostname,
                    'timestamp': (log.at / 1000),
                    'short_message': data,
                    'level': 6,
                    'facility': log.process.name
                };
                if (extra_fields) {
                    Object.assign(message, extra_fields)
                }
                // Log to gelf
                gelf.emit('gelf.log', message);
            }
        }
    });

    bus.on('log:err', function(log) {
        if (log.process.name !== 'pm2-gelf') {
            if (log.data && log.data.indexOf("/health-check") < 0) {
                // clean up the formatting
                let data = cleanup(log.data)
                var message = {
                    'version': '1.1',
                    'host': hostname,
                    'timestamp': (log.at / 1000),
                    'short_message': log.data,
                    'level': 3,
                    'facility': log.process.name
                };
                if (extra_fields) {
                    Object.assign(message, extra_fields)
                }
                // Log to gelf
                gelf.emit('gelf.log', message);
            }
        }
    });

    bus.on('reconnect attempt', function() {
        console.log('PM2 GELF Connector: Bus reconnecting');
    });

    bus.on('close', function() {
        console.log('PM2 GELF Connector: Bus closed');
        pm2.disconnectBus();
    });
});

