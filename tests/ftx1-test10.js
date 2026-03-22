/**
 * ftx1-test10.js - Test AM; (Store VFO-A to Memory)
 *
 * AM; and BM; are SET-ONLY commands - they store current VFO state to memory
 * Unlike MW which takes parameters, AM/BM use the ACTUAL VFO settings!
 *
 * Test sequence:
 * 1. VM000; - Set VFO mode
 * 2. FA145500000; - Set frequency
 * 3. CT01; - Set Tone mode
 * 4. CN00012; - Set CTCSS 100.0 Hz
 * 5. MC000005; - Select memory channel (6-digit format!)
 * 6. AM; - Store VFO-A to Memory (stores ACTUAL VFO state!)
 * 7. VM; - Switch to Memory mode
 * 8. MA; - Load memory to VFO
 * 9. Check CT/CN - did it store 100.0 Hz?
 * 10. MR00005; - Read stored data
 */

const COMMANDS = [];

// Helper to add command
function cmd(c, desc = '') {
    COMMANDS.push({ cmd: c, desc });
}

// Step 1: Set to VFO mode
cmd('VM000;', 'Set VFO mode');

// Step 2: Set frequency
cmd('FA145500000;', 'Set frequency to 145.500 MHz');

// Step 3: Set Tone mode (CT01 = ENC/Tone)
cmd('CT01;', 'Set Tone mode');

// Step 4: Set CTCSS frequency to 100.0 Hz (index 12)
cmd('CN00012;', 'Set CTCSS to 100.0 Hz');

// Step 5: Verify settings
cmd('CT0;', 'Verify Tone mode');
cmd('CN00;', 'Verify CTCSS frequency');

// Step 6: Select memory channel (6-digit format for MC)
cmd('MC000005;', 'Select Memory 5');

// Step 7: Store VFO-A to Memory using AM;
// This stores the ACTUAL VFO state including CTCSS frequency!
cmd('AM;', 'Store VFO-A to Memory (stores current CT/CN!)');

// Step 8: Switch to Memory mode
cmd('VM;', 'Switch to Memory mode');

// Step 9: Load memory to VFO
cmd('MA;', 'Load memory to VFO');

// Step 10: Check loaded settings - do we get 100.0 Hz back?
cmd('FA;', 'Query frequency');
cmd('CT0;', 'Query Tone mode');
cmd('CN00;', 'Query CTCSS frequency (should be 00012=100Hz!)');

// Step 11: Read via MR
cmd('MR00005;', 'Read Memory 5');

// Print all commands
console.log('========================================');
console.log('FTX-1 AM; Store VFO-A to Memory Test');
console.log('========================================\n');

console.log('CAT Commands to execute manually:\n');

COMMANDS.forEach((c, i) => {
    console.log(`${String(i + 1).padStart(2, '0')}. ${c.cmd} [${c.desc}]`);
});

console.log('\n========================================');
console.log('Key insight:');
console.log('========================================');
console.log('AM; should store CURRENT VFO state (CT01 + CN00012)');
console.log('Unlike MW which has explicit parameters, AM uses actual values!');
console.log('If this works, CN should show CN00012 (100.0 Hz) after MA');
console.log('========================================\n');

// If running with serial
if (process.argv[2] === '--run') {
    const { NodeSerial } = await import('./SerialInterface.js');

    const SERIAL_PORT = '/dev/cu.usbserial-01A9994B0';

    async function run() {
        console.log('Running commands via serial...\n');
        const serial = new NodeSerial(SERIAL_PORT);

        try {
            await serial.connect();

            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            for (const c of COMMANDS) {
                console.log(`>>> ${c.cmd} [${c.desc}]`);
                await serial.send(c.cmd);
                try {
                    const resp = await serial.readUntil(';');
                    console.log(`<<< ${resp}`);
                } catch (e) {
                    console.log(`<<< (no response - set command)`);
                }
                await delay(150);
            }

        } catch (err) {
            console.error('Error:', err.message);
        } finally {
            await serial.close();
        }
    }

    run();
}
