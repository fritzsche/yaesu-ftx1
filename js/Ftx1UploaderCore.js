/**
 * FTX-1 Uploader Core
 *
 * Pure business logic for uploading memory channels to Yaesu FTX-1 radio.
 * This module is browser-compatible (no Node.js dependencies).
 *
 * Upload Strategy:
 * - Digital (DN/C4FM): Use MW command directly (frequency + mode embedded in MW)
 * - Analog WITH tone: Use MW + MA + setToneSettings + AM sequence
 * - Analog WITHOUT tone: Use MW command directly (simple, fast)
 *
 * CAT Command Reference:
 * - VM000; - Set VFO mode
 * - VM; - Switch to Memory mode
 * - FA#########; - Set frequency (9-digit Hz)
 * - CT0X; - Set tone mode (0=OFF, 1=Tone, 2=TSQL, 3=DCS)
 * - CN00###; - Set CTCSS frequency (index 000-049)
 * - CN01###; - Set DCS code (000-103)
 * - MC0nnnnn; - Select memory channel (6 chars: MC + 0 + 5-digit channel)
 * - MW...; - Memory Write (29 chars data + semicolon)
 * - MA; - Memory to VFO (loads selected memory into VFO)
 * - AM; - VFO-A to Memory (stores current VFO state to memory channel)
 * - MTccccc...; - Set memory tag (5-digit channel + 12-char name)
 */

import { CTCSS_TONES, isFrequencySupported } from './constants.js'
import CharConverter from './CharConverter.js'

/**
 * Supported modes for FTX-1 transceiver
 * Used to filter entries during CSV import
 */
export const FTX1_SUPPORTED_MODES = ['FM', 'NFM', 'AM', 'USB', 'LSB', 'CW', 'C4FM', 'DN', 'WIRES-X']

/**
 * Ftx1UploaderCore - Pure upload logic without serial dependencies
 *
 * @param {Object} serialInterface - Serial interface implementing connect(), send(), readUntil(), close()
 */
export class Ftx1UploaderCore {
    constructor(serialInterface) {
        if (!serialInterface) {
            throw new Error('serialInterface is required')
        }
        this.serial = serialInterface
        this.debug = false
    }

    setDebug(enable) {
        this.debug = enable
    }

    /**
     * Execute CAT command via serial interface
     * @param {string} cmd - CAT command
     * @param {boolean} expectResponse - Whether to wait for response
     * @returns {string|null} Response if expectResponse is true
     */
    async execute(cmd, expectResponse = true) {
        if (this.debug) {
            console.log(`>>> ${cmd};`)
        }
        await this.serial.send(`${cmd};`)
        if (expectResponse) {
            try {
                const response = await this.serial.readUntil(';')
                if (this.debug && response) {
                    console.log(`<<< ${response}`)
                }
                return response
            } catch (err) {
                return null
            }
        }
        return null
    }

    /**
     * Connect to radio via serial interface
     */
    async connect() {
        await this.serial.connect()
    }

    /**
     * Close serial connection
     */
    async close() {
        await this.serial.close()
    }

    /**
     * Normalize entry fields to handle both CHIRP and repeater CSV formats
     * @param {Object} entry - Entry from CSV parser
     * @returns {Object} Normalized entry
     */
    _normalizeEntry(entry) {
        // CHIRP format: Frequency in MHz string, Tone = 'Tone'/'TSQL'/'DTCS'/''
        // Repeater format: rxFreq in Hz number, toneMode = 'TONE'/'OFF'

        // Determine duplex from offsetDirection for repeater CSV
        let duplex = entry.Duplex || ''
        if (!duplex && entry.offsetDirection) {
            if (entry.offsetDirection === 'MINUS') duplex = '-'
            else if (entry.offsetDirection === 'PLUS') duplex = '+'
            else duplex = ''
        }

        // Determine offset in MHz
        let offset = entry.Offset || ''
        if (!offset && entry.offsetFreq) {
            offset = (entry.offsetFreq / 1000000).toFixed(4)
        }

        const normalized = {
            name: entry.Name || entry.name || '',
            frequency: entry.Frequency || (entry.rxFreq ? (entry.rxFreq / 1000000).toFixed(5) : '0'),
            duplex: duplex,
            offset: offset,
            tone: entry.Tone || (entry.toneMode === 'TONE' ? 'Tone' : ''),
            rToneFreq: entry.rToneFreq || (entry.ctcssTone ? String(entry.ctcssTone) : '100.0'),
            cToneFreq: entry.cToneFreq || (entry.ctcssTone ? String(entry.ctcssTone) : '100.0'),
            dcsCode: entry.DtcsCode || entry.dcsCode || '023',
            mode: entry.Mode || entry.mode || 'FM',
            comment: entry.Comment || entry.qth || ''
        }
        return normalized
    }

    /**
     * Build MW command string from entry
     * Format: MW + 5-digit channel + 9-digit freq + dir + offset + RX + TX + mode + VFO/mem + CTCSS + 00 + shift
     */
    buildMwCommand(memNum, entry) {
        const ch = String(memNum).padStart(5, '0')
        // Handle both CHIRP (Frequency) and normalized (frequency) formats
        const freqStr = entry.Frequency || entry.frequency || '0'
        const freq = String(Math.round(parseFloat(freqStr) * 1000000)).padStart(9, '0')

        // Clarifier direction - MUST be + or - (S is not valid!)
        // MW always uses + for clarifier direction
        let clarDir = '+'
        const duplex = entry.duplex || entry.Duplex || ''

        const clarOffset = '0000'
        const rxClar = '0'
        const txClar = '0'

        // Operating mode: 4=FM, 5=AM, B=NFM, H=C4FM/DN
        const entryMode = (entry.mode || entry.Mode || 'FM').toUpperCase()
        let mode = '4' // FM default
        if (entryMode === 'NFM' || entryMode === 'FM-N') mode = 'B'
        else if (entryMode === 'AM') mode = '5'
        else if (entryMode === 'USB') mode = '2'
        else if (entryMode === 'LSB') mode = '1'
        else if (entryMode === 'DN' || entryMode === 'C4FM') mode = 'H'

        // Tone mode for MW squelch type (differs from CT!)
        // MW: 0=OFF, 1=TSQL, 2=Tone, 3=DCS
        let ctcssMode = '0'
        let tone = '0'

        if (entryMode === 'FM' || entryMode === 'NFM') {
            tone = entry.tone || entry.Tone || ''
            if (tone === 'TSQL') ctcssMode = '1'
            else if (tone === 'Tone') ctcssMode = '2'
            else if (tone === 'DTCS') ctcssMode = '3'
        }
        const fixed = '00'

        // Shift: 0=simplex, 1=plus, 2=minus
        let shift = '0'
        if (duplex === '+') shift = '1'
        else if (duplex === '-') shift = '2'

        return `MW${ch}${freq}${clarDir}${clarOffset}${rxClar}${txClar}${mode}1${ctcssMode}${fixed}${shift}`
    }

    /**
     * Find CTCSS index for a frequency
     * @param {number} freq - CTCSS frequency in Hz
     * @returns {number} Index into CTCSS_TONES array
     */
    findCtcssIndex(freq) {
        if (!freq) return 0
        let bestIdx = 0
        let bestDiff = Math.abs((CTCSS_TONES[0] || 0) - freq)
        for (let i = 1; i < CTCSS_TONES.length; i++) {
            const diff = Math.abs((CTCSS_TONES[i] || 0) - freq)
            if (diff < bestDiff) {
                bestDiff = diff
                bestIdx = i
            }
        }
        return bestIdx
    }

    /**
     * Set tone/DCS settings from entry
     */
    async setToneSettings(entry) {
        const mode = (entry.mode || entry.Mode || 'FM').toUpperCase()
        if (mode !== 'FM') {
            await this.execute('CT00', false)
            return
        }

        const tone = entry.tone || entry.Tone || ''
        // Get actual CTCSS tone frequency if present
        const ctcssFreq = entry.cToneFreq || entry.rToneFreq || entry.ctcssTone
        const hasCtcssFreq = ctcssFreq && !isNaN(parseFloat(ctcssFreq))


        if (tone === 'Tone' && hasCtcssFreq) {
            await this.execute('CT01', false)
            await this.delay(50)
            const idx = this.findCtcssIndex(parseFloat(ctcssFreq))
            await this.execute(`CN00${String(idx).padStart(3, '0')}`, false)

        } else if (tone === 'TSQL' && hasCtcssFreq) {
            await this.execute('CT02', false)
            await this.delay(50)
            const idx = this.findCtcssIndex(parseFloat(ctcssFreq))
            await this.execute(`CN00${String(idx).padStart(3, '0')}`, false)

        } else if (tone === 'DTCS') {
            await this.execute('CT03', false)
            await this.delay(50)
            const dcsCode = String(entry.dcsCode || entry.DtcsCode || '023').padStart(3, '0')
            await this.execute(`CN01${dcsCode}`, false)

        } else {
            // No valid tone settings - disable tone
            await this.execute('CT00', false)
        }

        await this.delay(50)
    }

    /**
     * Set VFO mode
     */
    async setVfoMode() {
        await this.execute('VM000', false)
        await this.delay(100)
    }

    /**
     * Set operating mode (MD command)
     */
    async setMode(entry) {
        const mode = (entry.mode || entry.Mode || 'FM').toUpperCase()
        let modeCode = '4' // FM default
        if (mode === 'NFM' || mode === 'FM-N') modeCode = 'B'
        else if (mode === 'AM') modeCode = '5'
        else if (mode === 'USB') modeCode = '2'
        else if (mode === 'LSB') modeCode = '1'
        else if (mode === 'DN' || mode === 'C4FM') modeCode = 'H'
        await this.execute(`MD0${modeCode}`, false)
        await this.delay(50)
    }

    /**
     * Switch to Memory mode
     */
    async setMemoryMode() {
        await this.execute('VM', false)
        await this.delay(100)
    }

    /**
     * Set VFO frequency
     */
    async setFrequency(freqMhz) {
        const freqHz = String(Math.round(parseFloat(freqMhz) * 1000000)).padStart(9, '0')
        await this.execute(`FA${freqHz}`, false)
        await this.delay(50)
    }

    /**
     * Set memory tag (name)
     */
    async setMemoryTag(memNum, entry) {
        const converter = new CharConverter()
        // Build tag as "Callsign-City" and convert to ASCII
        const callsign = (entry.Name || entry.name || entry.tag || '').trim()
        const city = (entry.Comment || entry.comment || '').trim()
        const rawTag = `${callsign}${city ? '-' + city : ''}`
        // Convert non-ASCII characters (German umlauts, etc.) to ASCII equivalents
        const tag = converter.toTag(rawTag)

        if (tag.length > 0) {
            const ch = String(memNum).padStart(5, '0')
            const tagPadded = tag.padEnd(12, ' ')
            await this.execute(`MT${ch}${tagPadded}`, false)
            await this.delay(100)
        }
    }

    /**
     * Write memory using MW command (for entries without tone/DCS and not DN mode)
     */
    async writeMemoryWithMw(memNum, entry) {
        const mwCmd = this.buildMwCommand(memNum, entry)
        // MW returns no response normally, but may return ?; on error
        // Only check response in debug mode to avoid unnecessary timeout delays
        if (this.debug) {
            const response = await this.execute(mwCmd, true)
            if (response && response.includes('?')) {
                throw new Error(`MW command failed: ${response}`)
            }
        } else {
            await this.execute(mwCmd, false)
        }
    }

    /**
     * Write memory using MW + MA + AM sequence (for entries with tone/DCS)
     *
     * Sequence:
     * 1. MWccccc...; - Write memory channel (creates channel with basic data)
     * 2. MC0nnnnn; - Select target memory channel (loads it into VFO)
     * 3. VM000; - Switch to VFO mode
     * 4. MA; - Load memory into VFO (ensures we're working with this memory's VFO data)
     * 5. setToneSettings; - Set tone/CTCSS (disables tone for non-FM modes)
     * 6. AM; - Store VFO state to memory channel
     */
    async writeMemoryWithAm(memNum, entry) {
        const mwCmd = this.buildMwCommand(memNum, entry)
        await this.execute(mwCmd, false)

        // Select the target memory channel (MC doesn't return a response)
        const mcCmd = `MC0${String(memNum).padStart(5, '0')}`
        await this.execute(mcCmd, false)

        await this.setVfoMode()

        // Load memory into VFO (MA doesn't return a response)
        await this.execute('MA', false)

        // Set tone/CTCSS settings (disables tone for non-FM modes)
        await this.setToneSettings(entry)

        // AM; stores VFO state to memory channel
        await this.execute('AM', false)
    }

    /**
     * Upload single entry to specified memory channel
     * @param {number} memNum - Memory channel number (1-999)
     * @param {Object} entry - CHIRP or repeater CSV entry
     */
    async uploadSingleEntry(memNum, entry) {
        const norm = this._normalizeEntry(entry)
        const isDnMode = (norm.mode || '').toUpperCase() === 'DN' || (norm.mode || '').toUpperCase() === 'C4FM'
        const hasTone = !isDnMode && norm.tone && norm.tone !== ''

        // Step 1: Write memory channel
        // - Digital (DN/C4FM): MW command directly
        // - Analog with tone: Use writeMemoryWithAm (MW + MA + setToneSettings + AM)
        // - Analog without tone: Use MW directly
        if (isDnMode) {
            // Digital mode - MW already has frequency and mode embedded
            await this.writeMemoryWithMw(memNum, norm)
        } else if (hasTone) {
            // Analog with tone - writeMemoryWithAm handles all settings
            await this.writeMemoryWithAm(memNum, norm)
        } else {
            // Analog without tone - set frequency then MW
            await this.setFrequency(norm.frequency)
            await this.writeMemoryWithMw(memNum, norm)
        }

        // Step 2: Set memory tag
        await this.setMemoryTag(memNum, norm)

        return true
    }

    /**
     * Upload array of entries with progress callbacks
     * @param {Array} entries - Array of CHIRP entry objects
     * @param {Object} options - Upload options
     * @param {number} options.startMem - Starting memory channel
     * @param {boolean} options.restoreState - Whether to restore VFO state (default: true)
     * @param {Function} options.onProgress - Progress callback
     * @param {Function} options.onLog - Log message callback
     */
    async uploadEntries(entries, options = {}) {
        const startMem = options.startMem || 1
        const restoreState = options.restoreState !== false
        const onProgress = options.onProgress || (() => {})
        const onLog = options.onLog || (() => {})

        const results = {
            total: entries.length,
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        }

        onLog(`\n========================================`)
        onLog(`FTX-1 Memory Uploader`)
        onLog(`========================================\n`)
        onLog(`Uploading ${entries.length} entries...\n`)

        // Backup current radio state if we need to restore it
        let stateBackup = null
        if (restoreState) {
            stateBackup = await this.backupState()
        }

        // Set VFO mode once at the start (required before MW)
        await this.setVfoMode()

        let currentMemNum = startMem
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]

            // Report progress
            onProgress({
                phase: 'uploading',
                current: i + 1,
                total: entries.length,
                currentEntry: entry,
                message: `Processing ${entry.Name || entry.tag || entry.name}`
            })

            try {
                // Get frequency for validation (repeater CSV uses rxFreq in Hz, CHIRP uses Frequency in MHz)
                const freqHz = entry.rxFreq || (entry.Frequency ? parseFloat(entry.Frequency) * 1000000 : 0)
                const freqMhz = entry.Frequency || (entry.rxFreq ? entry.rxFreq / 1000000 : 0)

                // Validate frequency is supported
                if (freqHz > 0 && !isFrequencySupported(freqHz)) {
                    results.skipped++
                    const msg = `Skipping: ${entry.Name || entry.tag || entry.name} (frequency ${freqMhz} MHz not supported)`
                    onLog(msg)
                    continue
                }

                // Use Location from entry if available, otherwise auto-increment
                let memNum = parseInt(entry.Location) || 0

                // If Location is invalid (< 1 or > 999), use auto-incremented number
                if (memNum < 1 || memNum > 999) {
                    memNum = currentMemNum++
                }

                if (memNum < 1 || memNum > 999) {
                    results.skipped++
                    const msg = `Skipping: ${entry.Name || entry.tag} (memory ${memNum} out of range)`
                    onLog(msg)
                    continue
                }

                await this.uploadSingleEntry(memNum, entry)
                results.success++
                onLog(`Uploaded: ${memNum} - ${entry.Name || entry.tag || entry.name}`)

            } catch (err) {
                results.failed++
                results.errors.push({ entry: entry.Name || entry.tag, error: err.message })
                onLog(`Failed: ${entry.Name || entry.tag} - ${err.message}`)
            }

            await this.delay(150)
        }

        // Restore original radio state
        if (restoreState && stateBackup) {
            await this.restoreState(stateBackup)
        }

        onLog(`\n========================================`)
        onLog(`Upload complete`)
        onLog(`========================================`)
        onLog(`Total: ${results.total}`)
        onLog(`Success: ${results.success}`)
        onLog(`Failed: ${results.failed}`)
        onLog(`Skipped: ${results.skipped}`)
        onLog(`========================================\n`)

        onProgress({
            phase: 'complete',
            current: results.success,
            total: results.total,
            currentEntry: null,
            message: 'Upload complete'
        })

        return results
    }

    /**
     * Backup current VFO state (frequency, mode, tone settings)
     * @returns {Object} Backup object with current settings
     */
    async backupState() {
        const freq = await this.execute('FA')
        const mode = await this.execute('MD0')
        const toneMode = await this.execute('CT0')
        const ctcss = await this.execute('CN00')
        const dcs = await this.execute('CN01')

        return {
            frequency: freq,
            mode: mode,
            toneMode: toneMode,
            ctcss: ctcss,
            dcs: dcs
        }
    }

    /**
     * Restore VFO state from backup
     * @param {Object} state - State backup object
     */
    async restoreState(state) {
        if (!state) return

        // Restore frequency
        if (state.frequency) {
            const freqMatch = state.frequency.match(/FA(\d+)/)
            if (freqMatch) {
                await this.execute(`FA${freqMatch[1]}`, false)
                await this.delay(50)
            }
        }

        // Restore mode (MD04; -> extract MD04 to send as set command)
        if (state.mode) {
            const modeMatch = state.mode.match(/(MD\d.)/)
            if (modeMatch) {
                await this.execute(modeMatch[1], false)
                await this.delay(50)
            }
        }

        // Restore tone mode (CT01; -> extract CT01 to send as set command)
        if (state.toneMode) {
            const toneMatch = state.toneMode.match(/(CT\d.)/)
            if (toneMatch) {
                await this.execute(toneMatch[1], false)
                await this.delay(50)
            }
        }

        // Restore CTCSS
        if (state.ctcss) {
            const ctcssMatch = state.ctcss.match(/(CN\d+)/)
            if (ctcssMatch) {
                await this.execute(ctcssMatch[1], false)
                await this.delay(50)
            }
        }

        // Restore DCS
        if (state.dcs) {
            const dcsMatch = state.dcs.match(/(CN\d+)/)
            if (dcsMatch) {
                await this.execute(dcsMatch[1], false)
                await this.delay(50)
            }
        }

        await this.delay(100)
    }

    /**
     * Small delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
