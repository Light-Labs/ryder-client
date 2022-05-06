import SerialPort from "serialport"; // https://serialport.io/docs/

export class SerialConnection extends SerialPort {}

/**
 * Retrieve all Ryder devices from SerialPort connection.
 */
export async function enumerate_devices(): Promise<SerialPort.PortInfo[]> {
    const devices = await SerialPort.list();
    const ryder_devices = devices.filter(
        device => device.vendorId === "10c4" && device.productId === "ea60"
    );
    return Promise.resolve(ryder_devices);
}
