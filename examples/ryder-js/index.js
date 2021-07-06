import RyderSerial from "@lightlabs/ryderserial-proto";

function main() {
    let port_name = "/dev/ttys012";
    let options = {
        debug: true,
    };

    let ryder_serial = new RyderSerial(port_name, options);
    ryder_serial.on("open", async () => {
        const response = await ryder_serial.send(RyderSerial.COMMAND_INFO);
        console.log(response);
    });
}

main();
