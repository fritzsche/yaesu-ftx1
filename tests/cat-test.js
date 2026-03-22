/**
 * cat-test.js - FTX-1 CAT Command Test Program
 * 
 * A test program to verify CAT command functionality on the Yaesu FTX-1.
 * Similar to download.js but focused on testing individual commands and
 * providing command-line parameters for various operations.
 * 
 * Usage:
 *   node cat-test.js [options]
 * 
 * Options:
 *   --port, -p <port>     Serial port path (default: /dev/cu.usbserial-01A9994B0)
 *   --start, -s <n>       Start memory channel (default: 1)
 *   --end, -e <n>         End memory channel (default: 10)
 *   --verify, -v          Run verification mode (MR vs MC+FA comparison)
 *   --upload              Upload from CSV before download
 *   --csv <file>          CSV file to use (default: ./chrip_example.csv)
 *   --output <file>       Output CSV file (default: ./chirp_downloaded.csv)
 *   --help, -h            Show this help message
 * 
 * Examples:
 *   node cat-test.js                         # Download memories 1-10
 *   node cat-test.js -s 5 -e 15              # Download memories 5-15
 *   node cat-test.js --verify                # Download with verification
 *   node cat-test.js --upload --verify       # Upload then download with verify
 */

import { NodeSerial } from '../js/SerialInterface.js';
import { Ftx1CatProcessor } from '../js/Ftx1CatProcessor.js';
import { CTCSS_TONES } from '../js/constants.js';
import { readFileSync, writeFileSync } from 'fs';

// Default configuration
const DEFAULT_PORT = '/dev/cu.usbserial-01A9994B0';
const DEFAULT_START = 1;
const DEFAULT_END = 10;
const DEFAULT_CSV = './chrip_example.csv';
const DEFAULT_OUTPUT = './chirp_downloaded.csv';

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        port: DEFAULT_PORT,
        start: DEFAULT_START,
        end: DEFAULT_END,
        verify: false,
        upload: false,
        csvFile: DEFAULT_CSV,
        outputFile: DEFAULT_OUTPUT,
        help: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--port':
            case '-p':
                config.port = args[++i] || DEFAULT_PORT;
                break;
            case '--start':
            case '-s':
                config.start = parseInt(args[++i], 10) || DEFAULT_START;
                break;
            case '--end':
            case '-e':
                config.end = parseInt(args[++i], 10) || DEFAULT_END;
                break;
            case '--verify':
            case '-v':
                config.verify = true;
                break;
            case '--upload':
                config.upload = true;
                break;
            case '--csv':
                config.csvFile = args[++i] || DEFAULT_CSV;
                break;
            case '--output':
            case '-o':
                config.outputFile = args[++i] || DEFAULT_OUTPUT;
                break;
            case '--help':
            case '-h':
                config.help = true;
                break;
            default:
                if (arg.startsWith('-')) {
                    console.warn(`Unknown option: ${arg}`);
                }
        }
    }
    
    // Ensure start <= end
    if (config.start > config.end) {
        [config.start, config.end] = [config.end, config.start];
    }
    
    return config;
}

// Parse CHIRP CSV file
function parseChirpCsv(csvPath) {
    try {
        const csvContent = readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(l => l.trim());
        
        const entries = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            if (cols.length < 5) continue;
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
                Comment: cols[13] || ''
            });
        }
        return entries;
    } catch (e) {
        console.error(`Failed to read CSV file: ${e.message}`);
        return [];
    }
}

// Simple CSV line parser
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

// Print memory details
function printMemoryDetails(mem, index) {
    console.log(`\n--- Memory ${mem.memoryNumber || index + 1} ---`);
    console.log(`  Frequency: ${(mem.rxFreq / 1000000).toFixed(4)} MHz`);
    console.log(`  TX Frequency: ${(mem.txFreq / 1000000).toFixed(4)} MHz`);
    console.log(`  Offset Direction: ${mem.offsetDirection}`);
    console.log(`  Offset Freq: ${(mem.offsetFreq / 1000000).toFixed(4)} MHz`);
    console.log(`  Mode: ${mem.mode}`);
    console.log(`  Tone Mode: ${mem.toneMode}`);
    console.log(`  CTCSS Index: ${mem.ctcssIdx}`);
    console.log(`  CTCSS Tone: ${mem.ctcssTone} Hz`);
    console.log(`  DCS Code: ${mem.dcsCode}`);
    console.log(`  Tag: ${mem.tag || '(none)'}`);
}

// Main function
async function run() {
    const config = parseArgs();
    
    if (config.help) {
        console.log(`
cat-test.js - FTX-1 CAT Command Test Program

Usage:
  node cat-test.js [options]

Options:
  --port, -p <port>     Serial port path (default: ${DEFAULT_PORT})
  --start, -s <n>       Start memory channel (default: ${DEFAULT_START})
  --end, -e <n>         End memory channel (default: ${DEFAULT_END})
  --verify, -v          Run verification mode (MR vs MC+FA comparison)
  --upload              Upload from CSV before download
  --csv <file>          CSV file to use (default: ${DEFAULT_CSV})
  --output, -o <file>   Output CSV file (default: ${DEFAULT_OUTPUT})
  --help, -h            Show this help message

Examples:
  node cat-test.js
  node cat-test.js -s 5 -e 15
  node cat-test.js --verify
  node cat-test.js --upload --verify -s 1 -e 10
`);
        return;
    }
    
    console.log('===========================================');
    console.log('FTX-1 CAT Command Test Program');
    console.log('===========================================');
    console.log(`Configuration:`);
    console.log(`  Serial Port: ${config.port}`);
    console.log(`  Memory Range: ${config.start} - ${config.end}`);
    console.log(`  Verify Mode: ${config.verify ? 'YES' : 'NO'}`);
    console.log(`  Upload First: ${config.upload ? 'YES' : 'NO'}`);
    console.log(`  CSV Input: ${config.csvFile}`);
    console.log(`  CSV Output: ${config.outputFile}`);
    console.log('');
    
    const serial = new NodeSerial(config.port);
    const radio = new Ftx1CatProcessor(serial);
    
    try {
        // Connect to radio
        console.log(`Connecting to radio on ${config.port}...`);
        await serial.connect();
        
        // Get transceiver settings
        await radio.backupState();
        const settings = radio.getTransceiverSettings();
        console.log('\n--- Transceiver Settings ---');
        console.log(`  VFO Frequency: ${settings.freq}`);
        console.log(`  Mode: ${settings.mode}`);
        console.log(`  Tone Mode: ${settings.toneMode}`);
        console.log(`  CTCSS: ${settings.ctcss}`);
        console.log(`  DCS: ${settings.dcs}`);
        console.log('');
        
        // Upload from CSV if requested
        if (config.upload) {
            console.log(`=== Uploading from ${config.csvFile} ===`);
            const entries = parseChirpCsv(config.csvFile);
            if (entries.length === 0) {
                console.log('No entries found in CSV file, skipping upload');
            } else {
                const entriesToUpload = entries.slice(0, config.end);
                console.log(`Uploading ${entriesToUpload.length} memories...`);
                await radio.uploadFromCsv(entriesToUpload);
                console.log('Upload complete');
            }
            console.log('');
        }
        
        // Download memories
        console.log(`=== Downloading memories ${config.start} to ${config.end} ===`);
        const memories = await radio.getMemoryRange(config.start, config.end);
        console.log(`Downloaded ${memories.length} memories\n`);
        
        // Print memory details
        memories.forEach((mem, idx) => printMemoryDetails(mem, idx));
        
        // Export to CSV
        console.log(`\n=== Exporting to ${config.outputFile} ===`);
        const chirpCsv = radio.toChirpCsv(memories);
        writeFileSync(config.outputFile, chirpCsv, 'utf-8');
        console.log(`Exported ${memories.length} memories to ${config.outputFile}`);
        
        // Verification mode
        if (config.verify) {
            console.log('\n=== Verification Mode (MR vs MC+FA) ===');
            console.log('Testing each memory channel with MC command...\n');
            
            for (let i = config.start; i <= Math.min(config.end, memories.length + config.start - 1); i++) {
                const verifyResult = await radio.verifyMemoryChannel(i);
                
                console.log(`Memory ${i}:`);
                if (verifyResult.match) {
                    console.log('  ✓ MR and MC+FA data match');
                } else {
                    console.log('  ⚠ Differences found:');
                    verifyResult.differences.forEach(d => console.log(`    - ${d}`));
                }
            }
        }
        
        console.log('\n===========================================');
        console.log('Test completed successfully!');
        console.log('===========================================');
        
    } catch (err) {
        console.error('Error:', err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        await serial.close();
        console.log('Serial connection closed.');
        process.exit(0);
    }
}

// Run the program
run();
