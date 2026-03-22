const { SerialPort } = require('serialport');

// Configuration - Use your 'Enhanced COM Port'
const portPath = '/dev/cu.usbserial-01A9994B0'; 
const baudRate = 38400; // Default FTX-1 CAT-1 rate

const port = new SerialPort({ path: portPath, baudRate });

// Helper to send commands with the required ';' terminator
const sendCommand = (cmd) => {
    return new Promise((resolve) => {
        console.log(`Sending: ${cmd};`);
        port.write(`${cmd};`, () => {
            setTimeout(resolve, 200); // Wait for radio processing
        });
    });
};

async function testMemorySquelch() {
    try {
        console.log("--- Starting Memory Squelch Test ---");

        // 1. Switch MAIN-side to Memory Mode
        await sendCommand("VM011"); // P1=0(MAIN), P2=11(Memory)

        // 2. Select Memory Channel 1
        await sendCommand("MC0001"); // P1=0(MAIN), P2=001(Ch 1)

        // 3. Test CTCSS Tone Squelch
        console.log("Setting CTCSS 100.0Hz (Index 12)...");
        await sendCommand("CN00012"); // CN: Tone Index 12
        await sendCommand("CT02");    // CT: 2 = CTCSS ENC/DEC

        await new Promise(r => setTimeout(r, 2000));

        // 4. Test DCS Squelch
        console.log("Setting DCS Code 023...");
        await sendCommand("CN00023"); // CN: DCS Index for 023
        await sendCommand("CT03");    // CT: 3 = DCS ON

        await new Promise(r => setTimeout(r, 2000));

        // 5. Reset to OFF and return to VFO
        console.log("Cleaning up...");
        await sendCommand("CT00");    // CT: 0 = OFF
        await sendCommand("VM000");   // VM: P2=00(VFO)

        console.log("Test Complete.");
        process.exit();
    } catch (err) {
        console.error("Error:", err.message);
    }
}

port.on('open', testMemorySquelch);