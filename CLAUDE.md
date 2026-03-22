# FTX-1 Memory Programmer - Project Summary

## Project Goals

This project provides applications to program memory channels on the Yaesu FTX-1 radio transceiver. It supports both Node.js CLI and browser-based interfaces using the CAT (Computer Aided Transceiver) protocol over serial connection.

### Key Features

1. **Memory Upload** - Upload repeaters from CSV files to radio memory channels
2. **Memory Download** - Download memory contents back to CHIRP CSV format
3. **CHIRP CSV Format Support** - Compatible with CHIRP radio programming software
4. **Web UI** - Browser-based interface for easy programming
5. **Verification Mode** - Compare MR vs MC+FA methods to verify tone/DCS settings

## Project Structure

```
├── index.html               # Web UI (open directly in browser)
├── style.css               # Web UI styles
├── js/
│   ├── Ftx1UploaderCore.js  # Core upload logic (browser-compatible)
│   ├── uploader.js          # Node.js CLI entry point
│   ├── SerialInterface.js   # Serial abstraction (WebSerial + NodeSerial)
│   ├── CsvParser.js        # CSV parsing with mode filtering
│   ├── CharConverter.js     # Character conversion for tags
│   ├── constants.js         # CTCSS tones, mode mappings
│   ├── Ftx1CatProcessor.js  # Download/verify core logic
│   └── download.js          # Download/verify program (Node.js)
├── cat_format.md           # CAT command reference
├── csv_formats.md          # CSV format documentation
└── architecture.md         # System architecture
```

## Quick Start

### Web UI (Recommended for Beginners)

1. Open `index.html` in a browser (Chrome/Edge required)
2. Enable Web Serial API: go to `chrome://flags/#enable-experimental-web-platform-features`
3. Click "Connect to Radio" and select your FTX-1 port
4. Load a CSV file (CHIRP or relais.dl3el.de format)
5. Review entries, adjust start memory if needed
6. Click "Upload to Radio"

### Node.js CLI

```bash
# Upload from CHIRP CSV format
node js/uploader.js --chirp-csv repeaters.csv

# Upload from relais.dl3el.de CSV format
node js/uploader.js --csv repeaters.csv

# Upload to specific port
node js/uploader.js --chirp-csv repeaters.csv -p /dev/cu.usbserial-01A9994B0

# Upload to specific memory range
node js/uploader.js --chirp-csv repeaters.csv -s 1 -e 10

# Debug mode - show all commands
node js/uploader.js --csv repeaters.csv --debug
```

### Download

```bash
# Download all memories to CSV
node js/download.js

# Download with verification mode
node js/download.js --verify
```

### Command-Line Options

| Option | Description |
|--------|-------------|
| `--port, -p` | Serial port path |
| `-s, --mem-start` | Start memory channel |
| `-e, --mem-end` | End memory channel |
| `--verify, -v` | Run verification mode (download only) |
| `--chirp-csv` | CHIRP CSV format file |
| `--csv` | relais.dl3el.de CSV format file |
| `--start-mem` | First memory number for auto-assigned entries |
| `-d, --debug` | Show all serial commands |
| `--help, -h` | Show help |

### Supported Modes (FTX-1)

| Mode | Supported |
|------|-----------|
| FM, NFM | :white_check_mark: |
| AM, USB, LSB, CW | :white_check_mark: |
| C4FM/DN, WIRES-X | :white_check_mark: |
| DMR, D-Star, Tetra | :x: (skipped during import) |

## Key Technical Notes

### Memory Upload Strategy

**Three approaches for uploading memories:**

1. **Digital (DN/C4FM): Use MW directly**
   - MW stores frequency and mode embedded in the command
   - No tone settings needed for digital modes

2. **Analog WITHOUT tone/DCS: Use MW directly**
   - MW stores frequency, mode, and shift
   - CTCSS mode stored as OFF

3. **Analog WITH tone/DCS: Use MW + MC + MA + AM sequence**
   - MW creates the memory channel
   - MC selects the channel
   - MA loads memory into VFO
   - AM stores the **actual current VFO state** including CTCSS frequency!

**Upload sequence for entries with tone/DCS:**
```
MWccccc...;       - Create memory channel
MC0nnnnn;         - Select memory channel
VM000;            - Switch to VFO mode
MA;               - Load memory into VFO
CT01;             - Set tone mode
CN00###;          - Set CTCSS frequency
AM;               - Store VFO state to memory
```

### MC Command Format

- MC uses **6-digit format**: `MC000011` for memory channel 11
- MR uses **5-digit format**: `MR00011` for memory channel 11

### Tone/Code Command Parameters

- `CT(P1)(P2)`:
  - `P1`: `0=MAIN`, `1=SUB`
  - `P2`: `0=OFF`, `1=Tone`, `2=TSQL`, `3=DCS`
- `CN(P1)(P2)(P3)`:
  - `P1`: `0=MAIN`, `1=SUB`
  - `P2`: `0=CTCSS`, `1=DCS`
  - `P3`: `000-049` for CTCSS index, `000-103` for DCS number

### Repeater Name Format

- Format: "Callsign-City" (e.g., "DM0FG-Wiesloch")
- Maximum 12 characters
- Special characters (German umlauts) are converted to ASCII equivalents

### Frequency Validation

Entries with frequencies outside FTX-1's supported ranges are automatically skipped:

| Band | Frequency Range |
|------|---------------|
| HF | 0.1 - 174 MHz |
| VHF | 174 - 350 MHz |
| Airband | 350 - 400 MHz |
| UHF | 400 - 524 MHz |

## Files

| File | Description |
|------|-------------|
| `js/Ftx1UploaderCore.js` | **Core upload logic** - browser-compatible business logic |
| `js/uploader.js` | Node.js CLI uploader (extends Ftx1UploaderCore) |
| `index.html` | **Web UI** - browser-based programming interface |
| `style.css` | Web UI styles (light theme) |
| `js/CsvParser.js` | CSV parsing with mode filtering |
| `js/CharConverter.js` | Character conversion for tags |
| `js/SerialInterface.js` | Serial abstraction (WebSerial + NodeSerial) |
| `js/constants.js` | CTCSS tones, mode mappings, frequency validation |
| `js/download.js` | Download/verify program (Node.js) |
| `js/Ftx1CatProcessor.js` | Download/verify core logic |
| `cat_format.md` | CAT command documentation |
| `csv_formats.md` | CSV format documentation |
| `short.csv` | Example CSV file |

## Testing

Run syntax checks:
```bash
node --check js/Ftx1UploaderCore.js
node --check js/uploader.js
node --check js/download.js
```

Test the web UI:
1. Open `index.html` in Chrome/Edge
2. Enable Web Serial API at `chrome://flags/#enable-experimental-web-platform-features`
3. Connect to radio and test upload

## Browser Requirements

The web UI requires:
- Chrome 89+ or Edge 89+
- Web Serial API enabled via `chrome://flags/#enable-experimental-web-platform-features`

## License

This project is provided as-is for amateur radio enthusiasts.
