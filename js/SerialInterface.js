// SerialInterface.js

/** Base Abstract Class */
export class SerialInterface {
    async connect() { throw new Error("Not implemented") }
    async send(data) { throw new Error("Not implemented") }
    async readUntil(delimiter) { throw new Error("Not implemented") }
    async close() { throw new Error("Not implemented") }
}

/** 1. Browser Implementation (Web Serial API) */
export class WebSerial extends SerialInterface {
    constructor(baudRate = 38400) {
        super()
        this.baudRate = baudRate
        this.port = null
        this.reader = null
    }

    async connect() {
        this.port = await navigator.serial.requestPort()
        await this.port.open({ baudRate: this.baudRate })
        this.reader = this.port.readable.getReader()
    }

    async send(data) {
        const encoder = new TextEncoder()
        const writer = this.port.writable.getWriter()
        await writer.write(encoder.encode(data))
        writer.releaseLock()
    }

    async readUntil(delimiter) {
        let buffer = ""
        const decoder = new TextDecoder()
        while (true) {
            const { value, done } = await this.reader.read()
            if (done) break
            buffer += decoder.decode(value)
            if (buffer.includes(delimiter)) {
                const parts = buffer.split(delimiter)
                return parts[0] // Return the message before the delimiter
            }
        }
    }
}

/** Node.js Implementation (SerialPort) */
export class NodeSerial extends SerialInterface {
    constructor(path, baudRate = 38400) {
        super();
        this.path = path;
        this.baudRate = baudRate;
        this.port = null;
        this._onDataHandler = null; // Store reference to remove it later
    }

    async connect() {
        const { SerialPort } = await import('serialport');
        return new Promise((resolve, reject) => {
            this.port = new SerialPort({ 
                path: this.path, 
                baudRate: this.baudRate,
                autoOpen: true 
            }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async send(data) {
        return new Promise((resolve, reject) => {
            this.port.write(data, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async readUntil(delimiter) {
        return new Promise((resolve, reject) => {
            let buffer = "";
            
            // Define the handler so we can remove it
            this._onDataHandler = (data) => {
                buffer += data.toString();
                if (buffer.includes(delimiter)) {
                    const result = buffer.split(delimiter)[0];
                    this.port.removeListener('data', this._onDataHandler);
                    this._onDataHandler = null;
                    resolve(result);
                }
            };

            this.port.on('data', this._onDataHandler);

            // Safety timeout so it doesn't hang forever if radio doesn't reply
            setTimeout(() => {
                if (this._onDataHandler) {
                    this.port.removeListener('data', this._onDataHandler);
                    reject(new Error("Timeout waiting for radio response"));
                }
            }, 2000);
        });
    }

    async close() {
        return new Promise((resolve) => {
            if (this.port && this.port.isOpen) {
                // Remove all listeners to free the event loop
                this.port.removeAllListeners();
                this.port.close(() => {
                    console.log("Serial port closed.");
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

/** 3. Mock Implementation for Testing */
export class MockSerial extends SerialInterface {
    constructor() {
        super()
        this.lastSent = ""
    }
    async connect() { console.log("Mock Connected") }
    async send(data) { this.lastSent = data }
    async readUntil(delimiter) { return "ID0840" }
}