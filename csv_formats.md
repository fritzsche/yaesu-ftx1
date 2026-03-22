# CSV Format Documentation

This document describes the CSV formats supported by the FTX-1 Memory Programmer.

## Supported Modes by Transceiver

| Mode | FTX-1 | FTX-1S | Notes |
|------|-------|--------|-------|
| FM | :white_check_mark: | :white_check_mark: | Standard analog FM |
| NFM | :white_check_mark: | :white_check_mark: | Narrow FM (12.5 kHz) |
| AM | :white_check_mark: | :white_check_mark: | Amplitude modulation |
| USB | :white_check_mark: | :white_check_mark: | Upper sideband |
| LSB | :white_check_mark: | :white_check_mark: | Lower sideband |
| CW | :white_check_mark: | :white_check_mark: | Continuous wave |
| C4FM (DN) | :white_check_mark: | :white_check_mark: | Yaesu System Fusion digital |
| WIRES-X | :white_check_mark: | :white_check_mark: | WIRES-X rooms/access |
| DMR | :x: | :x: | Not supported |
| D-Star | :x: | :x: | Not supported |
| Tetra | :x: | :x: | Not supported |
| YSF | :warning: | :warning: | Depends - some YSF reflectors work via WIRES-X |

## Format 1: CHIRP CSV (`--chirp-csv`)

Standard CHIRP radio programming software format.

### Header
```
Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment,...
```

### Columns

| Column | Description | Example |
|--------|-------------|---------|
| Location | Memory channel number | 1 |
| Name | Channel name (max 12 chars) | DB0XYZ |
| Frequency | RX frequency (MHz) | 439.5625 |
| Duplex | Duplex direction | +, -, or empty for simplex |
| Offset | Offset frequency (MHz) | 7.6 |
| Tone | Tone mode | Tone, TSQL, DTCS, or empty |
| rToneFreq | RX CTCSS frequency (Hz) | 100.0 |
| cToneFreq | TX CTCSS frequency (Hz) | 100.0 |
| DtcsCode | DCS code | 023 |
| DtcsPolarity | DCS polarity | N/R or N/N |
| Mode | Operating mode | FM, NFM, AM, USB, LSB, etc. |
| TStep | Tuning step | 6.25 |
| Skip | Skip flag | S or empty |
| Comment | Additional notes | Any text |

### Supported Modes in CHIRP CSV
- FM, NFM, AM, USB, LSB, CW, C4FM, DN

### Example
```csv
Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,Mode
1,DB0XYZ,439.5625,+,7.6,Tone,100.0,100.0,,FM
2,DB0ABC,145.6000,,,88.5,Tone,88.5,,FM
3,FM_RELAY,433.5000,,,123.0,,,NFM
```

---

## Format 2: relais.dl3el.de CSV (`--csv`)

Semicolon-separated format used by the German repeater database.

### Header
```
Call;QRG;Input;Locator;Info;Breite;Länge;CTCSS;Mode/Node;Entfernung zu JN49hf
```

### Columns

| Column | Description | Example |
|--------|-------------|---------|
| Call | Callsign/identifier | DB0XYZ |
| QRG | RX frequency (MHz) | 439,5625 |
| Input | TX frequency (MHz) | 431,9625 |
| Locator | Maidenhead locator | JN49IH |
| Info | Location description | Wiesloch |
| Breite | Latitude | 49°18'N |
| Länge | Longitude | 08°42'E |
| CTCSS | CTCSS tone | 94,8Hz |
| Mode/Node | Mode or node type | W-x#C4, W-x#76582 |
| Entfernung | Distance from reference | 10.67km |

### Mode/Node Values

| Value | Mode | Supported | Notes |
|-------|------|-----------|-------|
| (empty) | FM | :white_check_mark: | Standard FM |
| W-x#C4 | C4FM | :white_check_mark: | WIRES-X C4FM digital |
| W-x#NNNNN | C4FM/WIRES-X | :white_check_mark: | WIRES-X room access |
| DMR | DMR | :x: | Not supported |
| D-Star | D-Star | :x: | Not supported |
| Tetra | Tetra | :x: | Not supported |

### Mode Filtering

When importing, modes can be filtered. By default for FTX-1, unsupported modes are excluded:

**Supported modes:** FM, NFM, AM, USB, LSB, CW, C4FM, DN, WIRES-X

**Unsupported modes (excluded by default):**
- DMR
- D-Star
- Tetra
- YSF (unless accessible via WIRES-X)

### Example
```csv
Call;QRG;Input;Locator;Info;Breite;Länge;CTCSS;Mode/Node
DM0FG;439,3625;431,7625;JN49IH;Wiesloch;49°18'N;08°42'E;;;
DB0UK;145,675;145,075;JN49EA;KARLSRUHE;49°00'N;08°22'E;94,8Hz;;
DB0WIM;439,56250;431,96250;JN49CD;Herxheim;49°08'N;08°12'E;67,0Hz;W-x#C4
```

### Number Format
- German format: comma as decimal separator (e.g., `439,5625`)
- Automatically converted to standard format internally

---

## Memory Numbering

### CHIRP CSV Format
Entries have a `Location` field which specifies the memory channel number. When uploading:
```bash
node js/uploader.js --chirp-csv repeaters.csv
# Entry with Location=5 is written to memory channel 5
```

Use `--mem-start` and `--mem-end` to filter a range:
```bash
node js/uploader.js --chirp-csv repeaters.csv --mem-start 1 --mem-end 50
```

### relais.dl3el.de CSV Format
Entries **do not have a Location field**. Use `--start-mem` to specify the first memory number:
```bash
# Start at memory 1
node js/uploader.js --csv repeaters.csv --start-mem 1

# Start at memory 100
node js/uploader.js --csv repeaters.csv --start-mem 100
```

Entries are assigned memory numbers sequentially: 100, 101, 102, etc.

---

## Programmatic Usage

### JavaScript API

```javascript
import { CsvParser } from './js/CsvParser.js';

// Supported modes for FTX-1
const FTX1_MODES = ['FM', 'NFM', 'AM', 'USB', 'LSB', 'CW', 'C4FM', 'DN', 'WIRES-X'];

// Parse CHIRP CSV with mode filtering
const entries = await CsvParser.parseFile('./repeaters.csv', {
    supportedModes: FTX1_MODES
});

// Or use separate methods
const chirpEntries = CsvParser.parseChirpCsv(csvText, { supportedModes: FTX1_MODES });
const repeaterEntries = CsvParser.parseRepeaterCsv(csvText, { supportedModes: FTX1_MODES });
```

### Mode Filter Parameter

```javascript
const options = {
    supportedModes: ['FM', 'NFM', 'AM', 'C4FM'],  // Only import these modes
    excludeModes: ['DMR', 'D-Star']                 // Or exclude these
};
```

---

## Implementing Support for New Transceivers

To add support for a new transceiver:

1. Define the transceiver's supported modes
2. Pass the mode filter to the CSV parser
3. The parser will automatically exclude unsupported modes

```javascript
// Example for a DMR radio
const DMR_MODES = ['DMR', 'FM', 'NFM'];

// The parser will exclude FM/NFM if DMR is not in the supported list
// Or you can explicitly include only DMR-capable modes
```
