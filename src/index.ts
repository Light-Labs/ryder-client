import RyderSerial, { Options, enumerate_devices } from "./ryder-serial";
import { LogLevel, Logger } from "./logging";

export default RyderSerial;
export { Options, enumerate_devices };
export { LogLevel, Logger };

module.exports = RyderSerial;
module.exports.enumerate_devices = enumerate_devices;
