/**
 * FTX-1 Memory Uploader
 *
 * Node.js CLI for uploading repeater entries from CSV to Yaesu FTX-1 radio.
 * Uses Ftx1UploaderCore for business logic and NodeSerial for serial communication.
 */

import { NodeSerial } from './SerialInterface.js'
import { Ftx1UploaderCore, FTX1_SUPPORTED_MODES } from './Ftx1UploaderCore.js'
import CsvParser from './CsvParser.js'

/**
 * Ftx1Uploader - Node.js CLI uploader
 * Extends Ftx1UploaderCore with NodeSerial for serial communication
 */
export class Ftx1Uploader extends Ftx1UploaderCore {
    constructor(serialPort = '/dev/cu.usbserial-01A9994B0') {
        super(new NodeSerial(serialPort))
    }
}

// Main CLI entry point
async function main() {
    const args = process.argv.slice(2)

    let chirpCsvFile = null
    let repeaterCsvFile = null
    let port = '/dev/cu.usbserial-01A9994B0'
    let startMem = 1  // Starting memory for auto-assignment (repeater CSV)
    let memStart = null  // Filter: start memory channel (CHIRP CSV)
    let memEnd = null    // Filter: end memory channel (CHIRP CSV)
    let debug = false    // Debug flag for serial commands

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-p' || args[i] === '--port') {
            port = args[++i]
        } else if (args[i] === '--start-mem') {
            startMem = parseInt(args[++i]) || 1
        } else if (args[i] === '-s' || args[i] === '--mem-start') {
            memStart = parseInt(args[++i])
        } else if (args[i] === '-e' || args[i] === '--mem-end') {
            memEnd = parseInt(args[++i])
        } else if (args[i] === '--chirp-csv') {
            chirpCsvFile = args[++i]
        } else if (args[i] === '--csv') {
            repeaterCsvFile = args[++i]
        } else if (args[i] === '-d' || args[i] === '--debug') {
            debug = true
        } else if (args[i] === '-h' || args[i] === '--help') {
            console.log(`
FTX-1 Memory Uploader

Usage: node uploader.js [options]

Options:
  --chirp-csv <file>   CHIRP CSV format file
  --csv <file>         relais.dl3el.de format CSV file
  -p, --port <port>    Serial port (default: /dev/cu.usbserial-01A9994B0)
  --start-mem <n>      First memory number for entries without Location (default: 1)
  -s, --mem-start <n>  Filter: start memory channel (CHIRP CSV only)
  -e, --mem-end <n>    Filter: end memory channel (CHIRP CSV only)
  -d, --debug          Show all serial commands sent to radio
  -h, --help           Show this help

Supported Modes (FTX-1):
  FM, NFM, AM, USB, LSB, CW, C4FM/DN, WIRES-X
  Note: DMR, D-Star, and Tetra are NOT supported and will be skipped

Examples:
  # Upload CHIRP CSV (uses Location as memory number)
  node js/uploader.js --chirp-csv repeaters.csv -p /dev/cu.usbserial-01A9994B0

  # Upload repeater CSV starting at memory 1
  node js/uploader.js --csv repeaters.csv

  # Debug mode - show all commands
  node js/uploader.js --csv repeaters.csv --debug

  # Upload repeater CSV starting at memory 100
  node js/uploader.js --csv repeaters.csv --start-mem 100

  # Upload CHIRP CSV with Location 1-50 only
  node js/uploader.js --chirp-csv repeaters.csv -s 1 -e 50
            `)
            process.exit(0)
        }
    }

    // Determine which file to use
    const csvFile = chirpCsvFile || repeaterCsvFile
    if (!csvFile) {
        console.error('Error: No CSV file specified. Use --chirp-csv or --csv')
        process.exit(1)
    }

    // Check file exists
    const fs = await import('fs')
    if (!fs.existsSync(csvFile)) {
        console.error(`Error: File not found: ${csvFile}`)
        process.exit(1)
    }

    const uploader = new Ftx1Uploader(port)

    // Enable debug mode if requested
    if (debug) {
        uploader.setDebug(true)
    }

    try {
        await uploader.connect()
        console.log(`Connected to ${port}\n`)

        // Parse CSV with mode filtering for FTX-1
        const entries = await CsvParser.parseFile(csvFile, {
            supportedModes: FTX1_SUPPORTED_MODES
        })

        console.log(`Parsed ${entries.length} entries (mode-filtered for FTX-1)\n`)

        // Filter by memory range if specified (CHIRP CSV with Location)
        if (memStart !== null && memEnd !== null) {
            entries = entries.filter(e => {
                const loc = parseInt(e.Location)
                return loc >= memStart && loc <= memEnd
            })
            console.log(`Filtered to ${entries.length} entries (channels ${memStart}-${memEnd})\n`)
        }

        await uploader.uploadEntries(entries, { startMem: startMem })

    } catch (err) {
        console.error('Error:', err.message)
        process.exit(1)
    } finally {
        await uploader.close()
    }
}

// Run if called directly
main()
