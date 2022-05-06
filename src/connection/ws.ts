import SerialPort from "serialport";
import { WebSocket } from "ws";

export class WSConnection {
    private open: boolean;
    private socket: WebSocket;
    constructor(path: string, options?: SerialPort.OpenOptions) {
        this.open = false;
        this.socket = new WebSocket(path);
    }

    isOpen(): boolean {
        return this.open;
    }

    write(
        data: Buffer,
        callback?: (error: Error | null | undefined, bytesWritten: number) => void
    ): boolean {
        //do something
        return true;
    }

    on(event: string, callback: (data?: any) => void): this {
        switch (event) {
            case "data":
                this.socket.addEventListener("message", messageEvent => {
                    console.log(messageEvent.data);
                    callback(messageEvent.data);
                });
                break;
            case "error":
                this.socket.addEventListener(event, errorEvent => {
                    callback(errorEvent);
                });
                break;
            case "close":
                this.socket.addEventListener("close", closeEvent => {
                    this.open = false;
                    callback();
                });
                break;
            case "open":
                this.socket.addEventListener(event, openEvent => {
                    this.open = true;
                    callback();
                });
                break;

            default:
                console.log("unsupported event ", event);
        }

        return this;
    }

    close(): void {
        this.socket.close();
    }
}
