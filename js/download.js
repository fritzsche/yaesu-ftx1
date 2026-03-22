/**
 * download.js - FTX-1 Memory Download/Upload/Verify Program
 * 
 * Features:
 * - Upload repeaters from CSV file to radio
 * - Download memory channels from radio
 * - Compare uploaded vs downloaded data
 * - Export to CHIRP CSV format
 * - Verification mode to check MR vs MC+FA results
 */

import { NodeSerial } from './SerialInterface.js';
import { Ftx1CatProcessor } from './Ftx1CatProcessor.js';
import { CTCSS_TONES } from './constants.js';
import { readFileSync, writeFileSync } from 'fs';

// Configuration
const SERIAL_PORT = '/dev/cu.usbserial-01A9994B0';
const INPUT_CSV = './chrip_example.csv';
const OUTPUT_CSV = './chirp_downloaded.csv';

// Parse CHIRP CSV file
function parseChirpCsv(csvPath) {
    try {
        const csvContent = readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(l => l.trim());
        
        // Skip header
        const entries = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            if (cols.length < 5) continue;
            
            // Skip comment lines
            if (cols[0].startsWith('#')) continue;
            
            entries.push({
                Location: parseInt(cols[0], 10),
                Name: cols[1] || '',
                Frequency: cols[2] || '',
                Duplex: cols[3] || '',
                Offset: cols[4] || '',
                Tone: cols[5] || '',
                rToneFreq: cols[6] || '100.0',
                cToneFreq: cols[7] || '100.0',
                DtcsCode: cols[8] || '023',
                DtcsPolarity: cols[9] || 'NN',
                Mode: cols[10] || 'FM',
                TStep: cols[11] || '12.5',
                Skip: cols[12] || '',
                Comment: cols[13] || '',
                // Additional parsed fields
                call: cols[1] ? cols[1].split('/')[0] : '',
                location: cols[1] ? cols[1].split('/')[1] || '' : '',
                qth: cols[13] || ''
            });
        }
        return entries;
    } catch (e) {
        console.error(`Failed to read CSV file: ${e.message}`);
        return [];
    }
}

// Simple CSV line parser (handles quoted fields)
function parseCsvLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    fields.push(current);
    return fields;
}

// Compare uploaded entry with downloaded memory
function compareEntry(uploadEntry, downloadMem) {
    const diffs = [];
    
    // Compare frequency
    const uploadFreq = Math.round(parseFloat(uploadEntry.Frequency) * 1000000);
    if (downloadMem.rxFreq !== uploadFreq) {
        diffs.push(`Frequency: expected=${uploadFreq}, got=${downloadMem.rxFreq}`);
    }
    
    // Compare duplex/offset
    const expectedDuplex = uploadEntry.Duplex || '';
    const actualDuplex = downloadMem.offsetDirection === 'PLUS' ? '+' : 
                         downloadMem.offsetDirection === 'MINUS' ? '-' : '';
    if (expectedDuplex !== actualDuplex) {
        diffs.push(`Duplex: expected=${expectedDuplex}, got=${actualDuplex}`);
    }
    
    // Compare tone
    const uploadTone = uploadEntry.Tone || '';
    const downloadTone = downloadMem.toneMode === 'Tone' ? 'Tone' :
                         downloadMem.toneMode === 'TSQL' ? 'TSQL' :
                         downloadMem.toneMode === 'DCS' ? 'DTCS' : '';
    if (uploadTone && uploadTone !== downloadTone) {
        diffs.push(`Tone mode: expected=${uploadTone}, got=${downloadTone}`);
    }
    
    // Compare CTCSS tone frequency
    if (uploadTone === 'Tone' || uploadTone === 'TSQL') {
        const uploadToneFreq = parseFloat(uploadEntry.cToneFreq || uploadEntry.rToneFreq || '100.0');
        const downloadToneFreq = downloadMem.ctcssTone || 
            (downloadMem.ctcssIdx !== null ? (CTCSS_TONES[downloadMem.ctcssIdx] || null) : null) ||
            (downloadMem.vfoCtcssTone || null);
        
        if (downloadToneFreq && Math.abs(downloadToneFreq - uploadToneFreq) > 0.1) {
            diffs.push(`CTCSS tone: expected=${uploadToneFreq}, got=${downloadToneFreq}`);
        }
    }
    
    return diffs;
}

// Main function
async function run() {
    const args = process.argv.slice(2);
    const verifyMode = args.includes('--verify') || args.includes('-v');
    const helpMode = args.includes('--help') || args.includes('-h');
    
    if (helpMode) {
        console.log(`
FTX-1 Memory Download/Upload/Verify Program

Usage: node download.js [options]

Options:
  --verify, -v    Run verification mode (compares MR vs MC+FA)
  --help, -h      Show this help message

Default behavior:
  1. Upload repeaters from ${INPUT_CSV} to radio (memories 1-10)
  2. Download memories 1-10 from radio
  3. Compare uploaded vs downloaded data
  4. Export to ${OUTPUT_CSV}

Verification mode:
  - Additionally verifies each memory channel using MC command
  - Compares MR-only data vs MC+FA data
  - Reports any differences in tone/DCS settings
`);
        return;
    }
    
    console.log('===========================================');
    console.log('FTX-1 Memory Download/Upload/Verify Tool');
    console.log('===========================================');
    console.log('');
    
    const serial = new NodeSerial(SERIAL_PORT);
    const radio = new Ftx1CatProcessor(serial);

    try {
        // Connect to radio
        console.log(`Connecting to radio on ${SERIAL_PORT}...`);
        await serial.connect();
        console.log('Connected successfully!');
        console.log('');
        
        // Step 1: Read initial memories (before upload)
        console.log('=== Step 1: Reading initial memory state ===');
        const initialMemories = await radio.getMemoryRange(1, 10);
        console.log(`Found ${initialMemories.length} existing memories`);
        console.log('');
        
        // Step 2: Parse and upload CSV
        console.log(`=== Step 2: Uploading from ${INPUT_CSV} ===`);
        const uploadEntries = parseChirpCsv(INPUT_CSV);
        
        if (uploadEntries.length === 0) {
            console.error('No entries found in CSV file!');
            return;
        }
        
        console.log(`Found ${uploadEntries.length} repeaters to upload`);
        
        // Upload all entries (up to 10)
        const entriesToUpload = uploadEntries.slice(0, 10);
        await radio.uploadFromCsv(entriesToUpload);
        console.log('');
        
        // Step 3: Download memories after upload
        console.log('=== Step 3: Downloading memories 1-10 ===');
        const downloadedMemories = await radio.getMemoryRange(1, 10);
        console.log(`Downloaded ${downloadedMemories.length} memories`);
        console.log('');
        
        // Step 4: Compare and report
        console.log('=== Step 4: Comparing uploaded vs downloaded ===');
        let matchCount = 0;
        let mismatchCount = 0;
        
        for (let i = 0; i < entriesToUpload.length; i++) {
            const upload = entriesToUpload[i];
            const download = downloadedMemories.find(m => m.memoryNumber === upload.Location);
            
            if (!download) {
                console.log(`Memory ${upload.Location}: NOT FOUND in radio`);
                mismatchCount++;
                continue;
            }
            
            const diffs = compareEntry(upload, download);
            if (diffs.length === 0) {
                console.log(`Memory ${upload.Location} (${upload.Name}): ✓ MATCH`);
                matchCount++;
            } else {
                console.log(`Memory ${upload.Location} (${upload.Name}): ✗ MISMATCH`);
                diffs.forEach(d => console.log(`  - ${d}`));
                mismatchCount++;
            }
        }
        console.log('');
        
        console.log(`Summary: ${matchCount} matches, ${mismatchCount} mismatches`);
        console.log('');
        
        // Step 5: Export to CHIRP CSV
        console.log(`=== Step 5: Exporting to ${OUTPUT_CSV} ===`);
        const chirpCsv = radio.toChirpCsv(downloadedMemories);
        writeFileSync(OUTPUT_CSV, chirpCsv, 'utf-8');
        console.log(`Exported ${downloadedMemories.length} memories to ${OUTPUT_CSV}`);
        console.log('');
        
        // Step 6: Verification mode (optional)
        if (verifyMode) {
            console.log('=== Step 6: Verification Mode (MR vs MC+FA) ===');
            console.log('This mode compares data from MR command vs MC+FA method');
            console.log('to ensure tone/DCS settings are correctly stored and restored.');
            console.log('');
            
            for (let i = 1; i <= Math.min(10, downloadedMemories.length); i++) {
                const verifyResult = await radio.verifyMemoryChannel(i);
                
                if (verifyResult.match) {
                    console.log(`Memory ${i}: ✓ VERIFIED (MR and MC+FA match)`);
                } else {
                    console.log(`Memory ${i}: ⚠ VERIFICATION DIFFERENCES`);
                    verifyResult.differences.forEach(d => console.log(`  - ${d}`));
                }
            }
            console.log('');
        }
        
        console.log('===========================================');
        console.log('Operation completed successfully!');
        console.log('===========================================');
        
    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    } finally {
        await serial.close();
        console.log('Serial connection closed.');
        process.exit(0);
    }
}

// Run the program
run();
