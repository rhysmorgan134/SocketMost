"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var serialport_1 = require("serialport");
serialport_1.SerialPort.list().then(function (data) {
    console.log(data);
});
