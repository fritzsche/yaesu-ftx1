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