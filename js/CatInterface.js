/**
 * CatInterface - Handles serial communication with Yaesu FTX-1 via Web Serial API.
 * Implements the FTX-1 ASCII text-based CAT protocol.
 *
 * All CAT commands are ASCII text terminated with ';'.
 * The FTX-1 does NOT use the old 5-byte binary protocol of earlier Yaesu radios.
 *
 * Key memory channel commands:
 *   MR - Memory Read:  MRccc;  → MRccc[data];
 *   MW - Memory Write: MWccc[data];  → (no response on success)
 *   MT - Memory Tag:   MTccc;  → MTccc[name12];   (read)
 *                      MTccc[name12]; → (no response)  (write)
 *
 * Channel numbers are 3-digit zero-padded ASCII strings (001–900).
 * Frequencies are 9-digit decimal strings in Hz (e.g. "145500000").
 *
 * Serial settings: 8 data bits, 2 stop bits, no parity, no flow control.
 *
 * Reference: FTX-1 CAT Operation Reference Manual (FTX-1_CAT_OM_ENG_2508-C)
 */
export default class CatInterface {
    constructor() {
        this.port = null
        this.connected = false
        this.baudRate = 38400 // Default for FTX-1

        // CTCSS tone table for FTX-1 — index (00–49) maps to frequency in Hz.
        // These indices are used in the CAT protocol (2-digit field in MW/MR).
        this.ctcssTones = [
            67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5,
            94.8, 97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3,
            131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9,
            171.3, 173.8, 177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5,
            203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1
        ]

        // DCS codes used by FTX-1 — stored as 3-digit octal-derived decimal values
        // in the CAT protocol (DCS code field in MW/MR).
        this.dcsCodes = [
            23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74,
            114, 115, 116, 122, 125, 131, 132, 134, 143, 145, 152, 155, 156,
            162, 165, 172, 174, 205, 212, 223, 225, 226, 243, 244, 245, 246,
            251, 252, 255, 261, 263, 265, 266, 271, 274, 306, 311, 315, 325,
            331, 332, 343, 346, 351, 356, 364, 365, 371, 411, 412, 413, 423,
            431, 432, 445, 446, 452, 454, 455, 462, 464, 465, 466, 503, 506,
            516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632, 654,
            662, 664, 703, 712, 723, 731, 732, 734, 743, 754
        ]

        // Mode mapping: single hex character used in FTX-1 CAT MW/MR command
        // The character is the ASCII representation of the hex nibble value.
        this.modeCodeToName = {
            '0': '-',
            '1': 'LSB',
            '2': 'USB',
            '3': 'CW-U',
            '4': 'FM',
            '5': 'AM',
            '6': 'RTTY-L',
            '7': 'CW-L',
            '8': 'DATA-L',
            '9': 'RTTY-U',
            'A': 'DATA-FM',
            'B': 'FM-N',
            'C': 'DATA-U',
            'D': 'AM-N',
            'E': 'PSK',
            'F': 'DATA-FM-N',
            'G': '-',
            'H': 'C4FM-DN',
            'I': 'C4FM-VW',
            'I': '-',
        }
        this.modeNameToCode = {
            '-': '0',
            'LSB': '1',
            'USB': '2',
            'CW-U': '3',
            'FM': '4',
            'AM': '5',
            'RTTY-L': '6',
            'CW-L': '7',
            'DATA-L': '8',
            'RTTY-U': '9',
            'DATA-FM': 'A',
            'FM-N': 'B',
            'DATA-U': 'C',
            'AM-N': 'D',
            'PSK': 'E',
            'DATA-FM-N': 'F',
            //            '-': 'G',            
            'C4FM-DN': 'H',
            'C4FM-VW': 'I',


        }
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /** Returns true if the Web Serial API is available in this browser */
    isSupported() {
        return 'serial' in navigator
    }

    /**
     * Open a serial connection to the FTX-1.
     * @param {number} baudRate - e.g. 38400 (default)
     */
    async connect(baudRate = 38400) {
        if (!this.isSupported()) {
            throw new Error('Web Serial API is not supported in this browser. Use Chrome or Edge.')
        }
        this.baudRate = baudRate
        try {
            this.port = await navigator.serial.requestPort()
            await this.port.open({
                baudRate: this.baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            })
            this.connected = true
            return true
        } catch (e) {
            this.connected = false
            throw new Error('Failed to connect: ' + e.message)
        }
    }

    /** Close the serial connection */
    async disconnect() {
        try {
            if (this.port) {
                await this.port.close()
                this.port = null
            }
        } catch (e) {
            console.warn('Disconnect warning:', e)
        }
        this.connected = false
    }

    /**
     * Read a memory channel from the radio.
     *   Sends: MRccccc;
     *   Receives: MRccccc[data];
     *
     * @param {number} memNumber - Channel 1–900
     * @returns {Object|null} Memory entry object, or null if channel is empty
     */
    async readMemory(memNumber) {
        const chan = this._chanStr(memNumber)
        try {
            const response = await this._sendAndReceive(`MR${chan}`)
            if (!response) return null

            // Strip command prefix "MR" and trailing ";"
            const body = response.replace(/^MR/i, '').replace(/;$/, '')
            if (body.length < 5) return null

            // body[0..2] = echoed channel number, body[3..] = data
            const data = body.substring(5)
            if (!data || data.length < 22) return null

            // Empty / error response: starts with '?'
            if (data.startsWith('?')) return null

            return this._parseMrData(memNumber, data)
        } catch (e) {
            console.warn(`[CAT] MR${chan}: ${e.message}`)
            return null
        }
    }


    /**
     * Read the memory tag (name) for a channel.
     *   Sends: MTccc;
     *   Receives: MTccc[name up to 12 chars];
     *
     * @param {number} memNumber
     * @returns {string} Tag string (trimmed), or '' if not available
     */
    async readMemoryTag(memNumber) {
        const chan = this._chanStr(memNumber)
        try {
            const response = await this._sendAndReceive(`MT${chan}`)
            if (!response) return ''

            // Strip "MT" prefix and trailing ";"
            const body = response.replace(/^MT/i, '').replace(/;$/, '')
            if (body.length < 5) return ''

            // body[0..2] = channel, body[3..] = tag (up to 12 chars, space-padded)
            return body.substring(5).trimEnd()
        } catch (e) {
            console.warn(`[CAT] MT${chan} read: ${e.message}`)
            return ''
        }
    }

    /**
     * Write a single memory channel and its tag to the radio.
     *   MW command: writes frequency, mode, tones, offset
     *   MT command: writes the channel name/tag
     *
     * @param {Object} entry - Memory entry object
     * @param {Function} [progressCallback]
     */
    async writeMemory(entry, progressCallback) {
        if (!entry.memoryNumber || entry.memoryNumber < 1 || entry.memoryNumber > 900) {
            throw new Error(`Invalid memory number: ${entry.memoryNumber}`)
        }

        // Write channel data (frequency, mode, tones, offset)
        const mwCmd = this._buildMwCommand(entry)
        await this._sendNoResponse(mwCmd)
        await this._delay(100)

        // Write channel tag / name
        const mtCmd = this._buildMtCommand(entry)
        await this._sendNoResponse(mtCmd)
        await this._delay(100)

        if (progressCallback) {
            progressCallback(entry.memoryNumber)
        }
    }

    /**
     * Read all memory channels from the radio (1–900).
     * Channels that are empty or unreadable are silently skipped.
     *
     * @param {number} start - First channel to read (default 1)
     * @param {number} end   - Last channel to read (default 900)
     * @param {Function} [progressCallback] - Called with (current, total)
     * @returns {Array<Object>} Array of populated memory entries
     */
    async readAllMemories(start = 1, end = 600, progressCallback = null) {
        const entries = []
        for (let i = start; i <= end; i++) {
            if (progressCallback) progressCallback(i, end)
            const entry = await this.readMemory(i)
            if (entry) {
                const tag = await this.readMemoryTag(i)
                entry.tag = tag
                entry.memoryNumber = i
                entries.push(entry)
            }
            await this._delay(50) // Avoid overwhelming the radio
        }
        return entries
    }

    /**
     * Write an array of memory entries to the radio.
     *
     * @param {Array<Object>} entries
     * @param {Function} [progressCallback] - Called with (current, total, memNumber)
     */
    async writeAllMemories(entries, progressCallback = null) {
        let count = 0
        for (const entry of entries) {
            count++
            if (progressCallback) progressCallback(count, entries.length, entry.memoryNumber)
            await this.writeMemory(entry)
            await this._delay(100)
        }
    }

    // =========================================================================
    // Private: Serial I/O
    // =========================================================================

    /**
     * Send an ASCII CAT command (without ';') and read the response up to ';'.
     * @param {string} command - e.g. "MR001"
     * @param {number} [timeoutMs=3000]
     * @returns {string} Raw response string including ';'
     */
    async _sendAndReceive(command, timeoutMs = 3000) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected to radio')
        }
        const cmdStr = command + ';'
        const encoder = new TextEncoder()
        const writer = this.port.writable.getWriter()
        try {
            await writer.write(encoder.encode(cmdStr))
        } finally {
            writer.releaseLock()
        }
        return await this._readUntilSemicolon(timeoutMs)
    }

    /**
     * Send an ASCII CAT command (without ';') with no response expected.
     * @param {string} command - e.g. "MWccc..."
     */
    async _sendNoResponse(command) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected to radio')
        }
        const cmdStr = command + ';'
        const encoder = new TextEncoder()
        const writer = this.port.writable.getWriter()
        try {
            await writer.write(encoder.encode(cmdStr))
        } finally {
            writer.releaseLock()
        }
        await this._delay(50)
    }

    /**
     * Read from the serial port until a ';' character is received.
     * @param {number} timeoutMs
     * @returns {string} Received string including the terminating ';'
     */
    async _readUntilSemicolon(timeoutMs = 3000) {
        const reader = this.port.readable.getReader()
        const decoder = new TextDecoder()
        let result = ''
        const deadline = Date.now() + timeoutMs

        try {
            while (true) {
                const remaining = deadline - Date.now()
                if (remaining <= 0) {
                    throw new Error('Read timeout waiting for ";" terminator')
                }
                const { value, done } = await Promise.race([
                    reader.read(),
                    this._timeoutPromise(remaining)
                ])
                if (done || !value) {
                    throw new Error('Serial port closed unexpectedly')
                }
                result += decoder.decode(value, { stream: true })
                const idx = result.indexOf(';')
                if (idx !== -1) {
                    // Return everything up to and including the first ';'
                    return result.substring(0, idx + 1)
                }
            }
        } finally {
            reader.releaseLock()
        }
    }

    _timeoutPromise(ms) {
        return new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), ms)
        )
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    // =========================================================================
    // Private: Command builders
    // =========================================================================

    /**
     * Build the MW (Memory Write) command string.
     *
     * Format (all concatenated, no separators):
     *   MW + ccc + fffffffff + M + S + T + tt + rr + DDD + DDD + oooooooo + xx + xx
     *
     *   ccc        = channel 3-digit (001–900)
     *   fffffffff  = RX frequency in Hz, 9 digits
     *   M          = mode (1 hex char: 0=FM, 4=FM-N, 8=AM, A=AM-N, C=C4FM)
     *   S          = shift direction (S=simplex, +=plus, -=minus)
     *   T          = tone type (0=off, 1=CTCSS-TX, 2=CTCSS-TSQL, 3=DCS)
     *   tt         = CTCSS TX tone index, 2 digits (00–49)
     *   rr         = CTCSS RX tone index, 2 digits (00–49)
     *   DDD        = DCS TX code, 3 digits (e.g. 023)
     *   DDD        = DCS RX code, 3 digits
     *   oooooooo   = TX offset frequency in Hz, 8 digits
     *   xx         = frequency step, 2 hex digits (00 = default)
     *   xx         = misc/bank flags, 2 hex digits (00 = default)
     *
     * @param {Object} entry
     * @returns {string} Command string without ';'
     */
    _buildMwCommand(entry) {
        const chan = this._chanStr(entry.memoryNumber)
        const rxFreq = String(Math.round(entry.rxFreq || 0)).padStart(9, '0')
        const mode = this.modeNameToCode[entry.mode] || '0'
        const shift = this._offsetDirToChar(entry.offsetDirection)
        const toneType = this._toneModeToChar(entry.toneMode)

        const ctcssIdx = this._findCtcssIndex(entry.ctcssTone)
        const ctcssTxIdx = String(ctcssIdx).padStart(2, '0')
        const ctcssRxIdx = String(ctcssIdx).padStart(2, '0')

        const dcsVal = parseInt(entry.dcsCode, 10) || 23
        const dcsTxCode = String(dcsVal).padStart(3, '0')
        const dcsRxCode = String(dcsVal).padStart(3, '0')

        const offsetHz = (entry.offsetDirection === 'SIMPLEX')
            ? 0
            : Math.round(entry.offsetFreq || 0)
        const offsetFreq = String(offsetHz).padStart(8, '0')

        const step = '00'
        const misc = '00'

        return `MW${chan}${rxFreq}${mode}${shift}${toneType}${ctcssTxIdx}${ctcssRxIdx}${dcsTxCode}${dcsRxCode}${offsetFreq}${step}${misc}`
    }

    /**
     * Build the MT (Memory Tag) write command string.
     *
     * Format: MT + ccc + [name padded to 12 chars with spaces]
     *
     * @param {Object} entry
     * @returns {string} Command string without ';'
     */
    _buildMtCommand(entry) {
        const chan = this._chanStr(entry.memoryNumber)
        const tag = (entry.tag || '').padEnd(12, ' ').substring(0, 12)
        return `MT${chan}${tag}`
    }

    // =========================================================================
    // Private: Response parsers
    // =========================================================================

    /**
     * Parse the data block from an MR response (everything after the 3-char channel).
     *
     * Expected layout:
     *  (P2) [0–8] = VFO frequency, 9 chars, Hz 
     *  (P3) [9]  = Clear direction, 1 char (S / + / -). 
     *  (P3) [10-13]  = Clear Offset, 0000 - 9990 (hz) 
     *  (P4) [14] = RX Clear
     *  (p5) [15] = TX Clear
     *  (P6) [16] = Mode, 1 char
     *  (P7) [17] = Memory Type
     *  (P8) [18] = Tone type, 1 char (0/1/2/3/4/5)
     *  (P9) [19-20] = fixed 00 chars
     *  (p10) [21–22] = CTCSS TX tone index, 2 chars (00–49)
     *
     * @param {number} memNumber
     * @param {string} data - raw data block string
     * @returns {Object|null}
     */

    _parseMrData(memNumber, data) {
        // Frequency (P2): Columns 8-16 -> data[0-8]
        const rxFreq = parseInt(data.substring(0, 9), 10)
        if (!rxFreq || rxFreq <= 0) return null

        // Mode (P6): Column 23 -> data[15]
        const modeChar = data.charAt(16).toUpperCase()
        const mode = this.modeCodeToName[modeChar] || 'FM'

        // Tone Type (P8): Column 25 -> data[17]
        const toneChar = data.charAt(18)
        const toneMode = this._charToToneMode(toneChar)

        // CTCSS Index (P10): Columns 28-29 -> data[20-21]
        let ctcssTone = null
        const ctcssIdx = parseInt(data.substring(20, 22), 10)
        if (!isNaN(ctcssIdx) && ctcssIdx < this.ctcssTones.length) {
            ctcssTone = this.ctcssTones[ctcssIdx]
        }

        // DCS Index (P11): Columns 30-32 -> data[22-24]
        let dcsCode = null
        const dcsIdx = parseInt(data.substring(22, 25), 10)
        if (!isNaN(dcsIdx) && dcsIdx < this.dcsCodes.length) {
            dcsCode = this.dcsCodes[dcsIdx]
        }

        // Repeater Shift (P13): Column 34 -> data[26]
        const shiftChar = data.charAt(21)
        const offsetDir = this._charToOffsetDir(shiftChar)

        // Repeater Offset Freq (P14): Columns 35-43 -> data[27-35]
        const offsetFreq = parseInt(data.substring(27, 36), 10) || 0

        let txFreq = rxFreq
        if (offsetDir === 'PLUS') txFreq += offsetFreq
        else if (offsetDir === 'MINUS') txFreq -= offsetFreq

        return {
            memoryNumber: memNumber,
            rxFreq,
            txFreq,
            mode,
            offsetDirection: offsetDir,
            offsetFreq,
            toneMode,
            ctcssTone: (toneMode === 'TONE' || toneMode === 'TSQL') ? ctcssTone : null,
            dcsCode: toneMode === 'DCS' ? dcsCode : null,
            source: 'radio-read'
        }
    }


    // =========================================================================
    // Private: Encoding helpers
    // =========================================================================

    /**
     * Format a channel number as a 3-digit zero-padded string.
     * @param {number} ch - Channel number 1–900
     * @returns {string} e.g. "001", "042", "900"
     */
    _chanStr(ch) {
        return String(ch).padStart(5, '0')
    }

    /** Convert offset direction string to the single CAT character */
    _offsetDirToChar(dir) {
        switch ((dir || '').toUpperCase()) {
            case 'PLUS': return '+'
            case 'MINUS': return '-'
            default: return 'S' // SIMPLEX
        }
    }

    /** Convert CAT shift character to offset direction string */
    _charToOffsetDir(ch) {
        switch (ch) {
            case '+': return 'PLUS'
            case '-': return 'MINUS'
            default: return 'SIMPLEX'
        }
    }

    /**
     * Convert tone mode name to CAT tone type character.
     *   '0' = off
     *   '1' = CTCSS TX only (TONE)
     *   '2' = CTCSS TX + RX (TSQL)
     *   '3' = DCS
     */
    _toneModeToChar(toneMode) {
        switch ((toneMode || '').toUpperCase()) {
            case 'TONE': return '1'
            case 'TSQL': return '2'
            case 'DCS': return '3'
            default: return '0'
        }
    }

    /** Convert CAT tone type character to tone mode name */
    _charToToneMode(ch) {
        switch (ch) {
            case '1': return 'TONE'
            case '2': return 'TSQL'
            case '3': return 'DCS'
            default: return 'OFF'
        }
    }

    /**
     * Find the CTCSS tone table index closest to the given frequency.
     * Returns 0 if toneFreq is null/undefined.
     * @param {number|null} toneFreq - CTCSS frequency in Hz
     * @returns {number} Index 0–49
     */
    _findCtcssIndex(toneFreq) {
        if (!toneFreq) return 0
        let bestIdx = 0
        let bestDiff = Math.abs(this.ctcssTones[0] - toneFreq)
        for (let i = 1; i < this.ctcssTones.length; i++) {
            const diff = Math.abs(this.ctcssTones[i] - toneFreq)
            if (diff < bestDiff) {
                bestDiff = diff
                bestIdx = i
            }
        }
        return bestIdx
    }


/** FTX-1 usually expects 3-digit memory strings (001-900) */
    _chanStr(ch) {
        return String(ch).padStart(3, '0');
    }

    _toneModeToChar(toneMode) {
        switch ((toneMode || '').toUpperCase()) {
            case 'TONE': return '1';
            case 'TSQL': return '2';
            case 'DCS':  return '3';
            default:     return '0';
        }
    }

    _charToToneMode(ch) {
        switch (ch) {
            case '1': return 'TONE';
            case '2': return 'TSQL';
            case '3': return 'DCS';
            default:  return 'OFF';
        }
    }    


    
}