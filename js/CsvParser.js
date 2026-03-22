/**
 * CsvParser - Handles CSV import/export for repeater lists and maintenance data.
 * Exports a single class.
 */
export default class CsvParser {
    /**
     * Parse CHIRP CSV format
     * Comma-separated with columns: Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,...
     * @param {string} csvText
     * @param {Object} options - Parsing options
     * @param {Array<string>} options.supportedModes - List of supported modes (case-insensitive). If empty, all modes are allowed.
     * @returns {Array<Object>} Array with CHIRP fields
     */
    parseChirpCsv(csvText, options = {}) {
        const supportedModes = (options.supportedModes || []).map(m => m.toUpperCase())
        const lines = csvText.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) return []

        const header = this._parseCsvLine(lines[0])
        const colMap = {}
        header.forEach((h, i) => { colMap[h.trim()] = i })

        const entries = []
        for (let i = 1; i < lines.length; i++) {
            const cols = this._parseCsvLine(lines[i])
            if (cols.length < 5) continue

            const get = (name) => {
                const idx = colMap[name]
                return idx !== undefined && idx < cols.length ? cols[idx].trim() : ''
            }

            const rawMode = get('Mode') || ''
            const normalizedMode = this._normalizeMode(rawMode)

            // Filter by supported modes if specified
            if (supportedModes.length > 0 && !this._isModeSupported(normalizedMode, supportedModes)) {
                continue
            }

            entries.push({
                Location: get('Location'),
                Name: get('Name'),
                Frequency: get('Frequency'),
                Duplex: get('Duplex'),
                Offset: get('Offset'),
                Tone: get('Tone'),
                rToneFreq: get('rToneFreq'),
                cToneFreq: get('cToneFreq'),
                DtcsCode: get('DtcsCode'),
                Mode: normalizedMode,
                Comment: get('Comment')
            })
        }
        return entries
    }

    /**
     * Parse CSV file - auto-detects format
     * @param {string} filePath
     * @param {Object} options - Parsing options
     * @param {Array<string>} options.supportedModes - List of supported modes (case-insensitive). If empty, all modes are allowed.
     * @returns {Promise<Array<Object>>}
     */
    static async parseFile(filePath, options = {}) {
        const fs = await import('fs')
        const csvText = fs.readFileSync(filePath, 'utf8')
        const firstLine = csvText.split(/\r?\n/)[0]
        const parser = new CsvParser()

        if (firstLine.includes(';')) {
            // Semicolon format - repeater CSV
            const CharConverter = (await import('./CharConverter.js')).default
            return parser.parseRepeaterCsv(csvText, new CharConverter(), options)
        } else if (firstLine.includes('Location') && firstLine.includes('Frequency')) {
            // CHIRP format
            return parser.parseChirpCsv(csvText, options)
        } else {
            // Default to CHIRP format
            return parser.parseChirpCsv(csvText, options)
        }
    }

    /**
     * Parse repeater CSV from relais.dl3el.de format
     * Semicolon-separated, German number format
     * @param {string} csvText
     * @param {import('./CharConverter.js').default} converter
     * @param {Object} options - Parsing options
     * @param {Array<string>} options.supportedModes - List of supported modes (case-insensitive). If empty, all modes are allowed.
     * @returns {Array<Object>} Array of memory entry objects
     */
    parseRepeaterCsv(csvText, converter, options = {}) {
        const supportedModes = (options.supportedModes || []).map(m => m.toUpperCase())
        const lines = csvText.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) return []

        const header = this._parseSemicolonLine(lines[0])
        const colMap = {}
        header.forEach((h, i) => { colMap[h.trim()] = i })

        const entries = []
        for (let i = 1; i < lines.length; i++) {
            const cols = this._parseSemicolonLine(lines[i])
            if (cols.length < 3) continue

            const get = (name) => {
                const idx = colMap[name]
                return idx !== undefined && idx < cols.length ? cols[idx].trim() : ''
            }

            const rxFreqStr = get('QRG') || get('Frequenz') || get('RX') || get('Ausgabe')
            const txFreqStr = get('Input') || get('Ablage') || get('TX') || get('Eingabe')
            const name = get('Call') || get('Name') || get('Rufzeichen') || ''
            const toneStr = get('CTCSS') || get('Subton') || ''
            const locator = get('Locator') || ''
            const qth = get('Info') || get('Standort') || get('QTH') || ''
            const modeRaw = get('Mode/Node') || get('Betriebsart') || get('Mode') || ''
            const normalizedMode = this._normalizeRepeaterMode(modeRaw)

            // Filter by supported modes if specified
            if (supportedModes.length > 0 && !this._isModeSupported(normalizedMode, supportedModes)) {
                continue
            }

            const rxHz = converter.parseFrequencyMHz(rxFreqStr)
            if (!rxHz) continue

            let txHz = converter.parseFrequencyMHz(txFreqStr)
            // If TX field looks like an offset (e.g. "-7,6"), calculate from RX
            if (!txHz && txFreqStr) {
                const offsetMHz = parseFloat(txFreqStr.replace(',', '.'))
                if (!isNaN(offsetMHz)) {
                    txHz = Math.round(rxHz + offsetMHz * 1000000)
                }
            }
            if (!txHz) txHz = rxHz

            const ctcss = converter.parseCtcssTone(toneStr)
            const tag = converter.toTag(name || qth)

            entries.push({
                memoryNumber: null,
                tag: tag,
                rxFreq: rxHz,
                txFreq: txHz,
                mode: normalizedMode,
                ctcssTone: ctcss,
                dcsCode: null,
                offsetDirection: this._calcOffsetDir(rxHz, txHz),
                offsetFreq: Math.abs(txHz - rxHz),
                toneMode: ctcss ? 'TONE' : 'OFF',
                name: name,
                locator: locator,
                qth: qth,
                selected: false,
                source: 'repeater-import'
            })
        }
        return entries
    }

    /**
     * Parse maintenance CSV (our own export format)
     * @param {string} csvText
     * @returns {Array<Object>}
     */
    parseMaintenanceCsv(csvText) {
        const lines = csvText.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) return []

        const header = this._parseCsvLine(lines[0])
        const colMap = {}
        header.forEach((h, i) => { colMap[h.trim()] = i })

        const entries = []
        for (let i = 1; i < lines.length; i++) {
            const cols = this._parseCsvLine(lines[i])
            if (cols.length < 3) continue

            const get = (name) => {
                const idx = colMap[name]
                return idx !== undefined && idx < cols.length ? cols[idx].trim() : ''
            }

            const memNum = parseInt(get('MemoryNumber'), 10)
            const rxFreq = parseInt(get('RxFreqHz'), 10)
            const txFreq = parseInt(get('TxFreqHz'), 10)
            if (isNaN(rxFreq) || rxFreq <= 0) continue

            entries.push({
                memoryNumber: isNaN(memNum) ? null : memNum,
                tag: get('Tag') || '',
                rxFreq: rxFreq,
                txFreq: isNaN(txFreq) ? rxFreq : txFreq,
                mode: get('Mode') || 'FM',
                ctcssTone: get('CtcssTone') ? parseFloat(get('CtcssTone')) : null,
                dcsCode: get('DcsCode') || null,
                offsetDirection: get('OffsetDir') || 'SIMPLEX',
                offsetFreq: parseInt(get('OffsetFreqHz'), 10) || 0,
                toneMode: get('ToneMode') || 'OFF',
                name: get('Name') || '',
                locator: get('Locator') || '',
                qth: get('QTH') || '',
                selected: get('Selected') === 'true',
                source: get('Source') || 'csv-import'
            })
        }
        return entries
    }

    /**
     * Export entries to maintenance CSV string
     * @param {Array<Object>} entries
     * @returns {string}
     */
    exportMaintenanceCsv(entries) {
        const headers = [
            'MemoryNumber', 'Tag', 'RxFreqHz', 'TxFreqHz', 'Mode',
            'CtcssTone', 'DcsCode', 'OffsetDir', 'OffsetFreqHz',
            'ToneMode', 'Name', 'Locator', 'QTH', 'Selected', 'Source'
        ]
        const lines = [headers.join(',')]
        for (const e of entries) {
            const row = [
                e.memoryNumber ?? '',
                this._escapeCsvField(e.tag || ''),
                e.rxFreq || '',
                e.txFreq || '',
                e.mode || 'FM',
                e.ctcssTone ?? '',
                e.dcsCode ?? '',
                e.offsetDirection || 'SIMPLEX',
                e.offsetFreq || 0,
                e.toneMode || 'OFF',
                this._escapeCsvField(e.name || ''),
                e.locator || '',
                this._escapeCsvField(e.qth || ''),
                e.selected ? 'true' : 'false',
                e.source || ''
            ]
            lines.push(row.join(','))
        }
        return lines.join('\n')
    }

    _parseSemicolonLine(line) {
        return line.split(';').map(f => f.trim().replace(/^"|"$/g, ''))
    }

    _parseCsvLine(line) {
        const fields = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]
            if (inQuotes) {
                if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
                    current += '"'
                    i++
                } else if (ch === '"') {
                    inQuotes = false
                } else {
                    current += ch
                }
            } else {
                if (ch === '"') {
                    inQuotes = true
                } else if (ch === ',') {
                    fields.push(current)
                    current = ''
                } else {
                    current += ch
                }
            }
        }
        fields.push(current)
        return fields
    }

    _escapeCsvField(val) {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return '"' + val.replace(/"/g, '""') + '"'
        }
        return val
    }

    _normalizeMode(mode) {
        const m = (mode || '').toUpperCase().trim()
        if (!m) return 'FM'
        // WIRES-X with C4FM digital
        if (m.includes('C4FM') || m.includes('W-X#C4') || m.includes('DN')) return 'DN'
        // EchoLink nodes - default to FM
        if (m.startsWith('EL#') || m.startsWith('EL ')) return 'FM'
        // WIRES-X nodes without C4FM marker
        if (m.startsWith('W-X#') || m.startsWith('W-X')) return 'FM'
        if (m.includes('FM') && m.includes('N')) return 'NFM'
        if (m.includes('FM')) return 'FM'
        if (m.includes('AM')) return 'AM'
        if (m.includes('USB')) return 'USB'
        if (m.includes('LSB')) return 'LSB'
        return 'FM'
    }

    _calcOffsetDir(rxHz, txHz) {
        if (!rxHz || !txHz || rxHz === txHz) return 'SIMPLEX'
        return txHz > rxHz ? 'PLUS' : 'MINUS'
    }

    /**
     * Normalize repeater CSV mode to standard mode name
     * @param {string} modeRaw - Raw mode string from CSV
     * @returns {string} Normalized mode (FM, NFM, AM, USB, LSB, DN, etc.)
     */
    _normalizeRepeaterMode(modeRaw) {
        const m = (modeRaw || '').toUpperCase().trim()
        if (!m) return 'FM'

        // D-Star modes (A, B, C) - NOT supported by FTX-1
        if (['A', 'B', 'C'].includes(m)) return 'DSTAR'

        // WIRES-X C4FM digital
        if (m.includes('W-X#C4')) return 'DN'
        // WIRES-X room numbers (e.g., W-x#76582) - treat as DN
        if (m.startsWith('W-X#') || m.startsWith('W-X')) return 'DN'

        // YSF (Yaesu System Fusion) - some are accessible via WIRES-X, treat as DN
        if (m.includes('YSF')) return 'DN'

        // Digital modes not supported by FTX-1
        if (m.includes('DMR') || m.includes('BRANDMEISTER')) return 'DMR'
        if (m.includes('D-STAR') || m.includes('DSTAR')) return 'DSTAR'
        if (m.includes('TETRA')) return 'TETRA'

        // Standard analog modes
        if (m.includes('FM') && m.includes('N')) return 'NFM'
        if (m.includes('FM')) return 'FM'
        if (m.includes('AM')) return 'AM'
        if (m.includes('USB')) return 'USB'
        if (m.includes('LSB')) return 'LSB'
        if (m.includes('CW')) return 'CW'

        return 'FM'
    }

    /**
     * Check if a mode is in the list of supported modes
     * @param {string} mode - Normalized mode to check
     * @param {Array<string>} supportedModes - Array of supported mode names (uppercase)
     * @returns {boolean} True if mode is supported
     */
    _isModeSupported(mode, supportedModes) {
        const m = mode.toUpperCase()
        // Handle aliases
        const aliases = {
            'FM': ['FM'],
            'NFM': ['NFM', 'FM-N'],
            'AM': ['AM'],
            'USB': ['USB'],
            'LSB': ['LSB'],
            'CW': ['CW'],
            'DN': ['DN', 'C4FM', 'WIRES-X'],
            'DMR': ['DMR'],
            'DSTAR': ['DSTAR', 'D-STAR'],
            'TETRA': ['TETRA']
        }
        const modeAliases = aliases[m] || [m]
        return modeAliases.some(alias => supportedModes.includes(alias))
    }
}