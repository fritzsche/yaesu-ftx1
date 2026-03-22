/**
 * ftx1-test3.js - FTX-1 CAT Command Test Program
 *
 * Tests various combinations to determine correct sequence for:
 * - Storing CTCSS tone mode and frequency in memory
 * - Retrieving stored CTCSS settings via MR and MA
 *
 * All CAT commands are accessible via a single API.
 */

import { NodeSerial } from '../js/SerialInterface.js';
import { CTCSS_TONES } from '../js/constants.js';

// Configuration
const SERIAL_PORT = '/dev/cu.usbserial-01A9994B0';

/**
 * FTX-1 CAT Command API
 * All commands accessible via single method call
 */
class Ftx1CatApi {
    constructor(serialInterface) {
        this.serial = serialInterface;
    }

    /** Send raw command and optionally wait for response */
    async cmd(command, expectResponse = true) {
        await this._delay(50);
        await this.serial.send(`${command};`);
        if (expectResponse) {
            try {
                return await this.serial.readUntil(';');
            } catch (err) {
                return null; // Timeout
            }
        }
        return null;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========== VFO Commands ==========

    /** FA - VFO-A Frequency */
    async getFrequency() {
        return await this.cmd('FA');
    }
    async setFrequency(freqHz) {
        const freq = String(freqHz).padStart(9, '0');
        return await this.cmd(`FA${freq}`, false);
    }

    /** MD - Operating Mode */
    async getMode() {
        return await this.cmd('MD0');
    }
    async setMode(modeChar) {
        return await this.cmd(`MD0${modeChar}`, false);
    }

    /** CT - Tone Mode (0=OFF, 1=Tone, 2=TSQL, 3=DCS) */
    async getToneMode(side = 0) {
        return await this.cmd(`CT${side}`);
    }
    async setToneMode(side = 0, toneMode = 0) {
        return await this.cmd(`CT${side}${toneMode}`, false);
    }

    /** CN - CTCSS/DCS Code */
    async getCtcss(side = 0) {
        return await this.cmd(`CN${side}0`);
    }
    async setCtcss(side = 0, index = 0) {
        const idx = String(index).padStart(3, '0');
        return await this.cmd(`CN${side}0${idx}`, false);
    }
    async getDcs(side = 0) {
        return await this.cmd(`CN${side}1`);
    }
    async setDcs(side = 0, code = 23) {
        const c = String(code).padStart(3, '0');
        return await this.cmd(`CN${side}1${c}`, false);
    }

    // ========== Memory Commands ==========

    /** Format channel to 5-digit string */
    _ch(channel) {
        return String(channel).padStart(5, '0');
    }

    /** MR - Memory Read */
    async mr(channel) {
        return await this.cmd(`MR${this._ch(channel)}`);
    }

    /** MW - Memory Write */
    async mw(channel, freqHz, duplex, offsetHz, mode = '4', toneMode = '0', shift = '0') {
        const ch = this._ch(channel);
        const freq = String(freqHz).padStart(9, '0');
        const clarDir = duplex === '+' ? '+' : duplex === '-' ? '-' : 'S';
        const clarFreq = '0000';
        const rxClar = '0';
        const txClar = '0';
        const memFlag = '1';
        const fixed = '00';
        // MW: MW + ccccc + fffffffff + X + ffff + RX + TX + M + C + T + ff + S
        const cmd = `MW${ch}${freq}${clarDir}${clarFreq}${rxClar}${txClar}${mode}${memFlag}${toneMode}${fixed}${shift}`;
        return await this.cmd(cmd, false);
    }

    /** MA - Memory to VFO */
    async ma(channel, vfo = 0) {
        return await this.cmd(`MA${vfo}${this._ch(channel)}`, false);
    }

    /** MC - Memory Channel to VFO buffer */
    async mc(channel, vfo = 0) {
        return await this.cmd(`MC${vfo}${this._ch(channel)}`, false);
    }

    /** MT - Memory Tag */
    async mt(channel) {
        return await this.cmd(`MT${this._ch(channel)}`);
    }
    async setMt(channel, tag) {
        const tag12 = (tag + '            ').substring(0, 12);
        return await this.cmd(`MT${this._ch(channel)}${tag12}`, false);
    }

    // ========== Clarifier Commands ==========

    /** RC - RX Clarifier */
    async getRxClarifier() {
        return await this.cmd('RC');
    }

    /** RT - TX Clarifier */
    async getTxClarifier() {
        return await this.cmd('RT');
    }

    /** FS - Clarifier ON/OFF */
    async getClarifierStatus() {
        return await this.cmd('FS');
    }
}

/**
 * Test program
 */
async function runTests() {
    console.log('===========================================');
    console.log('FTX-1 CTCSS Tone Storage Test');
    console.log('===========================================');
    console.log('');

    const serial = new NodeSerial(SERIAL_PORT);
    const radio = new Ftx1CatApi(serial);

    try {
        console.log(`Connecting to ${SERIAL_PORT}...`);
        await serial.connect();
        console.log('Connected!\n');

        // Test 1: Read current VFO state
        console.log('=== Test 1: Current VFO State ===');
        const fa = await radio.getFrequency();
        const md = await radio.getMode();
        const ct = await radio.getToneMode(0);
        const cn = await radio.getCtcss(0);
        const ds = await radio.getDcs(0);
        console.log(`FA=${fa}, MD=${md}, CT=${ct}, CN=${cn}, DS=${ds}`);
        console.log('');

        // Test 2: Store a memory with Tone (no CTCSS frequency)
        console.log('=== Test 2: Write Memory with Tone ===');
        const testChannel = 50;
        const testFreq = 145675000; // 145.675 MHz

        console.log(`Writing memory ${testChannel}: ${testFreq} Hz, Tone mode`);
        await radio.setToneMode(0, 1); // Tone
        await radio.setCtcss(0, 10);   // Index 10 = 94.8 Hz
        await radio.mw(testChannel, testFreq, '-', 0, '4', '1', '2'); // Tone, minus shift
        await radio._delay(100);

        console.log('');

        // Test 3: Read back via MR
        console.log('=== Test 3: Read back via MR ===');
        const mr = await radio.mr(testChannel);
        console.log(`MR response: ${mr}`);
        if (mr) {
            const data = mr.substring(7);
            console.log(`  Tone mode at data[18]: ${data.charAt(18)}`);
            console.log(`  Shift at data[21]: ${data.charAt(21)}`);
        }
        console.log('');

        // Test 4: Load via MA and read CT/CN
        console.log('=== Test 4: Load via MA, read CT/CN ===');
        await radio.ma(testChannel);
        await radio._delay(100);
        const ctAfterMa = await radio.getToneMode(0);
        const cnAfterMa = await radio.getCtcss(0);
        console.log(`CT after MA: ${ctAfterMa}`);
        console.log(`CN after MA: ${cnAfterMa}`);
        console.log('');

        // Test 5: Load via MC and read CT/CN
        console.log('=== Test 5: Load via MC, read CT/CN ===');
        await radio.mc(testChannel);
        await radio._delay(100);
        await radio.ma(testChannel);
        await radio._delay(100);
        const ctAfterMc = await radio.getToneMode(0);
        const cnAfterMc = await radio.getCtcss(0);
        console.log(`CT after MC+MA: ${ctAfterMc}`);
        console.log(`CN after MC+MA: ${cnAfterMc}`);
        console.log('');

        // Test 6: Try different sequences
        console.log('=== Test 6: Sequence Tests ===');
        const sequences = [
            { name: 'CT+CN before MW', ctFirst: true, cnBefore: true },
            { name: 'CT+CN after MW', ctFirst: true, cnBefore: false },
            { name: 'CN+CT before MW', ctFirst: false, cnBefore: true },
            { name: 'CN+CT after MW', ctFirst: false, cnBefore: false },
        ];

        for (const seq of sequences) {
            console.log(`--- Sequence: ${seq.name} ---`);

            // Clear the memory first (write empty)
            await radio.mw(testChannel + 1, testFreq, '-', 0, '4', '0', '2');
            await radio._delay(50);

            if (seq.ctFirst) {
                await radio.setToneMode(0, 1); // Tone
                await radio._delay(20);
                if (seq.cnBefore) {
                    await radio.setCtcss(0, 10); // 94.8 Hz
                    await radio._delay(20);
                }
            } else {
                await radio.setCtcss(0, 10); // 94.8 Hz
                await radio._delay(20);
                if (seq.cnBefore) {
                    await radio.setToneMode(0, 1); // Tone
                    await radio._delay(20);
                }
            }

            await radio.mw(testChannel + 1, testFreq, '-', 0, '4', '1', '2');

            if (!seq.cnBefore) {
                await radio._delay(20);
                await radio.setCtcss(0, 10); // 94.8 Hz
            }

            await radio._delay(100);

            // Read back via MA
            await radio.ma(testChannel + 1);
            await radio._delay(100);
            const ctSeq = await radio.getToneMode(0);
            const cnSeq = await radio.getCtcss(0);
            console.log(`  CT=${ctSeq}, CN=${cnSeq}`);

            // Also check MR
            const mrSeq = await radio.mr(testChannel + 1);
            if (mrSeq) {
                const data = mrSeq.substring(7);
                console.log(`  MR tone mode: ${data.charAt(18)}`);
            }
            console.log('');
        }

        // Test 7: Try writing CN twice (before and after MW)
        console.log('=== Test 7: CN before AND after MW ===');
        const testCh = 60;
        await radio.setCtcss(0, 10); // 94.8 Hz
        await radio._delay(20);
        await radio.mw(testCh, testFreq, '-', 0, '4', '1', '2');
        await radio._delay(20);
        await radio.setCtcss(0, 10); // 94.8 Hz again
        await radio._delay(100);
        await radio.ma(testCh);
        await radio._delay(100);
        const ct7 = await radio.getToneMode(0);
        const cn7 = await radio.getCtcss(0);
        console.log(`CT=${ct7}, CN=${cn7}`);
        console.log('');

        console.log('===========================================');
        console.log('Tests completed!');
        console.log('===========================================');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await serial.close();
        console.log('Serial connection closed.');
    }
}

// Run tests
runTests();
