# FTX-1 Memory Programmer Architecture

## Overview

This project provides a browser-based and Node.js application to program memory channels on the Yaesu FTX-1 radio transceiver. It uses the CAT (Computer Aided Transceiver) protocol over a serial connection.

## Design Goals

1. **Dual Runtime Support**: Runs in both Node.js and browser environments
2. **ES6 Modules**: Clean module system with single-class exports
3. **Serial Abstraction**: Separate implementations for Node.js and browser Web Serial API
4. **CAT Protocol**: Implements Yaesu FTX-1 ASCII-based CAT commands

## Architecture

### Module Structure

```
┌─────────────────────────────────────────────────────────┐
│                   js/download.js                        │
│                  (Entry Point - Node)                   │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────▼─────────────┐
        │   js/Ftx1CatProcessor.js  │
        │    (Main Processor Class) │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │   js/SerialInterface.js   │
        │   (Abstract Base Class)   │
        └─────────────┬─────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
┌───▼────┐      ┌────▼────┐      ┌────▼────┐
│NodeSerial│      │WebSerial│      │MockSerial│
└─────────┘      └─────────┘      └─────────┘
```

### Key Components

#### 1. js/SerialInterface.js (Abstract + Implementations)

Provides the serial communication abstraction layer:

- **`SerialInterface`** (Abstract Base Class)
  - Defines interface: `connect()`, `send()`, `readUntil()`, `close()`

- **`NodeSerial`** (Node.js Implementation)
  - Uses `serialport` npm package
  - Handles USB serial devices on desktop

- **`WebSerial`** (Browser Implementation)
  - Uses Web Serial API (`navigator.serial`)
  - Works in Chrome/Edge browsers

- **`MockSerial`** (Testing Implementation)
  - Returns mock responses for testing

#### 2. js/Ftx1CatProcessor.js (Main Class)

Processes CAT commands for the FTX-1:

- **`backupState()`** - Reads current transceiver settings (VFO, mode, tones)
- **`restoreState()`** - Restores previously saved settings
- **`getMemoryRange(start, end)`** - Reads memory channels
- **`setMemoryRange(entries)`** - Writes memory channels
- **`getTransceiverSettings()`** - Returns settings object

#### 3. js/constants.js

Contains constant definitions:
- `CTCSS_TONES` - 50 standard CTCSS tones
- `MODE_MAP` / `MODE_REV_MAP` - Mode name ↔ code mappings
- `TONE_MODE_MAP` - Tone mode mappings
- `isFrequencySupported()` - Frequency range validation

## CAT Commands Used

### Transceiver Settings

| Command | Description | Example Response |
|---------|-------------|------------------|
| `FA` | Get/Set VFO-A Frequency | `FA145280000` |
| `MD0` | Get/Set Operating Mode | `MD04` (FM) |
| `CT0` | Get/Set Tone Mode | `CT03` (DCS) |
| `CN00` | Get/Set CTCSS Tone Index | `CN00012` |
| `CN01` | Get/Set DCS Code | `CN01023` |

### Memory Operations

| Command | Description |
|---------|-------------|
| `MRnnn` | Read memory channel nnn |
| `MWnnn...` | Write memory channel nnn |
| `MTnnn` | Read/Write memory tag (name) |
| `MAnn` | Select memory channel to VFO |

### Memory Channel Format

The FTX-1 uses a 29-character data block for memory channels:
- Frequency (9 digits)
- Shift direction
- Mode
- Tone mode
- CTCSS/DCS codes
- Offset frequency

### MC Command - Full Memory Load

The `MC` command loads a complete memory channel to the VFO buffer and returns full memory data including:
- Frequency with all details
- Complete tone settings (CTCSS/DCS)
- Mode and shift information

**Command:** `MCccccc;` (5-digit channel number)
**Response:** Full memory data block similar to MR but with complete tone information

### Verification Mode

The verification mode compares data retrieved via different methods:
- **MR only**: Returns stored memory data
- **MC + FA**: Loads full memory to VFO buffer, then reads actual VFO settings

This mode helps ensure that tone frequencies (CTCSS) and DCS codes are correctly restored.

## CSV Import Formats

The program supports multiple CSV formats for importing memory channels:

### CHIRP CSV Format (`--chirp-csv`)
Standard CHIRP radio programming software format.

```
Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment,...
```

### relais.dl3el.de CSV Format (`--csv`)
Semicolon-separated format from the German repeater database.

```
Call;QRG;Input;Locator;Info;Breite;Länge;CTCSS;Mode/Node;Entfernung zu JN49hf
```

### Mode Filtering

Supported modes can be specified when importing to filter out unsupported modes (e.g., DMR, D-Star, Tetra).

See [csv_formats.md](csv_formats.md) for complete documentation.

## Usage

### Node.js

```javascript
import { NodeSerial } from './js/SerialInterface.js';
import { Ftx1CatProcessor } from './js/Ftx1CatProcessor.js';

const serial = new NodeSerial('/dev/cu.usbserial-XXX');
const radio = new Ftx1CatProcessor(serial);

await serial.connect();
await radio.backupState();
const settings = radio.getTransceiverSettings();
console.log(settings);
await radio.restoreState();
await serial.close();
```

### Browser

```javascript
import { WebSerial } from './js/SerialInterface.js';
import { Ftx1CatProcessor } from './js/Ftx1CatProcessor.js';

const serial = new WebSerial();
await serial.connect();
const radio = new Ftx1CatProcessor(serial);
// ... same as above
```

## Data Flow

1. **Connect**: Open serial port
2. **Backup**: Read current transceiver settings → Store in object
3. **Operate**: Read/write memory channels
4. **Restore**: Apply saved transceiver settings
5. **Disconnect**: Close serial port

## Notes

- The FTX-1 uses ASCII text commands terminated with `;`
- Some commands (like CT, CN) may not return responses - use appropriate timeouts
- Memory channels must be loaded to VFO before reading tone settings
- The radio's state is affected by memory operations, hence backup/restore is essential
- Tone mode values follow `CT(P1)(P2)`: `P2=3` for DCS, `4` for PR FREQ, `5` for REV TONE
