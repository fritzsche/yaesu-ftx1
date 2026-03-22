/**
 * CharConverter - Converts special characters (German umlauts, etc.)
 * to ASCII-safe equivalents for the Yaesu FTX-1 memory tag system.
 * Tags support up to 12 ASCII characters.
 */
export default class CharConverter {
    constructor() {
        this.replacements = new Map([
            ['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue'], ['ß', 'ss'],
            ['Ä', 'AE'], ['Ö', 'OE'], ['Ü', 'UE'],
            ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
            ['á', 'a'], ['à', 'a'], ['â', 'a'],
            ['í', 'i'], ['ì', 'i'], ['î', 'i'],
            ['ó', 'o'], ['ò', 'o'], ['ô', 'o'],
            ['ú', 'u'], ['ù', 'u'], ['û', 'u'],
            ['ñ', 'n'], ['ç', 'c'],
            ['É', 'E'], ['È', 'E'], ['Ê', 'E'],
            ['Á', 'A'], ['À', 'A'], ['Â', 'A'],
            ['°', ''], ['´', "'"],
        ])
        this.maxTagLength = 12
    }

    /**
     * Convert a string to FTX-1 compatible ASCII tag (max 12 chars)
     * @param {string} input
     * @returns {string}
     */
    toTag(input) {
        if (!input) return ''
        let result = ''
        for (const char of input) {
            if (this.replacements.has(char)) {
                result += this.replacements.get(char)
            } else if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
                result += char
            }
            // skip non-printable / non-ASCII characters
        }
        return result.substring(0, this.maxTagLength)
    }

    /**
     * Parse German-format frequency string (e.g. "439,3625") to Hz
     * @param {string} freqStr - Frequency in MHz with comma decimal
     * @returns {number|null} Frequency in Hz or null if invalid
     */
    parseFrequencyMHz(freqStr) {
        if (!freqStr || freqStr.trim() === '') return null
        let cleaned = freqStr.trim().replace(/\s/g, '')
        // Remove trailing dots or invalid chars
        cleaned = cleaned.replace(/\.+$/, '')
        // German format: comma as decimal separator
        cleaned = cleaned.replace(',', '.')
        const mhz = parseFloat(cleaned)
        if (isNaN(mhz) || mhz <= 0) return null
        return Math.round(mhz * 1000000)
    }

    /**
     * Format Hz to MHz display string
     * @param {number} hz
     * @returns {string}
     */
    formatFrequencyMHz(hz) {
        if (!hz || hz <= 0) return ''
        return (hz / 1000000).toFixed(4)
    }

    /**
     * Parse CTCSS tone string from CSV (e.g. "94,8Hz" or "67,0Hz")
     * @param {string} toneStr
     * @returns {number|null} Tone frequency as float or null
     */
    parseCtcssTone(toneStr) {
        if (!toneStr || toneStr.trim() === '') return null
        let cleaned = toneStr.trim().replace(/[Hh][Zz]$/, '').trim()
        cleaned = cleaned.replace(',', '.')
        const freq = parseFloat(cleaned)
        if (isNaN(freq) || freq <= 0) return null
        return freq
    }
}