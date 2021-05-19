const RyderSerial = require("../out/index");


async function test() {
	const ryder_serial = new RyderSerial("/dev/ttys004", { debug: true })

	// const info = ryder_serial.send(RyderSerial.COMMAND_INFO)
	// console.log(`${!!info.charCodeAt(9)?'I':'Uni'}nitialised Ryder FW version ${info.charCodeAt(5)}.${info.charCodeAt(6)}.${info.charCodeAt(7)} on ${argv['ryder-port']}`);
	// ryder_serial.send(RyderSerial.COMMAND_INFO)
	// .then(info => console.log(`${!!info.charCodeAt(9)?'I':'Uni'}nitialised Ryder FW version ${info.charCodeAt(5)}.${info.charCodeAt(6)}.${info.charCodeAt(7)} on ${argv['ryder-port']}`))
	// .catch(err => console.log(err))
	// .finally(() => {
	// ryder_serial.close();

	// process.on('unhandledRejection', error => {
	// 		console.error(error);
	// 		try{
	// 			ryder_serial.close();
	// 		} catch(e){}
	// 		process.exit(1);
	// });

	return new Promise((resolve) => {
		ryder_serial.on('failed',error => {
			console.log('Could not connect to the Ryder on the specified port. Wrong port or it is currently in use. The error was:',error);
			process.exit();
		});
		ryder_serial.on('open', async () => {
			const info = await ryder_serial.send(RyderSerial.COMMAND_INFO);
			if (!info || info.substr(0,5) !== 'ryder') {
				console.error(`Device at ${"/dev/ttys004"} does not appear to be a Ryder device`);
				ryder_serial.close()
				resolve("Device was not a Ryder device, and our ryder_serial succeeded!");
			}
			resolve("Device was a Ryder device, and our ryder_serial succeeded!");
		});
		ryder_serial.on('wait_user_confirm',() => console.log('Confirm or cancel on Ryder device.'));
	});

}

test()
