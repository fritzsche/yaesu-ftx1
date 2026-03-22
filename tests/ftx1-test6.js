/**
 * ftx1-test6.js - Test MW persistence of tone settings
 *
 * Test sequence:
 * 1. MR00003 - Read memory 3
 * 2. CT01 - Set Tone mode
 * 3. CN00010 - Set CTCSS 94.8 Hz
 * 4. MW00003... - Write memory with MW
 * 5. CT02 - Change to TSQL
 * 6. MC00003 - Select memory 3
 * 7. MA - Load to VFO
 * 8. CT0, CN00 - Read back tone settings
 */

import { NodeSerial } from '../js/SerialInterface.js';

const SERIAL_PORT = '/dev/cu.usbserial-01A9994B0';

async function run() {
    console.log('===========================================');
    console.log('FTX-1 MW Tone Persistence Test');
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

        // Step 1: Read memory 00003
        console.log('=== Step 1: Read memory 00003 ===');
        const mr = await cmd('MR00003');
        if (mr) {
            const data = mr.substring(7);
            console.log(`MR[18] (tone): ${data.charAt(18)}`);
        }
        console.log('');

        // Step 2: Set Tone mode (CT01)
        console.log('=== Step 2: Set CT01 (Tone) ===');
        await cmd('CT01', false);
        await delay(50);

        // Step 3: Set CTCSS 94.8 Hz (CN00010)
        console.log('=== Step 3: Set CN00010 (94.8 Hz) ===');
        await cmd('CN00010', false);
        await delay(50);

        // Step 4: Write memory with MW
        // MW format: MWccccc[fffffffff][X][ffff][RX][TX][M][C][T][ff][S]
        // For memory 00003, 145.675 MHz, Tone, minus shift
        console.log('=== Step 4: Write MW00003145675000-000000410002 ===');
        await cmd('MW00003145675000-000000410002', false);
        await delay(100);

        // Step 5: Change tone to TSQL (CT02)
        console.log('=== Step 5: Change to CT02 (TSQL) ===');
        await cmd('CT02', false);
        await delay(50);

        // Step 5b: Also change CN to something different
        console.log('=== Step 5b: Change CN00008 (88.5 Hz) ===');
        await cmd('CN00008', false);
        await delay(50);

        // Step 6: Select memory 00003 with MC
        console.log('=== Step 6: MC00003 (select memory) ===');
        await cmd('MC00003', false);
        await delay(50);

        // Step 7: MA to load to VFO
        console.log('=== Step 7: MA (load to VFO) ===');
        await cmd('MA', false);
        await delay(100);

        // Step 8: Read back tone settings
        console.log('=== Step 8: Read back tone settings ===');
        const ct = await cmd('CT0');
        const cn = await cmd('CN00');
        console.log('');

        // Compare
        console.log('=== Result ===');
        console.log(`After MW+change+MC+MA:`);
        console.log(`  CT response: ${ct}`);
        console.log(`  CN response: ${cn}`);
        console.log('');
        console.log(`Expected: CT should be 01 (Tone), CN should be 00010 (94.8 Hz)`);
        console.log(`          if MW correctly persisted the tone settings`);
        console.log('');

        // Also verify by reading memory again
        console.log('=== Verify: Read memory 00003 again ===');
        const mr2 = await cmd('MR00003');
        if (mr2) {
            const data = mr2.substring(7);
            console.log(`MR[18] (tone): ${data.charAt(18)}`);
        }

        console.log('===========================================');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await serial.close();
    }
}

run();
