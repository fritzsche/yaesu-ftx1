# FTX-1 CAT Command Format Reference

## Memory Read/Write Commands

### MR - Memory Read
Read memory channel content from radio.

**Command:** `MRccccc;`
- `ccccc` = 5-digit channel number (00001-00999)

**Response:** 29 characters data (positions 1-29, 1-indexed) + `;` terminator at position 30
- Position 1-2: Command (MR)
- Position 3-7: Channel (5 digits)
- Position 8-16: Frequency in Hz (9 digits)
- Position 17: Clarifier sign (+, -, S)
- Position 18-21: Clarifier frequency (4 digits)
- Position 22: RX Clarifier ON/OFF (0=off, 1=on)
- Position 23: TX Clarifier ON/OFF (0=off, 1=on)
- Position 24: Mode (4=FM, 5=AM, B=NFM, etc.)
- Position 25: VFO/Memory indicator (0=VFO, 1=Memory, 2=Memory Tune)
- Position 26: CTCSS mode (0=OFF, 1=ENC/DEC, 2=ENC, 3=DCS, 4=PR FREQ, 5=REV TONE)
- Position 27-28: Fixed (00)
- Position 29: Repeater shift (0=simplex, 1=plus, 2=minus)
- Position 30: Terminator (`;`)

**Example:** `MR00008145675000+000000412002;`
| Position | Value | Description |
|----------|-------|-------------|
| 1-2 | MR | Command |
| 3-7 | 00008 | Channel 8 |
| 8-16 | 145675000 | 145.675 MHz |
| 17 | + | Clarifier plus |
| 18-21 | 0000 | No offset |
| 22 | 0 | RX clarifier off |
| 23 | 0 | TX clarifier off |
| 24 | 4 | FM mode |
| 25 | 1 | VFO/Memory: Memory |
| 26 | 2 | CTCSS: ENC (Tone) |
| 27-28 | 00 | Fixed |
| 29 | 2 | Minus shift |
| 30 | ; | Terminator |

**Note:** MR position 26 CTCSS mode codes: 0=OFF, 1=ENC/DEC (TSQL), 2=ENC (Tone), 3=DCS

### MW - Memory Write
Write memory channel content to radio.

**Command:** 29 characters data (positions 1-29, 1-indexed) + `;` terminator at position 30

| Position | Field | Digits | Description |
|---------|-------|--------|-------------|
| 1-2 | Cmd | 2 | Always "MW" |
| 3-7 | Channel | 5 | 00001-00999 |
| 8-16 | Frequency | 9 | Hz (e.g., 145675000) |
| 17 | Clarifier Direction | 1 | + (plus) or - (minus) - NOT simplex! |
| 18-21 | Clarifier Offset | 4 | 4 digits (e.g., 0000) - RIT/XIT offset |
| 22 | RX Clarifier | 1 | 0=OFF, 1=ON |
| 23 | TX Clarifier | 1 | 0=OFF, 1=ON |
| 24 | Operating Mode | 1 | 4=FM, 5=AM, B=FM-N, H=C4FM/DN, etc. |
| 25 | VFO/Memory Mode | 1 | 0=VFO, 1=Memory, 2=Memory Tune, 3=QMB, 5=PMS |
| 26 | CTCSS Mode | 1 | 0=OFF, 1=ENC/DEC, 2=ENC, 3=DCS, 4=PR FREQ, 5=REV TONE |
| 27-28 | Fixed | 2 | Always "00" |
| 29 | Repeater Shift | 1 | 0=Simplex, 1=Plus, 2=Minus |
| 30 | Terminator | 1 | Always ";" |

**Note:** Clarifier Direction (pos 17) must be `+` or `-`. Use `+` for simplex channels. `S` is NOT valid.

**Example:** `MW00008145675000-000000412002;`
| Position | Value | Description |
|----------|-------|-------------|
| 1-2 | MW | Command |
| 3-7 | 00008 | Channel 8 |
| 8-16 | 145675000 | 145.675 MHz |
| 17 | - | Minus shift |
| 18-21 | 0000 | No clarifier offset |
| 22-23 | 00 | RX/TX clarifier off |
| 24 | 4 | FM mode |
| 25 | 1 | VFO/Memory: Memory |
| 26 | 2 | CTCSS: ENC (Tone) |
| 27-28 | 00 | Fixed |
| 29 | 2 | Minus shift |
| 30 | ; | Terminator |

**Important:**
- MW does NOT store CTCSS/DCS **frequency** - only the squelch TYPE (P8)
- The CTCSS frequency must be set via CN command BEFORE calling MW
- MW stores the current VFO state for mode, shift, and CTCSS type

**Note:** MW position 26 (CTCSS mode) uses same codes as MR position 26 and CT command:
- 0=OFF, 1=ENC/DEC (TSQL), 2=ENC (Tone), 3=DCS

### VM - VFO/Memory Mode
Get/Set transceiver operating mode (VFO vs Memory).

**Query Format:** `VM0;` (read MAIN-side mode)
- Response: `VM0PP;` where PP = mode code

**Set Format:**
- `VM000;` - Set MAIN side to VFO mode
- `VM;` - Switch to Memory mode (when in VFO mode)

**Mode Codes:**
- `00` = VFO mode
- `11` = Memory mode

**Examples:**
- Read MAIN mode: `VM0;` → `VM00;` (VFO mode) or `VM011;` (Memory mode)
- Set to VFO: `VM000;`
- Set to Memory: `VM;`

**Important:** MW (Memory Write) requires VFO mode to store correctly.

### SV - Switch MAIN/SUB
Switch between MAIN and SUB VFO.

**Command:** `SV;`
- No parameters - switches between MAIN and SUB VFO

**Response:** None (set command)

**Note:** This is NOT for VFO/Memory mode switching!

### AM - Store VFO-A to Memory
Store current VFO-A settings to the selected memory channel.

**Command:** `AM;`
- No parameters - stores current VFO-A state

**Important:** Unlike `MW` which takes explicit parameters, `AM;` stores the **ACTUAL current VFO settings** including:
- Frequency
- Mode
- Tone/CTCSS settings
- Shift

**Response:** None (set-only command)

**Usage:**
1. Set VFO mode: `VM000;`
2. Set frequency: `FA...;`
3. Set tone mode: `CT01;` (Tone) or `CT02;` (TSQL)
4. Set CTCSS frequency: `CN...;`
5. Select memory channel: `MC...;`
6. Store: `AM;`

### Memory Upload Strategy

**Three approaches for uploading memories:**

**1. Analog entries WITHOUT tone/DCS: Use MW directly**
```
VM000;           - Set VFO mode
FA#########;      - Set frequency
MWccccc...;      - Write memory with MW
```
MW stores frequency, mode, and shift. CTCSS mode stored as OFF.

**2. Analog entries WITH Tone/TSQL/DCS: Use MW + AM; sequence**
```
VM000;           - Set VFO mode
FA#########;      - Set frequency
MWccccc...;     - Create memory channel (with initial tone data)
CT0X;            - Set correct tone mode
CN00###;         - Set CTCSS frequency (if CTCSS)
CN01###;         - Set DCS code (if DCS)
MC######;         - Select memory channel (6-digit)
AM;              - Store CORRECT VFO state to memory!
```
This is critical because MW doesn't properly store CTCSS frequency. AM; stores the actual current VFO state.

**3. Digital (C4FM/DN) entries: Use MW directly**
```
VM000;           - Set VFO mode
FA#########;      - Set frequency
MD0H;            - Set C4FM/DN mode
MWccccc...;      - Write memory with MW (digital doesn't use CTCSS)
```
Digital modes (C4FM/DN) do not use CTCSS tones. The mode must be set via MD command before MW.

**Key differences between MW and AM;:**
- `MW` - Stores explicit parameters, but CTCSS frequency may not update correctly
- `AM;` - Stores actual current VFO state, including the CTCSS frequency!

**Mode codes for MD command:**
- `4` = FM
- `5` = AM
- `B` = FM-N (NFM)
- `H` = C4FM/DN

**Memory Tag Format:**
- Tag = "Callsign-City" (e.g., "DM0FG-Wiesloch")
- Max 12 characters
- Use `MTccccc[tag12];` to set

### BM - Store VFO-B to Memory
Store current VFO-B settings to the selected memory channel.

**Command:** `BM;`
- No parameters - stores current VFO-B state

**Response:** None (set-only command)

**Note:** Same behavior as `AM;` but uses VFO-B settings

### MT - Memory Tag
Read/Write memory channel name tag (max 12 characters).

**Command (Write):** `MTccccc[tag12];`
- `ccccc` = 5-digit channel number
- `tag12` = 12-character tag name (padded with spaces)

**Response:** `MTccccc[tag12];`

**Example:** 
- Write: `MT00001DM0FG        ;` (DM0FG padded to 12 chars)
- Read: `MT00001DM0FG        ;`

### MA - Memory to VFO
Load the memory channel selected by MC into the VFO.

**Command:** `MA;`
- No parameters - works on MAIN VFO

**Response:** None

**Behavior:**
- MA only loads **frequency** from the selected memory channel to VFO
- MA does NOT load tone settings (CT/CN) from memory to VFO
- CT/CN read from VFO show the VFO's current tone settings, not the stored memory settings
- To get stored tone settings, read MR response directly (tone mode at position 18)

### MC - Memory Channel to VFO buffer
Select memory channel in VFO buffer. This is a Set command (no response).

**Command:** `MC0ccccc;`
- `0` = MAIN VFO (`1` = SUB VFO)
- `ccccc` = 5-digit channel number (00001-00999)
- No response is returned (Set command)

**Example:** `MC000010;` - Select channel 10 in MAIN VFO buffer

**Sequence:** MC first selects the channel, then MA loads the selected memory to VFO.

### Verification Mode
The verification mode compares data retrieved via different methods:

1. **MR only**: Returns stored memory data from memory channel
2. **MC + FA**: Loads full memory to VFO buffer, then reads actual VFO settings

This helps verify that tone frequencies (CTCSS) and DCS codes are correctly stored and restored.

## Transceiver Settings Commands

### FA - VFO-A Frequency
Get/Set VFO-A frequency.

**Command:** `FA;` (read) or `FAfffffffff;` (write)
- `fffffffff` = Frequency in Hz (9 digits)

**Response:** `FAfffffffff;`

**Example:** `FA145280000;` (145.280 MHz)

### MD - Operating Mode
Get/Set operating mode.

**Command:** `MD0;` (read) or `MD0M;` (write)
- `M` = Mode character

**Response:** `MD0M;`

**Mode Values:**
- `0` = LSB (or FM for some models)
- `1` = LSB
- `2` = USB
- `3` = CW-U
- `4` = FM
- `5` = AM
- `6` = RTTY-L
- `7` = CW-L
- `8` = DATA-L
- `9` = RTTY-USB
- `A` = DATA-FM
- `B` = FM-N
- `C` = DATA-USB
- `D` = AM-N
- `F` = DATA-FM-N
- `H` = C4FM-DN

### CT - Tone Mode
Get/Set squelch tone mode.

**Command Formats:**
- Set: `CT[P1][P2];` (e.g., `CT01;`)
- Read: `CT[P1];` (e.g., `CT0;`)
- Response: `CT[P1][P2];` (e.g., `CT01;`)

**Parameters:**
- `P1` (side selector):
  - `0` = MAIN-side
  - `1` = SUB-side
- `P2` (tone mode):
  - `0` = CTCSS OFF
  - `1` = CTCSS ENC ON / DEC OFF (Tone)
  - `2` = CTCSS ENC ON / DEC ON (TSQL)
  - `3` = DCS ON
  - `4` = PR FREQ
  - `5` = REV TONE

**Examples:**
- Read MAIN-side tone mode: `CT0;` -> `CT01;` (Tone)
- Set MAIN-side Tone: `CT01;`
- Set MAIN-side TSQL: `CT02;`
- Set MAIN-side DCS: `CT03;`

### CN - CTCSS/DCS Code
Get/Set CTCSS or DCS value.

**Format:** `CN(P1)(P2)(P3);`

**Parameters:**
- `P1` (side selector):
  - `0` = MAIN-side
  - `1` = SUB-side
- `P2` (code type):
  - `0` = CTCSS
  - `1` = DCS
- `P3` (3-digit value):
  - If `P2=0` (CTCSS): `000-049` tone frequency number (see table below)
  - If `P2=1` (DCS): `000-103` DCS number

**Examples:** 
- CTCSS Index 12 = 100.0 Hz -> `CN00012;`
- DCS Code 023 -> `CN01023;`

### CTCSS Tone Table (Index → Frequency)
```
00=67.0,  01=69.3,  02=71.9,  03=74.4,  04=77.0,
05=79.7,  06=82.5,  07=85.4,  08=88.5,  09=91.5,
10=94.8,  11=97.4,  12=100.0, 13=103.5, 14=107.2,
15=110.9, 16=114.8, 17=118.8, 18=123.0, 19=127.3,
20=131.8, 21=136.5, 22=141.3, 23=146.2, 24=151.4,
25=156.7, 26=159.8, 27=162.2, 28=165.5, 29=167.9,
30=171.3, 31=173.8, 32=177.3, 33=179.9, 34=183.5,
35=186.2, 36=189.9, 37=192.8, 38=196.6, 39=199.5,
40=203.5, 41=206.5, 42=210.7, 43=218.1, 44=225.7,
45=229.1, 46=233.6, 47=241.8, 48=250.3, 49=254.1
```

## Command Response Format

All FTX-1 CAT commands are ASCII text terminated with semicolon (`;`).

**Read Command Format:** `CMD;`
**Write Command Format:** `CMDvalue;`
**Response Format:** `CMDvalue;`

### Timing Notes
- Minimum 50ms delay between commands
- Some commands may timeout - use appropriate error handling
- Memory write (MW) has no response - use delay after

## Error Responses

- `?` - Invalid command or parameter
- Timeout - Radio did not respond (check connection)
