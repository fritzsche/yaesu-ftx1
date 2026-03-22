/**
 * ftx1-test9.js - Test MW storage with VFO/Memory mode (Corrected)
 *
 * Based on Hamlib FTX-1 source:
 * - VM000; sets VFO mode
 * - SV; toggles to Memory mode
 * - MC uses 6-digit format: MC000005 for memory 5
 * - MW stores current VFO settings - set CN BEFORE MW!
 *
 * CAT Command List:
 * ========================================
 */

const COMMANDS = [];

// Helper to add command
function cmd(c, desc = '') {
    COMMANDS.push({ cmd: c, desc });
}

// Step 1: Query current mode
cmd('VM0;', 'Query current mode (VM0=00=VFO, 01=Memory)');

// Step 2: Set to VFO mode (required for MW)
cmd('VM000;', 'Set MAIN side to VFO mode');

// Step 3: Set frequency (VFO)
cmd('FA145500000;', 'Set VFO frequency to 145.500 MHz');

// Step 4: Set Tone mode (CT01 = Tone per CT codes)
cmd('CT01;', 'Set Tone mode (ENC only, not ENC/DEC)');

// Step 5: Set CTCSS frequency to 100.0 Hz (index 12)
// IMPORTANT: CN must be set BEFORE MW - MW stores current VFO state!
cmd('CN00012;', 'Set CTCSS to 100.0 Hz (index 12)');

// Step 6: Verify tone settings before MW
cmd('CT0;', 'Query Tone mode (should be CT01)');
cmd('CN00;', 'Query CTCSS frequency (should be CN00012)');

// Step 7: Write to memory 5 (MW)
// MW: MW + 5-digit channel + 9-digit freq + 5-char clarifier + RX + TX + Mode + VFO/Mem + CTCSS + 00 + Shift
// CTCSS P8=2 means ENC (Tone), same as CT01
cmd('MW00005145500000-000000412002;', 'MW to Memory 5 (squelch=2=Tone/ENC)');

// Step 8: Query mode after MW
cmd('VM0;', 'Query mode after MW (should still be VFO)');

// Step 9: Switch to Memory mode using VM;
cmd('VM;', 'Switch to Memory mode (from VFO mode)');

// Step 10: Select memory 5 via MC (6-digit format!)
cmd('MC000005;', 'Select Memory 5 in VFO buffer (6-digit!)');

// Step 11: Load memory to VFO via MA
cmd('MA;', 'Load selected memory to VFO');

// Step 12: Verify loaded settings
cmd('FA;', 'Query VFO frequency (should be 145500000)');
cmd('CT0;', 'Query Tone mode after MA (should be CT01)');
cmd('CN00;', 'Query CTCSS frequency after MA (should be CN00012)');

// Step 13: Also read MR to see stored data
cmd('MR00005;', 'Read Memory 5 via MR');

// Print all commands
console.log('========================================');
console.log('FTX-1 MW Storage Test - CAT Command List');
console.log('========================================\n');

console.log('Steps to execute manually in terminal:');
console.log('========================================\n');

COMMANDS.forEach((c, i) => {
    console.log(`${String(i + 1).padStart(2, '0')}. ${c.cmd} [${c.desc}]`);
});

console.log('\n========================================');
console.log('Expected behavior:');
console.log('========================================');
console.log('After MW (with CN00012 + CT01 + MW):');
console.log('  - MW stores current VFO CTCSS mode (2=ENC) and frequency');
console.log('');
console.log('After VM; (Memory) + MC + MA:');
console.log('  - FA should show 145500000');
console.log('  - CT should show CT01 (Tone/ENC)');
console.log('  - CN should show CN00012 (100.0 Hz)');
console.log('');
console.log('MR00005 position 26 should be 2 (ENC/Tone)');
console.log('========================================\n');

// If running with serial, execute the commands
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
                    console.log(`<<< TIMEOUT`);
                }
                await delay(100);
            }

        } catch (err) {
            console.error('Error:', err.message);
        } finally {
            await serial.close();
        }
    }

    run();
}
