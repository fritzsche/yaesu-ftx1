/**
 * ftx1-test11.js - Test AM; storage with CTCSS Tones and DCS codes
 *
 * IMPORTANT: MC only works on EXISTING channels!
 * Sequence:
 * 1. MW; - Create memory channel (with wrong/incomplete tone data)
 * 2. Set correct CT/CN values
 * 3. AM; - Update memory with CORRECT tone data from VFO
 */

const COMMANDS = [];

function cmd(c, desc = '') {
    COMMANDS.push({ cmd: c, desc });
}

function addStation(num, freq, mode, toneType, ctcssIdx, dcsCode) {
    console.log(`\n=== Station ${num}: ${freq} MHz ${toneType} ===`);

    // Set VFO mode
    cmd('VM000;', `Set VFO mode for Station ${num}`);

    // Set frequency
    const freqHz = Math.round(parseFloat(freq) * 1000000).toString().padStart(9, '0');
    cmd(`FA${freqHz};`, `Set ${freq} MHz`);

    // Step 1: First create memory channel with MW
    // MW uses 5-digit channel, MC uses 6-digit (MCGGNNNN), MR uses 5-digit
    const mwCh = String(num).padStart(5, '0');    // 5-digit for MW: 00011
    const mcCh = String(num).padStart(6, '0');    // 6-digit for MC: 000011
    const shortCh = String(num).padStart(5, '0'); // 5-digit for MR: 00011

    // MW format: MW + 5-digit channel + 9-digit freq + dir + offset(4) + RX + TX + mode + vfo_mem + ctcss + 00 + shift
    // Example from user: MW00013145500000-000000412000; (channel 13, Tone, idx 12)
    // For channel 11, Tone idx 12: MW00011145500000-000000412000;
    // Using 2 for CTCSS (ENC/Tone) since AM will fix it anyway
    cmd(`MW${mwCh}${freqHz}-000000412000;`, `MW to create Memory ${num}`);

    // Step 2: Set the CORRECT tone/DCS settings
    if (toneType === 'Tone') {
        cmd('CT01;', 'Set Tone mode (ENC)');
        cmd(`CN000${ctcssIdx};`, `Set CTCSS idx ${ctcssIdx}`);
    } else if (toneType === 'TSQL') {
        cmd('CT02;', 'Set TSQL mode (ENC/DEC)');
        cmd(`CN000${ctcssIdx};`, `Set CTCSS idx ${ctcssIdx}`);
    } else if (toneType === 'DCS') {
        cmd('CT03;', 'Set DCS mode');
        cmd(`CN01${dcsCode};`, `Set DCS code ${dcsCode}`);
    }

    // Step 3: Select the newly created memory channel (6-digit: MCGGNNNN)
    cmd(`MC${mcCh};`, `Select Memory ${num}`);

    // Step 4: AM; stores CURRENT VFO state (with CORRECT tone!)
    cmd('AM;', `AM - Store correct tone to Memory ${num}`);

    // Verify what was stored
    cmd('CT0;', 'Verify mode');
    cmd('CN00;', 'Verify CTCSS/DCS');
    cmd('CN01;', 'Verify DCS code');
    cmd(`MR${shortCh};`, `MR - Read Memory ${num}`);

    console.log(`Station ${num}: ${freq} MHz ${toneType} programmed`);
}

// Station definitions
const stations = [
    { num: 11, freq: '145.500', toneType: 'Tone', ctcssIdx: '12', dcsCode: '023' },  // Tone 100.0 Hz
    { num: 12, freq: '145.550', toneType: 'TSQL', ctcssIdx: '08', dcsCode: '023' }, // TSQL 88.5 Hz
    { num: 13, freq: '145.600', toneType: 'Tone', ctcssIdx: '10', dcsCode: '023' },  // Tone 94.8 Hz
    { num: 14, freq: '439.125', toneType: 'DCS', ctcssIdx: '08', dcsCode: '023' },   // DCS 023
    { num: 15, freq: '439.250', toneType: 'DCS', ctcssIdx: '08', dcsCode: '071' },   // DCS 071
];

// Add all stations
stations.forEach(s => {
    addStation(s.num, s.freq, 'FM', s.toneType, s.ctcssIdx, s.dcsCode);
});

// Add verification steps
cmd('', '');
cmd('VM;', 'Switch to Memory mode for verification');

stations.forEach(s => {
    const ch = String(s.num).padStart(6, '0');
    const shortCh = String(s.num).padStart(5, '0');

    cmd(`MC${ch};`, `Select Memory ${s.num}`);
    cmd('MA;', `Load Memory ${s.num}`);

    cmd('FA;', `Freq (expected ${s.freq})`);
    cmd('CT0;', `Mode (expected ${s.toneType})`);
    cmd('CN00;', `CTCSS/DCS code`);
    cmd('CN01;', `DCS code check`);
    cmd(`MR${shortCh};`, `MR for Memory ${s.num}`);
});

// Print all commands
console.log('========================================');
console.log('FTX-1 AM; Store Test - 5 Stations');
console.log('========================================\n');

console.log('Stations to program:');
console.log('--------------------');
stations.forEach(s => {
    let toneDesc = '';
    if (s.toneType === 'Tone') {
        toneDesc = `Tone idx ${s.ctcssIdx}`;
    } else if (s.toneType === 'TSQL') {
        toneDesc = `TSQL idx ${s.ctcssIdx}`;
    } else {
        toneDesc = `DCS ${s.dcsCode}`;
    }
    console.log(`  Memory ${s.num}: ${s.freq} MHz ${toneDesc}`);
});

console.log('\nCAT Commands:\n');

COMMANDS.forEach((c, i) => {
    if (c.cmd === '') {
        console.log('');
    } else {
        console.log(`${String(i + 1).padStart(3, '0')}. ${c.cmd} [${c.desc}]`);
    }
});

console.log('\n========================================');
console.log('Correct sequence:');
console.log('========================================');
console.log('1. MW - Create channel (with wrong tone)');
console.log('2. Set correct CT/CN');
console.log('3. MC - Select channel');
console.log('4. AM - Store CORRECT VFO state');
console.log('========================================\n');

// If running with serial
if (process.argv[2] === '--run') {
    const { NodeSerial } = await import('./SerialInterface.js');

    const SERIAL_PORT = '/dev/cu.usbserial-01A9994B0';

    async function run() {
        console.log('\nRunning via serial...\n');
        const serial = new NodeSerial(SERIAL_PORT);

        try {
            await serial.connect();

            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            for (const c of COMMANDS) {
                if (c.cmd === '') {
                    console.log('---');
                    continue;
                }
                console.log(`>>> ${c.cmd} [${c.desc}]`);
                await serial.send(c.cmd);
                try {
                    const resp = await serial.readUntil(';');
                    console.log(`<<< ${resp}`);
                } catch (e) {
                    console.log(`<<< (no response)`);
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
