/**
 * ftx1-test8.js - Test if MW stores current CTCSS tone frequency
 *
 * Test sequence:
 * 1. Set VFO to Tone + 94.8 Hz (CN index 10)
 * 2. Write MW to memory 8 (which already exists with Tone)
 * 3. Change VFO CTCSS to 88.5 Hz (CN index 8)
 * 4. MC8 + MA to load memory
 * 5. Read CT/CN - does CN show 00010 or 00008?
 */

import { NodeSerial } from '../js/SerialInterface.js';

const SERIAL_PORT = '/dev/cu.usbserial-01A9994B0';

async function run() {
    console.log('===========================================');
    console.log('FTX-1 MW CTCSS Tone Frequency Test');
    console.log('===========================================\n');

    const serial = new NodeSerial(SERIAL_PORT);

    try {
        await serial.connect();
        console.log('Connected!\n');

        const cmd = async (command, expectResponse = true) => {
            console.log(`>>> ${command};`);
            await serial.send(`${command};`);
            if (expectResponse) {
                try {
                    const response = await serial.readUntil(';');
                    console.log(`<<< ${response}`);
                    return response;
                } catch (err) {
                    console.log(`<<< TIMEOUT`);
                    return null;
                }
            }
            return null;
        };

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Step 1: Read current MR for memory 8
        console.log('=== Step 0: Read current MR00008 ===');
        const mr0 = await cmd('MR00008');
        console.log(`Current MR: ${mr0}`);
        console.log('');

        // Step 1: Set VFO to Tone mode with 94.8 Hz
        console.log('=== Step 1: Set VFO to Tone + 94.8 Hz (CN index 10) ===');
        await cmd('CT01', false);  // Tone mode
        await delay(50);
        await cmd('CN00010', false);  // 94.8 Hz (index 10)
        await delay(50);

        const ct1 = await cmd('CT0');
        const cn1 = await cmd('CN00');
        console.log(`VFO state: ${ct1}, ${cn1}`);
        console.log('Expected: CT01 (Tone), CN00010 (94.8 Hz)\n');

        // Step 2: Write MW to memory 8 with full format
        // MW: MW + ccccc + freq(9) + X + offs(4) + RX + TX + M + C + T + ff + S
        // MW00008145675000-000000412002
        console.log('=== Step 2: Write MW00008145675000-000000412002 to Memory 8 ===');
        await cmd('MW00008145675000-000000412002', false);
        await delay(100);

        // Step 3: Change VFO CTCSS to different frequency
        console.log('=== Step 3: Change VFO to Tone + 88.5 Hz (CN index 8) ===');
        await cmd('CT01', false);  // Tone mode
        await delay(50);
        await cmd('CN00008', false);  // 88.5 Hz (index 8)
        await delay(50);

        const ct3 = await cmd('CT0');
        const cn3 = await cmd('CN00');
        console.log(`VFO changed to: ${ct3}, ${cn3}`);
        console.log('Expected: CT01 (Tone), CN00008 (88.5 Hz)\n');

        // Step 4: MC8 + MA to load memory
        console.log('=== Step 4: MC8 + MA ===');
        await cmd('MC00008', false);
        await delay(50);
        await cmd('MA', false);
        await delay(100);

        // Step 5: Read back CT/CN
        console.log('=== Step 5: Read back CT/CN after MA ===');
        const ct5 = await cmd('CT0');
        const cn5 = await cmd('CN00');
        console.log(`After MC+MA: ${ct5}, ${cn5}`);

        // Step 6: Read MR to see what was stored
        console.log('\n=== Step 6: MR00008 (read stored data) ===');
        const mr6 = await cmd('MR00008');
        if (mr6 && mr6 !== '?') {
            console.log(`MR full: ${mr6}`);
            console.log(`MR length: ${mr6.length}`);
            const data = mr6.substring(7);
            console.log(`MR[18] (tone mode per doc): ${data.charAt(18)}`);
            console.log(`MR[25] (squelch type in MW): ${data.charAt(25)}`);
        }

        console.log('\n===========================================');
        console.log('RESULT:');
        console.log(`After MW (with 94.8 Hz) + change (88.5 Hz) + MC+MA:`);
        console.log(`  CT=${ct5}, CN=${cn5}`);
        console.log('');
        console.log(`If CN shows CN00010 (94.8 Hz): MW DOES store CTCSS frequency`);
        console.log(`If CN shows CN00008 (88.5 Hz): MW does NOT store CTCSS frequency`);
        console.log('===========================================');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await serial.close();
    }
}

run();
