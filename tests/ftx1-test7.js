/**
 * ftx1-test7.js - Simple MW squelch type test
 *
 * Test sequence:
 * 1. Set CT02 (TSQL) on VFO
 * 2. Set CN00008 (88.5 Hz) on VFO
 * 3. Write MW with squelch type=2 (Tone) for memory 60
 * 4. Read back memory 60 via MR
 * 5. Read CT/CN after MC+MA
 */

import { NodeSerial } from '../js/SerialInterface.js';

const SERIAL_PORT = '/dev/cu.usbserial-01A9994B0';

async function run() {
    console.log('===========================================');
    console.log('FTX-1 MW Squelch Type Test');
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

        // First, clear VFO state
        console.log('=== Clear VFO state ===');
        await cmd('FA000000000', false);
        await cmd('CT00', false);
        await delay(100);

        // Step 1: Set VFO to TSQL with 88.5 Hz
        console.log('\n=== Step 1: Set VFO to TSQL 88.5 Hz ===');
        await cmd('CT02', false);  // TSQL
        await delay(50);
        await cmd('CN00008', false);  // 88.5 Hz
        await delay(50);

        // Verify VFO settings
        const ct1 = await cmd('CT0');
        const cn1 = await cmd('CN00');
        console.log(`VFO before MW: CT=${ct1}, CN=${cn1}`);

        // Step 2: Write memory 60 with squelch type=2 (Tone) via MW
        // MW: MW + 00060 + 145675000 + - + 0000 + 0 + 0 + 4 + 1 + 2 + 00 + 2
        // MW000060145675000-000000412002;
        console.log('\n=== Step 2: Write MW000060145675000-000000412002 (squelch=2=Tone) ===');
        await cmd('MW000060145675000-000000412002', false);
        await delay(100);

        // Step 3: Read back memory 60 via MR
        console.log('\n=== Step 3: Read back MR00060 ===');
        const mr = await cmd('MR00060');
        if (mr) {
            const data = mr.substring(7);
            console.log(`MR[18] (squelch type in MW): ${data.charAt(18)}`);
            console.log(`Expected: 2 (Tone)`);
        }

        // Step 4: Now change VFO to different settings
        console.log('\n=== Step 4: Change VFO to different settings ===');
        await cmd('CT01', false);  // Tone
        await delay(50);
        await cmd('CN00010', false);  // 94.8 Hz
        await delay(50);

        const ct4 = await cmd('CT0');
        const cn4 = await cmd('CN00');
        console.log(`VFO changed to: CT=${ct4}, CN=${cn4}`);

        // Step 5: Select memory 60 and load
        console.log('\n=== Step 5: MC60 + MA ===');
        await cmd('MC00060', false);
        await delay(50);
        await cmd('MA', false);
        await delay(100);

        // Step 6: Read CT/CN after MA
        console.log('\n=== Step 6: Read back after MA ===');
        const ct6 = await cmd('CT0');
        const cn6 = await cmd('CN00');
        console.log(`After MC+MA: CT=${ct6}, CN=${cn6}`);
        console.log(`Expected: CT=??, CN=?? (depends on if MA loads tone settings)`);

        // Compare with MR reading
        console.log('\n=== Result ===');
        console.log(`MR[18] (stored squelch): ${mr ? mr.substring(7).charAt(18) : 'N/A'}`);
        console.log(`CT after MA: ${ct6 ? ct6.charAt(3) : 'N/A'}`);

        console.log('\n===========================================');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await serial.close();
    }
}

run();
