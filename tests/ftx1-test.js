const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline')

// CONFIGURATION: Update 'path' to your radio's COM port (e.g., 'COM3' or '/dev/ttyUSB0')
const PORT_PATH = '/dev/cu.usbserial-01A9994B0'
const BAUD_RATE = 38400
const TEST_MEMORY = '001' // 3-digit padded string

const port = new SerialPort({
    path: PORT_PATH,
    baudRate: BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
})

// Yaesu ASCII protocol uses ';' as the delimiter
const parser = port.pipe(new ReadlineParser({ delimiter: ';' }))

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Sends a CAT command and waits for the response
 */
function query(cmd) {
    return new Promise((resolve) => {
        console.log(`[TX] -> ${cmd};`)

        // Setup one-time listener for the response
        parser.once('data', (data) => {
            console.log(`[RX] <- ${data};`)
            resolve(data)
        })

        port.write(`${cmd};`, (err) => {
            if (err) console.error('Write Error: ', err.message)
        })
    })
}

/**
 * Sends a command where no response is expected
 */
async function sendOnly(cmd) {
    console.log(`[TX] -> ${cmd}; (No Response Expected)`)
    port.write(`${cmd};`)
    await sleep(200) // Wait for radio processing
}

async function runDiagnostics() {
    console.log(`--- Starting FTX-1 Diagnostic for Memory ${TEST_MEMORY} ---`)

    try {
        // 1. SNAPSHOT CURRENT STATE (VFO-A)
        console.log("\n1. Snapping current VFO-A state...")
        const originalFreq = await query('FA')
        const originalMode = await query('MD0')
        const originalSq = await query('SQ0')

        // 2. READ MEMORY VIA SWAP
        console.log(`\n2. Loading Memory ${TEST_MEMORY} into active buffer...`)
        await sendOnly(`MC${TEST_MEMORY}`)

        console.log("Reading active buffer details (Hidden Tone Data):")
        const rawMR = await query(`MR${TEST_MEMORY}`) // Let's see what MR actually says
        const currentSq = await query('SQ0')         // Squelch Type
        const currentCtcss = await query('CN0')      // CTCSS Tone index
        const currentDcs = await query('DI0')        // DCS Code

        // 3. TEST WRITE (Setting DCS Code 023)
        console.log(`\n3. Testing Write: Setting DCS 023 to Memory ${TEST_MEMORY}...`)
        await sendOnly('SQ03')   // Set Squelch to DCS
        await sendOnly('DI0023') // Set DCS to 023
        await sendOnly(`MW${TEST_MEMORY}`) // Save active state to memory
        console.log("Write command sent.")

        // 4. VERIFY WRITE
        console.log("\n4. Verifying Write (Clearing buffer then reloading)...")
        await sendOnly('SQ00')   // Turn squelch off in VFO
        await sendOnly(`MC${TEST_MEMORY}`) // Reload memory
        const verifyDcs = await query('DI0')
        const verifySq = await query('SQ0')

        if (verifyDcs.includes('023') && verifySq.includes('3')) {
            console.log("SUCCESS: DCS 023 was successfully stored and read back!")
        } else {
            console.log("FAILED: Readback did not match written values.")
        }

        // 5. RESTORE
        console.log("\n5. Restoring original radio state...")
        // Strip the command prefix if necessary, or send the whole string back
        await sendOnly(originalFreq)
        await sendOnly(originalMode)
        await sendOnly(originalSq)

        console.log("\n--- Diagnostics Complete ---")
        process.exit(0)

    } catch (err) {
        console.error("Diagnostic failed:", err)
        process.exit(1)
    }
}


async function runDiagnosticsPhase2() {
    console.log(`--- FTX-1 Phase 2: SDR-Platform Commands ---`);

    try {
        // 1. Identify the Radio
        await query('ID'); // Should return ID0682 or similar

        // 2. Check Tone Mode (The 'TN' command)
        console.log("\nChecking Tone Mode commands...");
        await query('TN0'); // Read current Tone Mode
        
        // 3. Check DCS/CTCSS specifically
        await query('CN00'); // Read CTCSS Tone (try 2-digit)
        await query('DS0');  // Read DCS Code
        
        // 4. Test Memory Mode Access
        console.log("\nTesting Memory Mode access...");
        await sendOnly('VMSP1'); // Switch to Memory Mode
        await sleep(500);
        await query('MR001');   // Try reading memory again while in MEM mode
        
        // 5. THE BIG TEST: Write DCS using 'TN' and 'DS'
        console.log("\nAttempting 'Modern' DCS Write...");
        await sendOnly('VMSP0'); // Back to VFO
        await sendOnly('TN03');  // Set Tone Mode to DCS (3)
        await sendOnly('DS000'); // Set DCS to 023 (index 000 or literal 023)
        
        const verifyTN = await query('TN0');
        const verifyDS = await query('DS0');

        if (verifyTN.includes('3')) {
            console.log("SUCCESS: 'TN' is the correct command for Tone Mode!");
        }

        // 6. Restore to VFO and original Squelch
        await sendOnly('VMSP0'); 
        console.log("\n--- Phase 2 Complete ---");
        process.exit(0);

    } catch (err) {
        console.error("Phase 2 failed:", err);
        process.exit(1);
    }
}

async function runDiagnosticsPhase3() {
    console.log(`--- FTX-1 Phase 3: The 'CN' and 'CT' Trial ---`);

    try {
        // 1. Test Tone Mode (CT)
        console.log("\n1. Testing Mode (CT)...");
        await query('CT0'); // Should return CT0 + mode digit

        // 2. Test DCS specifically (CN01)
        console.log("\n2. Testing DCS (CN01)...");
        await query('CN01'); // Should return CN01 + 3-digit code

        // 3. The Write/Read Cycle
        console.log("\n3. Testing Write to VFO then Readback...");
        await sendOnly('CT04');   // Set Mode to DCS (usually 4 on this rig)
        await sendOnly('CN01023'); // Set DCS to 023
        
        const mode = await query('CT0');
        const code = await query('CN01');

        if (mode.includes('4') && code.includes('023')) {
            console.log("SUCCESS: Mode is CT, DCS is CN01!");
        }

        // 4. Memory Read Mystery (The 5-digit theory)
        console.log("\n4. Testing 5-digit Memory Read...");
        await query('MR00001'); // Some newer rigs require 5 digits for MR

        process.exit(0);
    } catch (err) {
        console.error("Phase 3 failed:", err);
        process.exit(1);
    }
}

port.on('open', () => {
    console.log(`Serial Port Open: ${PORT_PATH} @ ${BAUD_RATE}`)
    // Wait a moment for the connection to stabilize
    setTimeout(runDiagnosticsPhase3, 1000)
})