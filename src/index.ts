'use strict';

import SerialPort from 'serialport';
import Events from "events";

// responses
const RESPONSE_OK = 1;                  // generic command ok/received
const RESPONSE_SEND_INPUT = 2;          // command received, send input
const RESPONSE_REJECTED = 3;            // user input rejected
const RESPONSE_OUTPUT = 4;              // sending output
const RESPONSE_OUTPUT_END = 5;          // end of output
const RESPONSE_ESC_SEQUENCE = 6;        // output esc sequence
const RESPONSE_WAIT_USER_CONFIRM = 10;  // user has to confirm action
const RESPONSE_LOCKED = 11;             // device is locked, send PIN

// error responses
const response_errors: {
  [index: number]: string;
} = {
  255: 'RESPONSE_ERROR_UNKNOWN_COMMAND',
  254: 'RESPONSE_ERROR_NOT_INITIALIZED',
  253: 'RESPONSE_ERROR_MEMORY_ERROR',
  252: 'RESPONSE_ERROR_APP_DOMAIN_TOO_LONG',
  251: 'RESPONSE_ERROR_APP_DOMAIN_INVALID',
  250: 'RESPONSE_ERROR_MNEMONIC_TOO_LONG',
  249: 'RESPONSE_ERROR_MNEMONIC_INVALID',
  248: 'RESPONSE_ERROR_GENERATE_MNEMONIC',
  247: 'RESPONSE_ERROR_INPUT_TIMEOUT',
  246: 'RESPONSE_ERROR_NOT_IMPLEMENTED'
};

const STATE_IDLE = 0;
const STATE_SENDING = 1;
const STATE_READING = 2;

const state_symbol = Symbol('state');
const lock_symbol = Symbol('ready');
const train_symbol = Symbol('train');
const watchdog_symbol = Symbol('watchdog');
const reconnect_symbol = Symbol('reconnect');

const WATCHDOG_TIMEOUT = 5000;

let id = 0;

export interface RyderSerialOptions extends SerialPort.OpenOptions {
  rejectOnLocked: any;
  reconnectTime: number,
  debug: boolean;
}

type TrainEntry = [
  string,                 // data
  (value?: any) => void,  // resolve
  (error?: any) => void,  // reject
  boolean,                // isEscapedByte
  // TODO: does this need to be refactored to type `Buffer`, `Array<Byte>`, or stay as `string`?
  string                  // output buffer
]

export default class RyderSerial extends Events.EventEmitter {
  id: number;
  port: string;
  options: RyderSerialOptions;
  closing: boolean;
  serial?: SerialPort
  // TODO: refactor train into its own encapsulated class
  [train_symbol]: TrainEntry[]
  [state_symbol]: number;
  [lock_symbol]: Array<(value?: any) => void>
  [watchdog_symbol]: NodeJS.Timeout
  [reconnect_symbol]: NodeJS.Timeout


  // command constants
  static readonly COMMAND_WAKE = 1;
  static readonly COMMAND_INFO = 2;
  static readonly COMMAND_SETUP = 10;
  static readonly COMMAND_RESTORE_FROM_SEED = 11;
  static readonly COMMAND_RESTORE_FROM_MNEMONIC = 12;
  static readonly COMMAND_ERASE = 13;
  static readonly COMMAND_EXPORT_OWNER_KEY = 18;
  static readonly COMMAND_EXPORT_OWNER_KEY_PRIVATE_KEY = 19;
  static readonly COMMAND_EXPORT_APP_KEY = 20;
  static readonly COMMAND_EXPORT_APP_KEY_PRIVATE_KEY = 21;
  static readonly COMMAND_EXPORT_OWNER_APP_KEY_PRIVATE_KEY = 23;
  static readonly COMMAND_EXPORT_PUBLIC_IDENTITIES = 30;
  static readonly COMMAND_EXPORT_PUBLIC_IDENTITY = 31;
  // encrypt/decrypt commands
  static readonly COMMAND_START_ENCRYPT = 40;
  static readonly COMMAND_START_DECRYPT = 41;
  // cancel command
  static readonly COMMAND_CANCEL = 100;
  // response constants
  static readonly RESPONSE_OK = RESPONSE_OK;
  static readonly RESPONSE_SEND_INPUT = RESPONSE_SEND_INPUT;
  static readonly RESPONSE_REJECTED = RESPONSE_REJECTED;
  static readonly RESPONSE_LOCKED = RESPONSE_LOCKED;

  constructor(port: string);
  constructor(port: string, options: RyderSerialOptions);
  constructor(port: string, options?: RyderSerialOptions) {
    super()
    this.id = id++;
    this.port = port;
    this.options = { rejectOnLocked: false, reconnectTime: 1000, debug: false, ...options }
    this[train_symbol] = [];
    this[state_symbol] = STATE_IDLE;
    this[lock_symbol] = [];
    this.closing = false;
    this.open();
  }

  serial_error(error: Error): void {
    this.emit('error', error);
    if (this[train_symbol][0]) {
      const [, , reject] = this[train_symbol].shift()!;
      reject(error);
    }
    clearTimeout(this[watchdog_symbol]);
    this[state_symbol] = STATE_IDLE;
    this.next();
  }

  serial_data(data: Uint8Array): void {
    this.options.debug && console.debug('data from Ryder', '0x' + Buffer.from(data).toString("hex"));
    if (this[state_symbol] === STATE_IDLE)
      this.options.debug && console.warn('Got data from Ryder without asking, discarding.');
    else {
      clearTimeout(this[watchdog_symbol]);
      if (!this[train_symbol][0])
        return;
      const [, resolve, reject] = this[train_symbol][0]!;
      let offset = 0;
      if (this[state_symbol] === STATE_SENDING) {
        if (data[0] === RyderSerial.RESPONSE_LOCKED) {
          this.options.debug && console.debug("!! WARNING: RESPONSE_LOCKED -- RYDER DEVICE IS NEVER SUPPOSED TO EMIT THIS EVENT");
          if (this.options.rejectOnLocked) {
            const error = new Error('ERROR_LOCKED');
            for (let i = 0; i < this[train_symbol].length; ++i) {
              const [, , reject] = this[train_symbol][i]
              reject(error);
            }
            this[state_symbol] = STATE_IDLE;
            this.emit('locked');
            return;
          }
          else {
            this.emit('locked');
          }
        }
        if (data[0] === RESPONSE_OK || data[0] === RESPONSE_SEND_INPUT || data[0] === RESPONSE_REJECTED) {
          this[train_symbol].shift();
          resolve(data[0]);
          if (data.length > 1) {
            this.options.debug && console.debug('ryderserial more in buffer');
            return this.serial_data.bind(this)(data.slice(1)); // more responses in the buffer
          }
          this[state_symbol] = STATE_IDLE;
          this.next();
          return
        }
        else if (data[0] === RESPONSE_OUTPUT) {
          this[state_symbol] = STATE_READING;
          ++offset;
        }
        else if (data[0] === RESPONSE_WAIT_USER_CONFIRM) {
          // wait for user to confirm
          this.emit('wait_user_confirm');
          this.options.debug && console.debug('waiting for user confirm on device');
          if (data.length > 1) {
            this.options.debug && console.debug('ryderserial more in buffer');
            return this.serial_data.bind(this)(data.slice(1)); // more responses in the buffer
          }
          return;
        }
        else if (data[0] in response_errors) {  // error
          reject(new Error(response_errors[data[0]]));
          this[train_symbol].shift();
          this[state_symbol] = STATE_IDLE;
          if (data.length > 1) {
            this.options.debug && console.debug('ryderserial more in buffer');
            return this.serial_data.bind(this)(data.slice(1)); // more responses in the buffer
          }
          return this.next();
        }
        else {
          reject(new Error('ERROR_UNKNOWN_RESPONSE'));
          this[train_symbol].shift();
          this[state_symbol] = STATE_IDLE;
          if (data.length > 1) {
            this.options.debug && console.debug('ryderserial more in buffer');
            return this.serial_data.bind(this)(data.slice(1)); // more responses in the buffer
          }
          return this.next();
        }
      }
      if (this[state_symbol] === STATE_READING) {
        this[watchdog_symbol] = setTimeout(this.serial_watchdog.bind(this), WATCHDOG_TIMEOUT);
        for (let i = offset; i < data.byteLength; ++i) {
          const b = data[i];
          if (!this[train_symbol][0][3]) { // previous was not escape byte
            if (b === RESPONSE_ESC_SEQUENCE) {
              this[train_symbol][0][3] = true; // esc byte
              continue; // skip esc byte
            }
            else if (b === RESPONSE_OUTPUT_END) {
              resolve(this[train_symbol][0][4]);
              this[train_symbol].shift();
              this[state_symbol] = STATE_IDLE;
              return this.next();
            }
          }
          this[train_symbol][0][3] = false; // esc byte
          this[train_symbol][0][4] += String.fromCharCode(b);
        }
      }
    }
  }

  serial_watchdog(): void {
    if (!this[train_symbol][0])
      return;
    const [, , reject] = this[train_symbol][0]!;
    this[train_symbol].shift();
    reject(new Error('ERROR_WATCHDOG'));
    this[state_symbol] = STATE_IDLE;
    this.next();
  }

  open(): void;
  open(port: string): void;
  open(port: string, options: RyderSerialOptions): void;
  open(port?: string, options?: RyderSerialOptions): void {
    this.options.debug && console.debug('ryderserial attempt open');
    this.closing = false;
    if (this.serial && this.serial.isOpen)
      return;
    if (this.serial)
      this.close();
    this.port = port || this.port;
    this.options = options || this.options || {};
    if (!this.options.baudRate)
      this.options.baudRate = 115200;
    if (!this.options.lock)
      this.options.lock = true;
    if (!this.options.reconnectTime)
      this.options.reconnectTime = 1000;
    this.serial = new SerialPort(this.port, this.options);
    this.serial.on('data', this.serial_data.bind(this));
    this.serial.on('error', error => {
      this.options.debug && console.warn(`this.serial encountered an error: ${error}`);
      if (this.serial && !this.serial.isOpen) {
        clearInterval(this[reconnect_symbol]);
        this[reconnect_symbol] = setInterval(this.open, this.options.reconnectTime);
        this.emit('failed', error);
      }
      this.serial_error.bind(this);
    });
    this.serial.on('close', () => {
      this.options.debug && console.debug('ryderserial close');
      this.emit('close');
      clearInterval(this[reconnect_symbol]);
      if (!this.closing)
        this[reconnect_symbol] = setInterval(this.open.bind(this), this.options.reconnectTime);
    });
    this.serial.on('open', () => {
      this.options.debug && console.debug('ryderserial open');
      clearInterval(this[reconnect_symbol]);
      this.emit('open');
      this.next();
    });
  };

  close(): void {
    if (this.closing)
      return;
    this.closing = true;
    this.clear();
    this.serial?.close();
    clearInterval(this[reconnect_symbol]);
    this.serial = undefined;
  };

  locked(): boolean {
    return !!this[lock_symbol].length;
  };

  lock(): Promise<void> {
    this.options.debug && console.debug('ryderserial lock');
    this[lock_symbol].push(Promise.resolve);
    return Promise.resolve();
  };

  unlock(): void {
    if (this[lock_symbol].length) {
      this.options.debug && console.debug('ryderserial unlock');
      const resolve = this[lock_symbol].shift();
      resolve && resolve();
    }
  };

  sequence(callback: (value: any) => Promise<any>): Promise<any> {
    if (typeof callback !== 'function' || callback.constructor.name !== 'AsyncFunction')
      return Promise.reject(new Error('ERROR_SEQUENCE_NOT_ASYNC'));
    return this.lock().then(callback).finally(this.unlock.bind(this));
  };

  send(data: string): Promise<void>;
  send(data: number): Promise<void>;
  send(data: string, prepend: boolean): Promise<void>;
  send(data: number, prepend: boolean): Promise<void>;
  send(data: string | number, prepend?: boolean): Promise<void> {
    if (!this.serial || !this.serial.isOpen)
      return Promise.reject(new Error('ERROR_DISCONNECTED'));
    if (typeof data === 'number')
      data = String.fromCharCode(data);
    this.options.debug && console.debug('queue data for Ryder: ' + data.length + ' byte(s)', Buffer.from(data).toString("hex"));
    return new Promise((resolve, reject) => {
      const c: TrainEntry = [data as string, resolve, reject, false, ''];
      prepend ? this[train_symbol].unshift(c) : this[train_symbol].push(c);
      this.next();
    });
  };

  next(): void {
    if (this[state_symbol] === STATE_IDLE) {
      if (!this[train_symbol].length)
        return;
      if (!this.serial || !this.serial.isOpen) {
        const [, , reject] = this[train_symbol][0];
        this.clear();
        reject(new Error('ERROR_DISCONNECTED'));
        return;
      }
      this[state_symbol] = STATE_SENDING;
      try {
        this.options.debug && console.debug('send data to Ryder: ' + this[train_symbol][0][0].length + ' byte(s)', Buffer.from(this[train_symbol][0][0]).toString("hex"));
        this.serial.write(this[train_symbol][0][0]);
      }
      catch (error) {
        this.options.debug && console.log(`encountered error while sending data: ${error}`)
        this.serial_error(error);
        return;
      }
      clearTimeout(this[watchdog_symbol]);
      this[watchdog_symbol] = setTimeout(this.serial_watchdog.bind(this), WATCHDOG_TIMEOUT);
    }
  };

  clear(): void {
    clearTimeout(this[watchdog_symbol]);
    for (let i = 0; i < this[train_symbol].length; ++i)
      this[train_symbol][i][2](new Error('ERROR_CLEARED')); // reject all pending
    this[train_symbol] = [];
    this[state_symbol] = STATE_IDLE;
    for (let i = 0; i < this[lock_symbol].length; ++i)
      this[lock_symbol][i] && this[lock_symbol][i](); // release all locks
    this[lock_symbol] = [];
  };
}

async function enumerate_devices(): Promise<SerialPort.PortInfo[]> {
  const devices = await SerialPort.list();
  const ryder_devices = devices.filter(device => (device.vendorId === '10c4' && device.productId === 'ea60'));
  return Promise.resolve(ryder_devices);
}

module.exports = RyderSerial
module.exports = enumerate_devices
