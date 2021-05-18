const RyderSerial = require("../out/index");

const ryder_serial = new RyderSerial("/dev/ttys004", { debug: false })

const res = await ryder_serial.send(RyderSerial.COMMAND_INFO)
console.log({res})
