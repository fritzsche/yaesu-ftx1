// Ftx1CatProcessor.js
import { CTCSS_TONES, MODE_MAP, TONE_MODE_MAP } from './constants.js'
import CharConverter from './CharConverter.js'

export class Ftx1CatProcessor {
    constructor(serialInterface) {
        this.serial = serialInterface
        this.stateBackup = null
        this.transceiverSettings = null
        this.converter = new CharConverter()
    }

    /** Basic CAT Wrappers */
    async execute(cmd, expectResponse = true) {
        if (!cmd) return null
        
        // Small delay to ensure previous commands are processed
        await this._delay(50)
        
        await this.serial.send(`${cmd};`)
        
        if (expectResponse) {
            try {
                return await this.serial.readUntil(';')
            } catch (err) {
                console.warn(`Command ${cmd} timeout:`, err.message)
                return null
            }
        }
        return null
    }
    
    /** Small delay helper */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    /**
     * Format a memory channel number to 5-digit string
     * @param {number} channel - Memory channel number (1-999)
     * @returns {string} 5-digit channel string (e.g., "00001")
     */
    _formatChannel(channel) {
        return String(channel).padStart(5, '0')
    }

    /**
     * MC Command - Memory Channel load to VFO
     * Loads a memory channel to the VFO buffer for editing
     * Note: This is a Set command that doesn't return a response
     * @param {number} memNum - Memory channel number (1-999)
     * @returns {Promise<null>} Always returns null (no response expected)
     */
    async _mcCommand(memNum) {
        // MC format: MC0ccccc (0=MAIN VFO, 5-digit channel)
        // This is a Set command - no response expected
        const cmd = `MC0${this._formatChannel(memNum)}`
        console.log(`[MC] Sending: ${cmd}`)
        await this.execute(cmd, false)  // false = no response expected
        return null
    }

    /** 1. Backup Receiver State - Read and store transceiver settings */
    async backupState() {
        console.log("Backing up current receiver state...")
        
        // Read all transceiver settings including clarifiers
        const freq = await this.execute('FA')
        const mode = await this.execute('MD0')
        const toneMode = await this.execute('CT0')
        const ctcss = await this.execute('CN00')
        const dcs = await this.execute('CN01')
        
        // Read clarifier settings (RX and TX)
        const rxClrf = await this.execute('RC')  // RX Clarifier
        const txClrf = await this.execute('RT')  // TX Clarifier
        const clrfMode = await this.execute('FS') // Clarifier ON/OFF status
        
        // Store in object and log to console
        this.transceiverSettings = {
            freq: freq,
            mode: mode,
            toneMode: toneMode,
            ctcss: ctcss,
            dcs: dcs,
            rxClarifier: rxClrf,
            txClarifier: txClrf,
            clarifierMode: clrfMode
        }
        
        // Log to console as requested
        console.log("=== TRANSCEIVER SETTINGS ===")
        console.log("VFO Frequency:", freq)
        console.log("Mode:", mode)
        console.log("Tone Mode:", toneMode)
        console.log("CTCSS Tone:", ctcss)
        console.log("DCS Code:", dcs)
        console.log("RX Clarifier:", rxClrf)
        console.log("TX Clarifier:", txClrf)
        console.log("Clarifier Mode:", clrfMode)
        console.log("===========================")
        
        // Also store for restore
        this.stateBackup = {
            freq: freq,
            mode: mode,
            toneMode: toneMode,
            ctcss: ctcss,
            dcs: dcs,
            rxClarifier: rxClrf,
            txClarifier: txClrf,
            clarifierMode: clrfMode
        }
    }
    
    /** Get the transceiver settings object */
    getTransceiverSettings() {
        return this.transceiverSettings
    }

    /** 2. Restore Receiver State */
    async restoreState() {
        if (!this.stateBackup) return
        console.log("Restoring previous receiver state...")
        
        // Extract command from response and restore each setting
        const restoreSetting = async (response) => {
            if (response) {
                const cmd = this._extractCommand(response)
                if (cmd) await this.execute(cmd, false)
            }
        }
        
        await restoreSetting(this.stateBackup.freq)
        await restoreSetting(this.stateBackup.mode)
        await restoreSetting(this.stateBackup.toneMode)
        await restoreSetting(this.stateBackup.ctcss)
        await restoreSetting(this.stateBackup.dcs)
        await restoreSetting(this.stateBackup.rxClarifier)
        await restoreSetting(this.stateBackup.txClarifier)
        await restoreSetting(this.stateBackup.clarifierMode)
    }
    
    /** Extract command from response string */
    _extractCommand(response) {
        if (!response) return null
        // Response format: CMDvalue; (e.g., "FA145280000" or "MD04")
        // We need to extract CMDvalue for sending back
        const match = response.match(/^([A-Z]+[0-9A-F]+)/)
        return match ? match[1] : response
    }

    /** 
     * Upload repeaters from CHIRP CSV file to radio
     * @param {Array} entries - Array of CHIRP CSV entries
     */
    async uploadFromCsv(entries) {
        console.log(`Uploading ${entries.length} repeaters to radio...`)
        await this.backupState()
        
        let successCount = 0
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            const memNum = entry.Location || (i + 1)
            
            try {
                await this._uploadSingleMemory(memNum, entry)
                successCount++
                console.log(`Uploaded: ${memNum} - ${entry.Name || entry.Location}`)
            } catch (err) {
                console.error(`Failed to upload memory ${memNum}:`, err.message)
            }
            
            await this._delay(100) // Delay between memories
        }
        
        await this.restoreState()
        console.log(`Upload complete: ${successCount}/${entries.length} memories written`)
        return successCount
    }
    
    /** Upload single memory channel */
    async _uploadSingleMemory(memNum, entry) {
        const addr = String(memNum).padStart(3, '0')
        
        // Debug: Log entry details
        console.log(`[DEBUG] Upload memory ${addr}:`, {
            name: entry.Name,
            freq: entry.Frequency,
            duplex: entry.Duplex,
            offset: entry.Offset,
            tone: entry.Tone,
            rToneFreq: entry.rToneFreq,
            cToneFreq: entry.cToneFreq
        })
        
        // 1. Set Tone Mode FIRST (CT command) - before MA
        // Tone field: "", "Tone", "TSQL", "DTCS"
        const toneMode = this._chirpToToneMode(entry.Tone)
        console.log(`[DEBUG] Setting CT0${toneMode}`)
        await this.execute(`CT0${toneMode}`, false)
        await this._delay(50)
        
        // 2. Set CTCSS or DCS code (CN command) - before MA
        if (toneMode === '1' || toneMode === '2') {
            // CTCSS Tone
            const toneFreq = parseFloat(entry.cToneFreq) || parseFloat(entry.rToneFreq) || 100.0
            const idx = this._findCtcssIndex(toneFreq)
            const toneValue = CTCSS_TONES[idx] || 100.0
            console.log(`[DEBUG] Setting CTCSS CN00${String(idx).padStart(3, '0')} (${toneValue}Hz)`)
            await this.execute(`CN00${String(idx).padStart(3, '0')}`, false)
        } else if (toneMode === '3') {
            // DCS Code
            const dcsCode = entry.DtcsCode || '023'
            console.log(`[DEBUG] Setting DCS CN01${String(dcsCode).padStart(3, '0')}`)
            await this.execute(`CN01${String(dcsCode).padStart(3, '0')}`, false)
        }
        await this._delay(50)
        
        // 3. Build and send MW command
        const mwString = this._buildMwStringFromChirp(entry, memNum)
        console.log(`[DEBUG] MW Command: ${mwString}`)
        await this.execute(mwString, false)
        await this._delay(100)
        
        // 4. Set Memory Tag/Name (MT command) - use 5-digit channel
        const tagName = this._convertTagName(entry.Name || entry.Location)
        if (tagName) {
            const addr5 = this._formatChannel(memNum)
            const mtCmd = `MT${addr5}${tagName}`
            console.log(`[DEBUG] MT Command: ${mtCmd}`)
            await this.execute(mtCmd, false)
            await this._delay(100)
        }
    }
    
    /** Convert tag name to ASCII, max 12 chars */
    _convertTagName(name) {
        if (!name) return ''
        // Use CharConverter for German umlauts
        const converted = this.converter.toTag(name)
        // Pad with spaces to 12 chars
        return converted.padEnd(12, ' ').substring(0, 12)
    }
    
    /** Find CTCSS index for a given frequency */
    _findCtcssIndex(toneFreq) {
        if (!toneFreq) return 0
        let bestIdx = 0
        let bestDiff = Math.abs(CTCSS_TONES[0] - toneFreq)
        for (let i = 1; i < CTCSS_TONES.length; i++) {
            const diff = Math.abs(CTCSS_TONES[i] - toneFreq)
            if (diff < bestDiff) {
                bestDiff = diff
                bestIdx = i
            }
        }
        return bestIdx
    }

    /** Logic for Reading a range of memories */
    async getMemoryRange(start, end) {
        // Don't backup/restore here as it interferes with tone reading
        // We'll read current state, process, then restore at the end
        const originalState = await this._readCurrentState()
        
        const results = []

        for (let i = start; i <= end; i++) {
            const addr = this._formatChannel(i)

            // Use MR command to read memory - use 5 digit channel
            const mr = await this.execute(`MR${addr}`)
            if (!mr || mr.includes('?') || mr.length < 10) continue
            
            // Parse basic MR response
            const memoryData = this._parseMrResponse(mr)
            if (!memoryData) continue

            console.log(`[READ] Memory ${i}: MR response = '${mr}'`)
            // Tone mode is at data[25] in MR response (see _parseMrResponse)
            console.log(`[READ] Memory ${i}: MR tone mode char at data[25] = '${mr.charAt(25)}'`)

            // Use MA to load memory to VFO for reading tone settings
            // MA only loads frequency - tone settings stay at VFO defaults
            await this.execute(`MA`, false)
            await this._delay(50)
            
            // Read tone settings from VFO after MA
            const ct = await this.execute('CT0')
            const cn = await this.execute('CN00')
            const ds = await this.execute('CN01')
            const fa = await this.execute('FA')
            
            console.log(`[READ] Memory ${i}: After MA - CT=${ct}, CN00=${cn}, CN01=${ds}, FA=${fa}`)
            
            // Only trust CT/CN from VFO if MA/MC actually loaded this memory.
            const faFreq = fa && fa.startsWith('FA') ? parseInt(fa.substring(2), 10) : null
            const vfoMatchesMemory = Number.isFinite(faFreq) && faFreq === memoryData.rxFreq
            if (!vfoMatchesMemory) {
                console.log(`[READ] Memory ${i}: VFO frequency (${faFreq}) does not match memory (${memoryData.rxFreq}), keeping MR tone data`)
            } else {
                // Update tone info from VFO buffer
                if (ct && ct.length >= 4) {
                    // CT response is CT(P1)(P2);, tone mode is P2.
                    const toneModeChar = this._extractCtToneModeChar(ct)
                    memoryData.toneMode = this._charToToneMode(toneModeChar)
                    console.log(`[READ] Memory ${i}: Tone mode from CT = '${toneModeChar}' -> '${memoryData.toneMode}'`)
                }
                
                if (cn && cn.length >= 7) {
                    const cnValue = cn.substring(4, 7)
                    memoryData.ctcssIdx = parseInt(cnValue, 10)
                    if (memoryData.ctcssIdx !== null && !isNaN(memoryData.ctcssIdx) && CTCSS_TONES[memoryData.ctcssIdx]) {
                        memoryData.ctcssTone = CTCSS_TONES[memoryData.ctcssIdx]
                        console.log(`[READ] Memory ${i}: CTCSS idx=${memoryData.ctcssIdx}, tone=${memoryData.ctcssTone}Hz`)
                    }
                }
                
                if (ds && ds.length >= 7) {
                    memoryData.dcsCode = ds.substring(4, 7)
                    console.log(`[READ] Memory ${i}: DCS code=${memoryData.dcsCode}`)
                }
            }
            
            // Get memory tag - MT response is MTccccc[tag12]
            const mt = await this.execute(`MT${addr}`)
            if (mt && mt.length > 10) {
                // Skip "MT" (2) + channel (5) = 7 chars to get tag
                memoryData.tag = mt.substring(7).trim()
            }
            
            memoryData.memoryNumber = i
            results.push(memoryData)
            
            // Small delay between memories
            await this._delay(50)
        }

        // Restore original state at the end
        await this._restoreStateDirect(originalState)
        return results
    }
    
    /** Read current state without storing for restore */
    async _readCurrentState() {
        const freq = await this.execute('FA')
        const mode = await this.execute('MD0')
        const toneMode = await this.execute('CT0')
        const ctcss = await this.execute('CN00')
        const dcs = await this.execute('CN01')
        return { freq, mode, toneMode, ctcss, dcs }
    }
    
    /** Restore state directly from stored values */
    async _restoreStateDirect(state) {
        if (!state) return
        
        if (state.freq) await this.execute(state.freq.substring(0, 2) + state.freq.substring(2), false)
        if (state.mode) await this.execute(state.mode, false)
        if (state.toneMode) await this.execute(state.toneMode, false)
        if (state.ctcss) await this.execute(state.ctcss, false)
        if (state.dcs) await this.execute(state.dcs, false)
        
        await this._delay(100)
    }

    /** Parse MR response to extract memory data 
     * Format: MRccccc[fffffffff][X][ffff][RX][TX][M][C][T][ff][S];
     * Example: MR00001439362500-000000410002
     * Position in data (after MRcccccc): 
     *   0-8=freq, 9=clarSign, 10-13=clarFreq(4), 14=RX, 15=TX, 16=mode, 17=memFlag, 18=tone, 19-20=fixed, 21=shift
     */
    _parseMrResponse(mr) {
        // Full response: MRccccc[DATA];
        // We need to skip MR (2 chars) and the channel (5 chars) to get to frequency
        const data = mr.substring(7) // Skip "MR" (2) + channel (5) = 7
        if (data.length < 20) return null
        
        // Frequency is at data[0-8] (9 digits)
        const rxFreq = parseInt(data.substring(0, 9), 10)
        if (!rxFreq || rxFreq <= 0) return null
        
        // Position 9: Clarifier direction (+/-/S)
        const clarDir = data.charAt(9)
        
        // Position 10-13: Clarifier frequency (4 digits)
        const clarFreq = parseInt(data.substring(10, 14), 10) || 0
        
        // Position 14: RX Clarifier ON/OFF (0=off, 1=on)
        const rxClarOn = data.charAt(14)
        
        // Position 15: TX Clarifier ON/OFF (0=off, 1=on)
        const txClarOn = data.charAt(15)
        
        // Position 16: Mode
        const modeChar = data.charAt(16)
        
        // Position 17: Memory channel flag
        const memFlag = data.charAt(17)
        
        // Position 18: Tone mode (0=off, 1=CTCSS TX, 2=CTCSS RX/TX, 3=DCS, 4=PR FREQ, 5=REV TONE)
        const toneChar = data.charAt(18)
        
        // Position 19-20: Fixed (00)
        
        // Position 21: Repeater shift (0=simplex, 1=plus, 2=minus)
        const shiftChar = data.charAt(21)
        
        // Calculate TX frequency based on shift direction
        let offsetFreq = 0
        let txFreq = rxFreq
        
        return {
            rxFreq: rxFreq,
            txFreq: txFreq,
            offsetDirection: shiftChar === '1' ? 'PLUS' : shiftChar === '2' ? 'MINUS' : 'SIMPLEX',
            offsetFreq: offsetFreq,
            clarifierDir: clarDir,
            clarifierFreq: clarFreq,
            rxClarifierOn: rxClarOn === '1',
            txClarifierOn: txClarOn === '1',
            mode: this._modeCharToName(modeChar),
            memFlag: memFlag,
            toneMode: this._charToToneMode(toneChar),
            ctcssIdx: null,
            ctcssTone: null,
            dcsCode: null,
            tag: ''
        }
    }
    
    /** Convert mode character to name */
    _modeCharToName(char) {
        const modeMap = { '4': 'FM', '5': 'AM', 'B': 'NFM', '1': 'LSB', '2': 'USB' }
        return modeMap[char] || 'FM'
    }

    /** Logic for Writing a range of memories */
    async setMemoryRange(chirpEntries) {
        await this.backupState()

        for (const entry of chirpEntries) {
            const addr = String(entry.Location).padStart(3, '0')

            // 1. Target the channel
            await this.execute(`MA0${addr}`, false)

            // 2. Set Tones in active buffer
            const toneMode = this._chirpToToneMode(entry.Tone)
            await this.execute(`CT0${toneMode}`, false)

            if (toneMode === '1' || toneMode === '2') {
                const idx = String(CTCSS_TONES.indexOf(parseFloat(entry.cToneFreq))).padStart(3, '0')
                await this.execute(`CN00${idx}`, false)
            } else if (toneMode === '3') {
                await this.execute(`CN01${String(entry.DtcsCode).padStart(3, '0')}`, false)
            }

            // 3. Commit with Long MW string
            const mwString = this._buildMwString(entry)
            await this.execute(mwString, false)
        }

        await this.restoreState()
    }

    /** Helpers */
    _buildMwString(e) {
        const addr = String(e.Location).padStart(3, '0')
        const freq = String(Math.round(parseFloat(e.Frequency) * 1000000)).padStart(9, '0')
        const duplex = e.Duplex === '-' ? '-' : e.Duplex === '+' ? '+' : 'S'
        const offset = String(Math.round(parseFloat(e.Offset || 0) * 1000000)).padStart(8, '0')
        const mode = e.Mode === 'FM' ? '4' : '1' // Simplified
        return `MW${addr}${freq}${duplex}${offset}${mode}000000`
    }
    
    /** Build MW string from CHIRP entry 
     * Format: MWccccc[fffffffff][X][ffff][RX][TX][M][C][T][ff][S];
     * ccccc + fffffffff + X + ffff + R + T + M + C + T + ff + S
     * 5     + 9        + 1 + 4   + 1 + 1 + 1 + 1 + 1 + 2 + 1 = 27 chars
     */
    _buildMwStringFromChirp(entry, memNum) {
        // Channel: 5 digits
        const addr = this._formatChannel(memNum)
        
        // Frequency in Hz (9 digits)
        const freq = String(Math.round(parseFloat(entry.Frequency) * 1000000)).padStart(9, '0')
        
        // Clarifier direction: + (plus), - (minus), S (simplex/no offset)
        let clarDir = 'S'
        if (entry.Duplex === '+') clarDir = '+'
        else if (entry.Duplex === '-') clarDir = '-'
        
        // Clarifier frequency: 4 digits (0000 = no offset)
        const clarFreq = '0000'
        
        // RX Clarifier: 0=off, 1=on (not typically used for repeaters)
        const rxClar = '0'
        
        // TX Clarifier: 0=off, 1=on (not typically used for repeaters)
        const txClar = '0'
        
        // Mode: 4 = FM
        const mode = '4'
        
        // Memory channel flag: 1 = memory
        const memFlag = '1'
        
        // Tone mode: 0=off, 1=TSQL, 2=Tone, 3=DCS (MW Squelch Type - DIFFERENT from CT!)
        const toneMode = this._chirpToMwSquelchType(entry.Tone)
        
        // Fixed: 00
        const fixed = '00'
        
        // Shift direction: 0=simplex, 1=plus, 2=minus
        let shift = '0'
        if (entry.Duplex === '+') shift = '1'
        else if (entry.Duplex === '-') shift = '2'
        
        // Full MW: MW + ccccc + fffffffff + X + ffff + R + T + M + C + T + ff + S
        return `MW${addr}${freq}${clarDir}${clarFreq}${rxClar}${txClar}${mode}${memFlag}${toneMode}${fixed}${shift}`
    }

    _parseToChirp(loc, mr, ct, cn, ds) {
        // Parsing logic to map the 29-char MR string back to CSV fields...
        // Logic for converting CT, CN, DS back to 'Tone', 'rToneFreq' etc.
        return { Location: loc, Frequency: mr.substring(7, 16), Tone: ct.charAt(3) }
    }

    /**
     * Convert CHIRP tone field to CT command value
     * CT command values: 0=OFF, 1=Tone, 2=TSQL, 3=DCS
     */
    _chirpToToneMode(toneField) {
        if (toneField === 'Tone') return '1'
        if (toneField === 'TSQL') return '2'
        if (toneField === 'DTCS') return '3'
        return '0'
    }

    /**
     * Convert CHIRP tone field to MW Squelch Type value
     * MW Squelch Type values: 0=OFF, 1=TSQL, 2=Tone, 3=DCS
     * Note: These are DIFFERENT from CT command values!
     */
    _chirpToMwSquelchType(toneField) {
        if (toneField === 'Tone') return '2'  // Tone in MW is 2
        if (toneField === 'TSQL') return '1'  // TSQL in MW is 1
        if (toneField === 'DTCS') return '3'
        return '0'
    }
    
    _charToToneMode(char) {
        if (char === '1') return 'Tone'
        if (char === '2') return 'TSQL'
        if (char === '3' || char === '4') return 'DCS'
        return 'OFF'
    }

    /**
     * Parse CT response format CT(P1)(P2); and return P2 tone-mode character.
     * Example: CT03; -> '3'
     */
    _extractCtToneModeChar(ctResponse) {
        if (!ctResponse || ctResponse.length < 4) return null
        return ctResponse.charAt(3) || null
    }

    /**
     * MA Command - Load memory channel to VFO buffer
     * Returns complete memory data including tone settings
     * Note: MC+MA combination doesn't work correctly for CTCSS - use MA alone
     * @param {number} memNum - Memory channel number (1-999)
     * @returns {Object|null} Memory data object or null on error
     */
    async loadMemoryToVfo(memNum) {
        const addr = this._formatChannel(memNum)
        console.log(`[MC+MA] Loading memory ${addr} to VFO buffer...`)

        // MC selects the channel
        await this._mcCommand(memNum)
        await this._delay(50)

        // MA loads the selected memory to VFO
        await this.execute('MA', false)
        await this._delay(100)

        // After MA, read VFO settings to get complete data
        const fa = await this.execute('FA')
        const md = await this.execute('MD0')
        const ct = await this.execute('CT0')
        const cn00 = await this.execute('CN00')
        const cn01 = await this.execute('CN01')

        console.log(`[MA] VFO loaded: FA=${fa}, MD=${md}, CT=${ct}, CN00=${cn00}, CN01=${cn01}`)

        // Build memory data from MR response (MC doesn't return data)
        const mr = await this.execute(`MR${addr}`)
        let mcData = null
        if (mr && !mr.includes('?') && mr.length > 10) {
            mcData = this._parseMrResponse(mr)
        }

        if (mcData) {
            // Add VFO settings
            mcData.vfoFreq = fa ? parseInt(fa.substring(2), 10) : null
            mcData.vfoMode = md ? md.substring(2) : null
            const vfoToneModeChar = this._extractCtToneModeChar(ct)
            mcData.vfoToneMode = vfoToneModeChar ? this._charToToneMode(vfoToneModeChar) : null
            mcData.vfoCtcssIdx = cn00 ? parseInt(cn00.substring(4, 7), 10) : null
            mcData.vfoDcsCode = cn01 ? cn01.substring(4, 7) : null

            // Convert tone indices to actual values
            if (mcData.vfoCtcssIdx !== null && CTCSS_TONES[mcData.vfoCtcssIdx]) {
                mcData.vfoCtcssTone = CTCSS_TONES[mcData.vfoCtcssIdx]
            }
        }

        return mcData
    }

    /**
     * Verify memory channel - compare MR data vs MC+MA data
     * MC+MA loads memory to VFO, then CT/CN/FA read the actual tone settings
     * MR provides stored tone mode at position 23
     * @param {number} memNum - Memory channel number
     * @param {Object} expectedEntry - Optional expected CHIRP entry for comparison
     * @returns {Object} Verification result with comparison data
     */
    async verifyMemoryChannel(memNum, expectedEntry = null) {
        const addr = this._formatChannel(memNum)
        console.log(`\n=== Verifying Memory ${memNum} ===`)

        // Read via MR command (primary reliable source)
        console.log(`[VERIFY] Reading MR${addr}`)
        const mr = await this.execute(`MR${addr}`)
        let mrData = null
        if (mr && !mr.includes('?') && mr.length > 10) {
            mrData = this._parseMrResponse(mr)
            // Also get tag
            const mt = await this.execute(`MT${addr}`)
            if (mt && mt.length > 10) {
                mrData.tag = mt.substring(7).trim()
            }
            console.log(`[VERIFY] MR data: freq=${mrData?.rxFreq}, toneMode=${mrData?.toneMode}`)
        }

        // Use MC+MA to load memory to VFO and get tone settings
        console.log(`[VERIFY] Loading via MC+MA...`)
        const mcData = await this.loadMemoryToVfo(memNum)

        // Build result
        const result = {
            memoryNumber: memNum,
            mrData: mrData,
            mcData: mcData,
            match: false,
            differences: []
        }

        if (!mrData && !mcData) {
            result.differences.push('Memory channel appears to be empty')
            console.log(`[VERIFY] Match: false (memory empty)`)
            await this.restoreState()
            return result
        }

        // If we have expected entry from upload, compare against it
        if (expectedEntry) {
            const uploadTone = expectedEntry.Tone || ''
            const uploadToneFreq = parseFloat(expectedEntry.cToneFreq || expectedEntry.rToneFreq || '100.0')

            // Compare tone mode from MR
            const mrToneMode = mrData?.toneMode === 'Tone' ? 'Tone' :
                               mrData?.toneMode === 'TSQL' ? 'TSQL' :
                               mrData?.toneMode === 'DCS' ? 'DTCS' : ''

            if (uploadTone && uploadTone !== mrToneMode) {
                result.differences.push(`Tone mode mismatch: expected=${uploadTone}, MR=${mrToneMode}`)
            }
        }

        if (result.differences.length === 0) {
            result.match = true
            console.log(`[VERIFY] Match: true`)
        } else {
            console.log(`[VERIFY] Match: false`)
            console.log(`[VERIFY] Differences:`, result.differences)
        }

        // Restore original state
        await this.restoreState()

        return result
    }

    /**
     * Export memories to CHIRP CSV format
     * @param {Array} memories - Array of memory objects
     * @returns {string} CHIRP CSV formatted string
     */
    toChirpCsv(memories) {
        const lines = []
        
        // CHIRP CSV Header
        lines.push('Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment')
        
        for (const mem of memories) {
            if (!mem || !mem.rxFreq) continue
            
            const loc = mem.memoryNumber || mem.Location || ''
            const name = this._formatRepeaterName(mem)
            const freq = (mem.rxFreq / 1000000).toFixed(4)
            
            // Determine duplex/offset
            let duplex = ''
            let offset = ''
            if (mem.offsetDirection === 'PLUS') {
                duplex = '+'
                offset = (mem.offsetFreq / 1000000).toFixed(4)
            } else if (mem.offsetDirection === 'MINUS') {
                duplex = '-'
                offset = (mem.offsetFreq / 1000000).toFixed(4)
            }
            
            // Determine tone settings
            let tone = ''
            let rToneFreq = '100.0'
            let cToneFreq = '100.0'
            let dtcsCode = '023'
            
            if (mem.toneMode === 'Tone' || mem.toneMode === '1') {
                tone = 'Tone'
                const toneVal = mem.ctcssTone || mem.vfoCtcssTone || CTCSS_TONES[mem.ctcssIdx] || CTCSS_TONES[mem.vfoCtcssIdx] || 100.0
                rToneFreq = toneVal.toFixed(1)
                cToneFreq = toneVal.toFixed(1)
            } else if (mem.toneMode === 'TSQL' || mem.toneMode === '2') {
                tone = 'TSQL'
                const toneVal = mem.ctcssTone || mem.vfoCtcssTone || CTCSS_TONES[mem.ctcssIdx] || CTCSS_TONES[mem.vfoCtcssIdx] || 100.0
                rToneFreq = toneVal.toFixed(1)
                cToneFreq = toneVal.toFixed(1)
            } else if (mem.toneMode === 'DCS' || mem.toneMode === '4') {
                tone = 'DTCS'
                dtcsCode = mem.dcsCode || mem.vfoDcsCode || '023'
            }
            
            const mode = mem.mode || 'FM'
            const comment = mem.qth || mem.locator || ''
            
            // Format line (escape commas in name/comment)
            const safeName = name.includes(',') ? `"${name}"` : name
            const safeComment = comment.includes(',') ? `"${comment}"` : comment
            
            lines.push(`${loc},${safeName},${freq},${duplex},${offset},${tone},${rToneFreq},${cToneFreq},${dtcsCode},NN,${mode},12.5,,${safeComment}`)
        }
        
        return lines.join('\n')
    }

    /**
     * Format repeater name as "call/location"
     * Truncates to 12 characters if needed
     * @param {Object} mem - Memory object
     * @returns {string} Formatted name
     */
    _formatRepeaterName(mem) {
        let call = mem.call || mem.Name || mem.tag || ''
        let location = mem.location || mem.qth || ''
        
        // Remove any existing slashes from call
        call = call.replace(/\//g, '')
        
        // Build name in "call/location" format
        let name = ''
        if (call && location) {
            name = `${call}/${location}`
        } else if (call) {
            name = call
        } else if (location) {
            name = location
        } else {
            name = `MEM${mem.memoryNumber || mem.Location || ''}`
        }
        
        // Convert special characters
        name = this.converter.toTag(name)
        
        // Truncate to 12 characters if needed
        if (name.length > 12) {
            // Try to keep as much of call and location as possible
            const maxCallLen = 6
            const minLocLen = 2
            if (call.length > maxCallLen) {
                call = call.substring(0, maxCallLen)
            }
            const remaining = 12 - call.length - 1 // -1 for slash
            if (remaining >= minLocLen) {
                location = location.substring(0, remaining)
                name = `${call}/${location}`
            } else {
                name = name.substring(0, 12)
            }
        }
        
        return name
    }

    /**
     * Upload single memory with enhanced tag handling
     * @param {number} memNum - Memory channel number
     * @param {Object} entry - CHIRP entry object
     */
    async uploadSingleMemory(memNum, entry) {
        const addr = String(memNum).padStart(3, '0')
        
        // Build entry with enhanced name format
        const enhancedEntry = { ...entry }
        
        // Format name as call/location if not already set
        if (!enhancedEntry.Name && entry.Location) {
            enhancedEntry.Name = this._formatRepeaterName({
                call: entry.call || '',
                location: entry.location || '',
                memoryNumber: entry.Location
            })
        }
        
        await this._uploadSingleMemory(memNum, enhancedEntry)
    }
}
