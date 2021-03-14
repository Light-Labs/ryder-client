# RyderSerial

RyderSerial is a library to facilitate communications between an application and Ryder device. It is written in JavaScript. It is built in an async/await pattern and makes extensive use of Promises. It does not currently feature command-specific methods, this would be a useful future addition. (E.g. `ryder_serial.info()` instead of `ryder_serial.send(RyderSerial.COMMAND_INFO)`.)

Responses are read in the order the commands are passed in. Responses are also delayed for as long as it takes for the command to be processed. It means that commands which require user confirmation (like a key export) will only be resolved after the user interacts with the Ryder. A watchdog makes sure that a Promise does not stay pending forever but it will wait when the Ryder signals it is waiting for a user interaction.

## Basic usage

Install:

```bash
npm install git+https://github.com/Light-Labs/ryderserial-proto.git
```

Construct and query:

```JS
const RyderSerial = require('ryderserial-proto');
const ryder_port = '/dev/ttyUSB*';

const options = {
	reconnectTime: 1000,	// how long to wait before reconnect (ms).
	debug: true				// enable debug output to stdout.
	};

const ryder_serial = new RyderSerial(ryder_port,options);

 ryder_serial.on('open', ()=>{
    const response =  ryder_serial.send(RyderSerial.COMMAND_INFO).then(response =>{
        console.log(`Info: ${response}`);
    });
})
```

## Sequencing commands

Sometimes you need to send a few commands in sequence and make sure different parts of your application do not send a command in between. For this you can start a sequence. The sequence will wait in line and then execute the commands once access to the Ryder has been "released". Other code can check if a lock exists with `ryder_serial.locked()`.

See this example taken from the proxy prototype:

```JS
function request_app_private_key(identity_number,app_domain)
	{
	return ryder_serial.sequence(async () =>
		{
		console.debug('starting sequence');
		var cmd = new Uint8Array(2);
		cmd[0] = RyderSerial.COMMAND_EXPORT_OWNER_APP_KEY_PRIVATE_KEY;
		cmd[1] = identity_number;
		var response = await ryder_serial.send(cmd);
		if (response !== RyderSerial.RESPONSE_SEND_INPUT)
			return false;
		response = await ryder_serial.send(app_domain+"\0");
		if (response === RyderSerial.RESPONSE_REJECTED)
			return false; // user cancel
		var split = response.split(',');
		var result = 
			{
				app_domain: split[0].substr(2),
				app_public_key: split[1],
				app_private_key: split[2],
				owner_private_key: split[3]
			};
		return result;
		});
	}
```

## API

`ryder_serial.open(port,options)`

(Re)open a connection to a Ryder device, same as constructor. Note that a connection is opened automatically when a `RyderSerial` object is constructed.

`ryder_serial.close()`

Closes the connection and clears any remaining locks and queued commands (rejecting them).

`ryder_serial.locked()`

Returns `true` or `false`, based on whether any locks exist on the serial connection. (By using `sequence()` or `lock()`.)

`ryder_serial.lock()`

Requests a lock to be placed so that commands can be sent in sequence. Returns a Promise that resolves when the lock is granted.

`ryder_serial.unlock()`

Releases the last lock that was requested. Be sure to call this after calling `lock()`, otherwise the serial connection may be blocked until your app exits or the Ryder disconnects.

`ryder_serial.sequence(async callback)`

A utility function that requests a lock and executes the callback once the lock has been granted. Once the callback resolves, it will then release the lock. Useful to chain commands whilst making your application less error-prone (forgetting to call `unlock()`). Returns a Promise that resolves to whatever `callback` returns.

`ryder_serial.send(Buffer|TypedArray|Array|number|string data,optional bool prepend)`

Send a command and/or data to the Ryder device. The command will be queued and executed once preceding commands have completed. Data can be passed in as a buffer, typed array, array, number (as byte), or string. Set `prepend` to `true` to put the data on the top of the queue. Returns a Promise that resolves with response from the Ryder device (includes waiting for a possible user confirm). The returned data may be a single byte (see the constants below) and/or resulting data, like an identity or app key.

`ryder_serial.next()`

Moves on to the next command in the queue. This method should ordinarily not be called directly. The library takes care of queueing and will call `next()` at the right time.

`ryder_serial.clear()`

Clears the entire command queue and releases any locks, rejecting any pending Promises. This method is also called by `close()`.

## Constants

Sending commands and checking responses should be done by using the built-in constants. The underlying byte values are an implementation detail until the protocol is formalised.

**Commands**

`RyderSerial.COMMAND_WAKE`

Wakes the device, puts it in high-power mode and turns on the display. (The same as tapping the screen.)


`RyderSerial.COMMAND_INFO`

Returns some information about the device in the following format:

`ryder[VERSION_MAJOR][VERSION_MINOR][VERSION_PATCH][MODE][INITIALISED]`

 Where the 5 bytes spell `"ryder"` in ASCII, followed by 3 version bytes, a mode byte, and a byte that signifies whether the Ryder is initialised or not.

 Example:

 ```JS
const info = await argv._ryder_serial.send(RyderSerial.COMMAND_INFO);
const version = `${info.charCodeAt(5)}.${info.charCodeAt(6)}.${info.charCodeAt(7)}`;
 ```


`RyderSerial.COMMAND_SETUP`

Triggers the setup prompt on the Ryder device.


`RyderSerial.COMMAND_RESTORE_FROM_SEED`

*Not implemented at this time.*


`RyderSerial.COMMAND_RESTORE_FROM_MNEMONIC`

Triggers the restore from mnemonic seed phrase flow on the Ryder. This command should be followed by one byte defining the word count (either `12`, `18`, or `24`). If all goes well, the Ryder will respond with `RyderSerial.RESPONSE_SEND_INPUT`, from which words can be sent to the Ryder in ASCII in the order shown on the Ryder. Words should be terminated by a space character (`" "`, hex value `0x20`).

Example:

```JS
const response = await ryder_serial.send([RyderSerial.COMMAND_RESTORE_FROM_MNEMONIC,12]);
if (response === RyderSerial.RESPONSE_SEND_INPUT)
	{
	// OK to send words.
	}
```


`RyderSerial.COMMAND_ERASE`

Triggers the erase flow on the Ryder.

`RyderSerial.COMMAND_EXPORT_OWNER_KEY`

*Not implemented at this time.*

`RyderSerial.COMMAND_EXPORT_OWNER_KEY_PRIVATE_KEY`

*Not implemented at this time.*

`RyderSerial.COMMAND_EXPORT_APP_KEY`

Exports an app key for a given application.

Example:

```JS
// where the second value (the 0) is the identity number.
const data = [RyderSerial.COMMAND_EXPORT_APP_KEY,0];
const response = await ryder_serial.send(data);
if (response === RyderSerial.RESPONSE_SEND_INPUT)
	{
	// Send the app domain terminated by a null byte.
	const app_key = ryder_serial.send("https://btc.us\0");
	// app key will be RyderSerial.RESPONSE_REJECTED if the user
	// presses Cancel, otherwise the response will be in the following
	// format:
	// "https://btc.us,app_key_here"
	}
```

`RyderSerial.COMMAND_EXPORT_APP_KEY_PRIVATE_KEY`

The same as `RyderSerial.COMMAND_EXPORT_APP_KEY` but the app private key is appended to the response.

`RyderSerial.COMMAND_EXPORT_OWNER_APP_KEY_PRIVATE_KEY`

The same as `RyderSerial.COMMAND_EXPORT_APP_KEY` but the app private key and the owner private key are appended to the response.


`RyderSerial.COMMAND_EXPORT_PUBLIC_IDENTITIES`

*Not implemented at this time.*

`RyderSerial.COMMAND_EXPORT_PUBLIC_IDENTITY`

Exports an identity key. This command will trigger a user confirm in the future.

Example:

```JS
// where the 0 is the identity number.
const data = [RyderSerial.COMMAND_EXPORT_PUBLIC_IDENTITY,0];
const identity = await ryder_serial.send(data);
```


`RyderSerial.COMMAND_START_ENCRYPT`

*Not implemented at this time.*

`RyderSerial.COMMAND_START_DECRYPT`

*Not implemented at this time.*

`RyderSerial.COMMAND_CANCEL`

Cancels a user prompt.


**Responses**

`RyderSerial.RESPONSE_OK`

Generic affirming response.

`RyderSerial.RESPONSE_SEND_INPUT`

Command accepted, some form of input depending on the command is requested.

`RyderSerial.RESPONSE_REJECTED`

The user rejected the request by pressing Cancel on the Ryder.

`RyderSerial.RESPONSE_LOCKED`

The Ryder is currently locked and has to be unlocked by entering a PIN first. The PIN feature is currently not implemented.

## Contributing

1. Create a branch with the naming convention `first-name/feature-name`.
2. Open a pull request and request a review of a fellow Pioneer.
3. Squash and merge is preferred.

