"use strict";

const RyderSerial = require("../out/index");

const PORT_NUMBER = "/dev/ttys003" // feel free to change this to test your own running Ryder simulator

const ryder_serial = new RyderSerial(PORT_NUMBER, { debug: true })

async function test() {

	process.on('unhandledRejection', error => {
			console.error(error);
			try{
				ryder_serial.close();
			} catch(e){}
			return new Promise((resolve, reject) => reject(`TEST FAILED (error below)\n\nUnhandled error: ${error}`))
	});

	return new Promise((resolve, reject) => {
		ryder_serial.on('failed', error => {
			console.log('Could not connect to the Ryder on the specified port. Wrong port or it is currently in use. The error was:',error);
			reject(`TEST FAILED (error below)\n\nUnhandled error: ${error}`)
		});
		ryder_serial.on('open', async () => {
			const info = await ryder_serial.send(RyderSerial.COMMAND_INFO);
			if (!info || info.substr(0,5) !== 'ryder') {
				console.error(`Device at ${PORT_NUMBER} does not appear to be a Ryder device`);
				ryder_serial.close()
				resolve("TEST PASSED!");
			}
			console.log(`${!!info.charCodeAt(9)?'I':'Uni'}nitialised Ryder FW version ${info.charCodeAt(5)}.${info.charCodeAt(6)}.${info.charCodeAt(7)} on ${PORT_NUMBER}`);
			resolve("TEST PASSED");
		});
		ryder_serial.on('wait_user_confirm',() => console.log('Confirm or cancel on Ryder device.'));
	});
}

test()
.then(res => console.log(res))
.catch(err => console.error(err))
.finally(() => {
	ryder_serial.close()
});
