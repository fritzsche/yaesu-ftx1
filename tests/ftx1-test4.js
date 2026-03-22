/**
 * ftx1-test4.js - MA Command Test
 * Test to understand MA command behavior with/without MC
 */

import { NodeSerial } from '../js/SerialInterface.js';

const SERIAL_PORT = '/dev/cu.usbserial-01A9994B0';

class Ftx1Api {
    constructor(serial) {
        this.serial = serial;
    }

    async cmd(command, expectResponse = true) {
        await this._delay(50);
        await this.serial.send(`${command};`);
        if (expectResponse) {
            try {
                return await this.serial.readUntil(';');
            } catch (err) {
                return null;
            }
        }
        return null;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async mr(ch) {
        return await this.cmd(`MR${String(ch).padStart(5, '0')}`);
    }

    async mc(ch) {
        return await this.cmd(`MC${String(ch).padStart(5, '0')}`, false);
    }

    async ma() {
        // MA with no parameters
        return await this.cmd('MA', false);
    }

    async ct() {
        return await this.cmd('CT0');
    }

    async cn() {
        return await this.cmd('CN00');
    }

    async fa() {
        return await this.cmd('FA');
    }
}

async function run() {
    console.log('===========================================');
    console.log('FTX-1 MA Command Test');
    console.log('===========================================');

    const serial = new NodeSerial(SERIAL_PORT);
    const radio = new Ftx1Api(serial);

    try {
        await serial.connect();
        console.log('Connected!\n');

        // Clear any pending state
        await radio.fa();
        await radio._delay(100);

        // Test memory channel 50 (known to have Tone data)
        const testCh = 50;

        console.log('=== Test: MA with no parameter ===');

        // First, select with MC
        console.log(`1. MC${testCh} - select memory channel`);
        await radio.mc(testCh);
        await radio._delay(100);

        // Then MA with no parameter
        console.log('2. MA - load selected memory (no parameter)');
        await radio.ma();
        await radio._delay(100);

        // Read back
        const ct1 = await radio.ct();
        const cn1 = await radio.cn();
        const fa1 = await radio.fa();
        console.log(`   CT=${ct1}, CN=${cn1}, FA=${fa1}`);

        console.log('');

        console.log('=== Test: Just MA without prior MC ===');
        // FA to clear state
        await radio.fa();
        await radio._delay(100);

        // Just MA alone
        console.log('1. FA - clear state');
        console.log('2. MA - load (no prior MC)');
        await radio.ma();
        await radio._delay(100);

        const ct2 = await radio.ct();
        const cn2 = await radio.cn();
        const fa2 = await radio.fa();
        console.log(`   CT=${ct2}, CN=${cn2}, FA=${fa2}`);

        console.log('');

        console.log('=== Test: Check what MR shows for comparison ===');
        const mr = await radio.mr(testCh);
        console.log(`MR response: ${mr}`);
        if (mr) {
            const data = mr.substring(7);
            console.log(`   Tone mode at data[18]: ${data.charAt(18)}`);
        }

        console.log('===========================================');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await serial.close();
    }
}

run();
