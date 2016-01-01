// Original Author: Mike Reich (https://github.com/sensamo/sim900js)
// Tyler McDowall (Acenth)

var mraa = require('mraa');
var sp = require('serialport');

var GSM = function(port, baud) {  
    if (!port) {
        var uart = new mraa.Uart(0);
        port = uart.getDevicePath();
    }
    
    if (!baud) {
        baud = 9600;
    }
    
    this._port = port;
    this._baud = baud;
    
    this._clear();
    
    var SerialPort = sp.SerialPort;
    this._sp = new SerialPort(port, {
        baudrate: baud
    }); 
};

GSM.prototype._handleResponse = function(buf, cb) {
    var response = null;
    var error = null;
    if(!this._buffer) return cb(error, response);
    var raw = this._buffer.toString().split("\r");
    var items = [];
    var that = this;
    var command = this._parseCommand(buf);
    //console.log('raw', raw);
    raw.forEach(function(res) {
        res = res.trim();
        if(res === '') return;
        //console.log(res);
        if (res[0] == '+') {
            // Some responses contain information that needs to be parsed out. These responses start with +<COMMAND>: <DATA> - Could also start with CMERROR: <DATA>
            var details = res.split(':');
            var resCommand = that._parseCommand(details[0]);
            //console.log(command);
            if (resCommand == command) {
                res = details[1];
            }
            else {
                return error = res.substr(1, res.length-1);
            }
            res = res.trim(); 
            if (res.indexOf(',') > -1) {
                // Responses can contain multiple values, split them out so we can send them with other items in response
                var resItems = res.split(',');
                resItems.forEach(function(resItem){
                    items.push(resItem); 
                });
            }
        }
        else {
            items.push(res);
        }
        
        if(res == "OK" || res == ">") {
            response = error || res;
            error = null;
        }
    });
    cb(error, response, items, raw);
};

GSM.prototype._parseCommand = function(c) {
    // We want to compare the source command to the response command.
    c = c.replace('?', '');
    if (c[0] == '+') {
        c = 'AT' + c;
    }
    if (c.indexOf('=') > -1) {
        c = c.split('=')[0];
    }
    return c;
};

GSM.prototype._handleData = function(data) {
    //console.log('[GSM]#> ', data.toString());
    this._buffer = data;
};

GSM.prototype._handleError = function(error) {
    this._error = error;
};

GSM.prototype._clear = function() {
    this._buffer = null;
    this._error = null;
};

GSM.prototype._connect = function(cb, retryCount) {
    var that = this;
    
    if (retryCount >= 3) {
        console.log('[GSM] Failed to connect to GSM network after ' + retryCount + ' tries.');
    }
    
    this._writeCommand('AT', 500, function(err, resp, raw) {
        if (err) {
            console.log('Error connecting to network.. retrying');
            that._connect(cb, retryCount++);
            return;
        }
        console.log('[GSM] Connected to GSM network');
        that.getDeviceInfo(function(err, resp, raw){
            if (err) {
                console.log('[GSM] Failed to get device information: ' + err);
                return;
            }
            cb(err);
        });      
    });
};

GSM.prototype.connect = function (cb) {
    console.log('[GSM] Opening connection...' + this._port);
    var that = this;
    this._sp.open(function(err) {        
        that._sp.on('data', that._handleData.bind(that));    
        that._sp.on('error', that._handleError.bind(that));
        if (err) {
            cb(err);
        }
        that._connect(cb, 0);
    });
};

GSM.prototype.getDeviceInfo = function(cb) {
    console.log('[GSM] Getting device information...');
    var that = this;
    this.getICCID(function(err, resp, raw) {
        if (err) {
            cb(err, resp);
            return;
        }
        that.getIMSI(function(err, resp, raw) {
            if (err) {
                cb(err, resp);
                return;
            }
            cb(err, resp);
        });
    });
};

GSM.prototype.getICCID = function(cb) {
    var that = this;
    this._writeCommand('AT+CCID', 1000, function(err, resp, raw) {
        if (err) {
            console.log('[GSM] Error getting ICCID...' + err);
            cb(err, resp);
            return;
        }
        that._iccid = raw[1];
        console.log('[GSM] ICCID: ' + raw[1]);
        cb(err, resp, raw[1]);
    });
};

GSM.prototype.getIMSI = function(cb) {
    var that = this;
    this._writeCommand('AT+CIMI', 1000, function(err, resp, raw) {
        if (err) {
            console.log('[GSM] Error getting IMSI...' + err);
            cb(err, resp);
            return;
        }
        that._imsi = raw[1];
        console.log('[GSM] IMSI: ' + raw[1]);
        cb(err, resp, raw[1]);
    });
};

GSM.prototype.status = function(cb) {
    this._writeCommand('AT+CREG?', 500, cb);
};

GSM.prototype.getSignalStrength = function(cb) {
    this._writeCommand('AT+CSQ', 1000, cb);
};

GSM.prototype.close = function(cb) {
    this._sp.close();
};

GSM.prototype._writeCommand = function(buf, timeout, cb) {
    this._clear();
    var that = this;
    var originalBuf = buf;
    if(buf && buf.length > 0 && buf[buf.length-1] != String.fromCharCode(13))
        buf = buf+String.fromCharCode(13);
    //console.log('[GSM] > ', buf.toString());
    this._sp.write(buf, function(err) {
        that._sp.drain(function() {
            setTimeout(function() {
                that._handleResponse(originalBuf, cb);
            }, timeout);
        });
    });
};

GSM.prototype._writeCommandSequence = function(commands, timeout, cb) {
    var that = this;
    if(typeof timeout === 'function') {
        cb = timeout;
        timeout = null;
    }
    var processCommand = function(err, resp, raw) {
        if(err) return cb(err);
        if(commands.length === 0) return cb(err, resp, raw);
        var command = commands.shift();
        if(Array.isArray(command)) {
            timeout = command[1];
            command = command[0];
        }
        that._writeCommand(command, timeout, processCommand);
    };
    processCommand();
};

GSM.prototype.initialize = function(cb) {
    var that = this;
    console.log('[GSM] Initializing context...');

    this._writeCommand('AT+SAPBR=2,1', 500, function(err, resp, raw) {
        if (raw[2] == 1) {
            console.log('[GSM] Context already open')
            cb(err, resp, raw);
        }
        else {
            console.log('[GSM] Opening context...');
            that._initGPRS(function(err, resp, raw){
                console.log('[GSM] Context opened');
                cb(err, resp, raw);
            });
        }
    });
};

GSM.prototype._httpInit = function(cb) {
    console.log('[GSM] Initializing HTTP service');
    this._writeCommand('AT+HTTPINIT', 6000, function(err, resp, raw) {
        cb(err, resp, raw);
    });  
};

GSM.prototype._startsWith = function stringStartsWith (string, prefix) {
    return string.slice(0, prefix.length) == prefix;
};

GSM.prototype.request = function(url, options, cb) {
    var that = this;
    if(typeof options === 'function') {
        cb = options;
        options = null;
    }
    
    // Options
    var method = options && options['method'] ? options['method'] : 0;
    var contentType = options && options['contentType'] ? options['contentType'] : 'text/plain';
    var data = options && options['data'] ? options['data'] : null;
    
    var commands = [];
    
    // SSL support
    if (this._startsWith(url, 'https://')) {
        commands.push('AT+HTTPSSL=1');
    } else {
        commands.push('AT+HTTPSSL=0');
    }
    
    commands.push('AT+HTTPPARA="CID",1');
    commands.push('AT+HTTPPARA="URL","' + url + '"');

    // POST
    if (method == 1) {
        commands.push('AT+HTTPPARA="CONTENT","' + contentType + '"');
        commands.push(['AT+HTTPDATA=' + data.length + ',10000', 1000]);
        commands.push([data+String.fromCharCode(parseInt("1A", 16)), 5000]);
    }
    
    commands.push(['AT+HTTPACTION=' + method, 15000]);
    
    this._httpInit(function(err, resp, raw){
        that._writeCommandSequence(commands, 1000, function(err, resp, raw) {
            if (raw[1] == 200) {
                console.log('[GSM] HTTP Response Code: ' + raw[1]);
                that._readHTTPResponse(raw[2], 0, cb);
            } else {
                console.log('[GSM] HTTP Error: ' + resp);
                that._httpTerminate();
                return cb(resp);
            } 
        });
    });
};

GSM.prototype._readHTTPResponse = function(bytes, start, cb) {
    var that = this;
    if(typeof start == 'function') {
        cb = start;
        start = 0;
    }
    
    var buff = '';
    
    var readBytes = function(start, end) {
        if (end > bytes) end = bytes;
        var readName = start + ',' + end;
        //console.log('[GSM] Reading...' + readName);
        that._writeCommand('AT+HTTPREAD=' + start + ',' + end, (end-start) * 100, function(err, resp, items, raw) {
            if(raw && raw.length > 0 && raw[0] && (raw[raw.length-2] && raw[raw.length-2].trim() === 'OK'))  {
                buff += raw[raw.length-3];
                if(end == bytes) {
                    that._httpTerminate();
                    cb(buff);
                } else readBytes(end+1, end+101);
            } else {
                console.log('[GSM] Read failed (' + readName + '):', raw);
                that._httpTerminate();
                return cb(buff);
            }
        });
    };
    
    readBytes(0, bytes);
};

GSM.prototype._httpTerminate = function() {
    this._writeCommand('AT+HTTPTERM', 100, function() {});  
};

GSM.prototype._initGPRS = function(cb) {
    this._writeCommand('AT+SAPBR=1,1', 500, cb);  
};

module.exports = GSM;
