#! /usr/bin/env node
import RyderSerial from "@lightlabs/ryderserial-proto";

function main() {
    // change the following to whatever port your simulator is running at!
    let port_name = "/dev/ttys012";
    let options = {
        // how long to wait before reconnect (ms).
        reconnect_time: 1000,
        // enable debug output to stdout.
        debug: true,
    };

    let ryder_serial = new RyderSerial(port_name, options);

    // as soon as ryder_serial successfully opens, we'll run the following function
    ryder_serial.on("open", async () => {
        const response = await ryder_serial.send([RyderSerial.COMMAND_INFO]);
        console.log({ response }); // -> { response: 'ryder\x00\x00\x02\x00\x01' }

        // don't forget to call `.close()` otherwise ryder_serial will remain open and
        // Node will continue running
        ryder_serial.close();
    });
}

main();
