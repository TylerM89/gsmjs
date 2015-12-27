/* 
* @Author: Mike Reich (Original), Tyler McDowall
*/

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
    //console.log('raw', this._buffer.toString('ascii'));
    raw.forEach(function(res) {
        res = res.trim();
        if(res === '') return;
        console.log(res);
        if (res[0] == '+') {
            var details = res.split(':');
            var resCommand = that._parseCommand(details[0]);
            if (resCommand == command) {
                res = details[1];
            }
            else {
                return error = res.substr(1, res.length-1);
            }
        }
        res = res.trim();
        
        if (res.indexOf(',') > -1) {
            var resItems = res.split(',');
            resItems.forEach(function(resItem){
               items.push(resItem); 
            });
        }
        else {
            items.push(res);
        }
        if(res == "OK" || res == ">") {
            response = error || res;
            error = null;
        }
    });
    cb(error, response, items);
};

GSM.prototype._parseCommand = function(c) {
    c = c.replace('?', '');
    if (c[0] == '+') {
        c = 'AT' + c;
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
    var processCommand = function(err, result) {
        if(err) return cb(err);
        if(commands.length === 0) return cb(err, result);
        var command = commands.shift();
        if(Array.isArray(command)) {
            timeout = command[1];
            command = command[0];
        }
        that._writeCommand(command, timeout, processCommand);
    };
    processCommand();
};

module.exports = GSM;
