/**
 * ftx1-test5.js - Test sequence: MC -> MA -> CT/CN
 * and try explicit CT/CN setting
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
        return await this.cmd('MA', false);
    }

    async ct(mode) {
        if (mode !== undefined) {
            return await this.cmd(`CT0${mode}`, false);
        }
        return await this.cmd('CT0');
    }

    async cn(idx) {
        if (idx !== undefined) {
            const i = String(idx).padStart(3, '0');
            return await this.cmd(`CN000${i}`, false);
        }
        return await this.cmd('CN00');
    }

    async fa(freq) {
        if (freq !== undefined) {
            const f = String(freq).padStart(9, '0');
            return await this.cmd(`FA${f}`, false);
        }
        return await this.cmd('FA');
    }
}

async function run() {
    console.log('===========================================');
    console.log('FTX-1 Memory Tone Read Test');
    console.log('===========================================');

    const serial = new NodeSerial(SERIAL_PORT);
    const radio = new Ftx1Api(serial);

    const TEST_CH = 50; // Memory with Tone 94.8 stored

    try {
        await serial.connect();
        console.log('Connected!\n');

        // Check MR for expected values
        console.log('=== MR shows ===');
        const mr = await radio.mr(TEST_CH);
        console.log(`MR: ${mr}`);
        const mrData = mr.substring(7);
        console.log(`Tone mode in MR[18]: ${mrData.charAt(18)}`);
        console.log('');

        // Test 1: FA to set VFO to memory frequency first
        console.log('=== Test 1: FA to set VFO freq, then MA ===');
        const vfoFreq = mrData.substring(0, 9);
        console.log(`Setting VFO to ${vfoFreq} Hz`);
        await radio.fa(parseInt(vfoFreq));
        await radio._delay(100);

        await radio.ma();
        await radio._delay(100);

        const ct1 = await radio.ct();
        const cn1 = await radio.cn();
        const fa1 = await radio.fa();
        console.log(`After MA: CT=${ct1}, CN=${cn1}, FA=${fa1}`);
        console.log('');

        // Test 2: Set CT/CN to what MR says, then verify
        console.log('=== Test 2: Set CT=01 (Tone), CN=010 (94.8Hz) ===');
        await radio.ct(1); // Tone
        await radio._delay(50);
        await radio.cn(10); // 94.8 Hz
        await radio._delay(50);

        const ct2 = await radio.ct();
        const cn2 = await radio.cn();
        console.log(`After explicit set: CT=${ct2}, CN=${cn2}`);
        console.log('');

        // Test 3: Full sequence - FA freq, MC select, MA load, CT/CN read
        console.log('=== Test 3: Full sequence ===');
        console.log('1. FA to memory frequency');
        await radio.fa(parseInt(vfoFreq));
        await radio._delay(50);

        console.log('2. MC to select memory');
        await radio.mc(TEST_CH);
        await radio._delay(50);

        console.log('3. MA to load memory');
        await radio.ma();
        await radio._delay(100);

        console.log('4. Read CT/CN');
        const ct3 = await radio.ct();
        const cn3 = await radio.cn();
        const fa3 = await radio.fa();
        console.log(`Result: CT=${ct3}, CN=${cn3}, FA=${fa3}`);
        console.log('');

        // Test 4: What if we read CT/CN BEFORE MA?
        console.log('=== Test 4: Read CT/CN before MA ===');
        await radio.fa(parseInt(vfoFreq));
        await radio._delay(50);
        await radio.mc(TEST_CH);
        await radio._delay(50);

        const ct4a = await radio.ct();
        const cn4a = await radio.cn();
        console.log(`Before MA: CT=${ct4a}, CN=${cn4a}`);

        await radio.ma();
        await radio._delay(100);

        const ct4b = await radio.ct();
        const cn4b = await radio.cn();
        console.log(`After MA: CT=${ct4b}, CN=${cn4b}`);
        console.log('');

        console.log('===========================================');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await serial.close();
    }
}

run();
