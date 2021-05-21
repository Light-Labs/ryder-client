/// <reference types="node" />
import SerialPort from 'serialport';
import Events from "events";
declare const state_symbol: unique symbol;
declare const lock_symbol: unique symbol;
declare const train_symbol: unique symbol;
declare const watchdog_symbol: unique symbol;
declare const reconnect_symbol: unique symbol;
export interface RyderSerialOptions extends SerialPort.OpenOptions {
    rejectOnLocked: any;
    reconnectTime: number;
    debug: boolean;
}
declare type TrainEntry = [
    string,
    (value?: any) => void,
    (error?: any) => void,
    boolean,
    string
];
export default class RyderSerial extends Events.EventEmitter {
    id: number;
    port: string;
    options: RyderSerialOptions;
    [train_symbol]: TrainEntry[];
    [state_symbol]: number;
    [lock_symbol]: Array<(value?: any) => void>;
    [watchdog_symbol]: NodeJS.Timeout;
    [reconnect_symbol]: NodeJS.Timeout;
    closing: boolean;
    serial?: SerialPort;
    static COMMAND_WAKE: number;
    static COMMAND_INFO: number;
    static COMMAND_SETUP: number;
    static COMMAND_RESTORE_FROM_SEED: number;
    static COMMAND_RESTORE_FROM_MNEMONIC: number;
    static COMMAND_ERASE: number;
    static COMMAND_EXPORT_OWNER_KEY: number;
    static COMMAND_EXPORT_OWNER_KEY_PRIVATE_KEY: number;
    static COMMAND_EXPORT_APP_KEY: number;
    static COMMAND_EXPORT_APP_KEY_PRIVATE_KEY: number;
    static COMMAND_EXPORT_OWNER_APP_KEY_PRIVATE_KEY: number;
    static COMMAND_EXPORT_PUBLIC_IDENTITIES: number;
    static COMMAND_EXPORT_PUBLIC_IDENTITY: number;
    static COMMAND_START_ENCRYPT: number;
    static COMMAND_START_DECRYPT: number;
    static COMMAND_CANCEL: number;
    static RESPONSE_OK: number;
    static RESPONSE_SEND_INPUT: number;
    static RESPONSE_REJECTED: number;
    static RESPONSE_LOCKED: number;
    constructor(port: string, options?: RyderSerialOptions);
    serial_error(error: Error): void;
    serial_data(data: Uint8Array): void;
    serial_watchdog(): void;
    open(port?: string, options?: RyderSerialOptions): void;
    close(): void;
    locked(): boolean;
    lock(): Promise<void>;
    unlock(): void;
    sequence(callback: (value: any) => Promise<any>): Promise<any>;
    send(data: string | number, prepend?: boolean): Promise<void>;
    next(): void;
    clear(): void;
}
export {};
//# sourceMappingURL=index.d.ts.map