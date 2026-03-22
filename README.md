# FTX-1 Memory Programmer

A Node.js and browser-based application for programming memory channels on the **Yaesu FTX-1** radio transceiver using the CAT (Computer Aided Transceiver) protocol over USB serial.

## Features

- **Web UI** - Browser-based interface for easy memory programming
- **Node.js CLI** - Command-line tool for automation
- **Dual CSV Format Support** - CHIRP CSV and relais.dl3el.de format
- **Mode Filtering** - Automatically skips unsupported modes (DMR, D-Star, Tetra)
- **Frequency Validation** - Validates frequencies against FTX-1's supported bands
- **Character Conversion** - German umlauts auto-converted for radio compatibility

## Quick Start

### Web UI (Recommended)

1. Open `index.html` in **Chrome** or **Edge**
2. Click **Connect to Radio** and select your FTX-1 USB port
3. Load a CSV file with repeater data
4. Review entries in the table (skipped entries are highlighted in yellow)
5. Adjust **Start Memory** number if needed
6. Click **Upload to Radio**

#### Getting Repeater Data

The easiest source for German repeaters is **relais.dl3el.de**:

1. Visit [relais.dl3el.de](http://relais.dl3el.de/) in your browser
2. Select your region or desired band (2m, 70cm, etc.)
3. Click the **CSV Download** button to download a CSV file
4. In the Web UI, select **relais.dl3el.de** as the CSV format
5. Click **Load CSV** and select the downloaded file

The app will automatically:
- Skip unsupported modes (DMR, D-Star, Tetra)
- Skip frequencies outside FTX-1's supported bands
- Convert German umlauts (ä→ae, ö→oe, ü→ue) for radio compatibility

#### Web UI Requirements

- Chrome 89+ or Edge 89+ (Web Serial API required)

### Node.js CLI

```bash
# Upload from CHIRP CSV format
node js/uploader.js --chirp-csv repeaters.csv

# Upload from relais.dl3el.de CSV format
node js/uploader.js --csv repeaters.csv

# Upload to specific port
node js/uploader.js --chirp-csv repeaters.csv -p /dev/cu.usbserial-01A9994B0

# Upload starting at memory 100
node js/uploader.js --csv repeaters.csv --start-mem 100

# Debug mode - show all CAT commands
node js/uploader.js --csv repeaters.csv --debug
```

## Command-Line Options

| Option | Description |
|--------|-------------|
| `--chirp-csv <file>` | CHIRP CSV format file |
| `--csv <file>` | relais.dl3el.de CSV format file |
| `-p, --port <port>` | Serial port path |
| `--start-mem <n>` | First memory number for auto-assignment |
| `-s, --mem-start <n>` | Filter: start memory channel (CHIRP CSV) |
| `-e, --mem-end <n>` | Filter: end memory channel (CHIRP CSV) |
| `-d, --debug` | Show all serial commands |
| `-h, --help` | Show help |

## Supported Modes (FTX-1)

| Mode | Supported |
|------|-----------|
| FM, NFM | :white_check_mark: |
| AM, USB, LSB, CW | :white_check_mark: |
| C4FM/DN, WIRES-X | :white_check_mark: |
| DMR, D-Star, Tetra | :x: (skipped) |

## Supported Frequency Bands

| Band | Frequency Range |
|------|-----------------|
| HF | 0.1 - 174 MHz |
| VHF | 174 - 350 MHz |
| Airband | 350 - 400 MHz |
| UHF | 400 - 524 MHz |

## Project Structure

```
├── index.html              # Web UI (open directly in browser)
├── style.css               # Web UI styles
├── js/
│   ├── Ftx1UploaderCore.js # Core upload logic (browser-compatible)
│   ├── uploader.js         # Node.js CLI entry point
│   ├── SerialInterface.js  # Serial abstraction (WebSerial + NodeSerial)
│   ├── CsvParser.js        # CSV parsing with mode filtering
│   ├── CharConverter.js    # Character conversion for tags
│   ├── constants.js        # CTCSS tones, mode mappings
│   └── Ftx1CatProcessor.js  # Download/verify logic
├── cat_format.md           # CAT command reference
├── csv_formats.md          # CSV format documentation
└── architecture.md         # System architecture
```

## CSV Formats

### CHIRP CSV Format

Use with `--chirp-csv` option. The `Location` column specifies memory channel numbers.

```csv
Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,Mode
1,DB0XYZ,439.5625,+,7.6,Tone,100.0,100.0,,FM
2,DB0ABC,145.6000,,,88.5,Tone,88.5,,FM
```

### relais.dl3el.de CSV Format

Use with `--csv` option. Entries are assigned memory numbers sequentially starting from `--start-mem`.

```csv
Call;QRG;Input;Locator;Info;Breite;Länge;CTCSS;Mode/Node
DM0FG;439,3625;431,7625;JN49IH;Wiesloch;49°18'N;08°42'E;;;
DB0UK;145,675;145,075;JN49EA;KARLSRUHE;49°00'N;08°22'E;94,8Hz;;
```

## Radio Setup

1. Connect FTX-1 via USB cable
2. Enable CAT in radio menu
3. Set baud rate to 38400 (default)
4. Serial parameters: 8 data bits, 2 stop bits, no parity

## Documentation

- [CAT Protocol Reference](cat_format.md) - Complete CAT command documentation
- [CSV Formats](csv_formats.md) - Detailed CSV format specifications
- [Architecture](architecture.md) - System design and module structure

## License

This project is provided as-is for amateur radio enthusiasts.