// Constants.js

/**
 * Standard CTCSS Tones (50 tones)
 * Yaesu uses the index (0-bit padded to 3 digits) in the CN00 command.
 * Index 000 is usually 67.0 Hz.
 */
export const CTCSS_TONES = [
    67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5,
    94.8, 97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3,
    131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9,
    171.3, 173.8, 177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5,
    203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1
]

/**
 * FTX-1 Mode Mappings (Based on ID0840 / FT-710 / FT-991A)
 * Used for the MD command and the 17th character of the MR/MW string.
 */
export const MODE_MAP = {
    // Name to CAT Code
    'LSB': '1',
    'USB': '2',
    'CW': '3',
    'FM': '4',
    'AM': '5',
    'RTTY-LSB': '6',
    'CW-LSB': '7',
    'DATA-LSB': '8',
    'RTTY-USB': '9',
    'DATA-FM': 'A',
    'FM-N': 'B',
    'DATA-USB': 'C',
    'AM-N': 'D',
    'PSK': 'E',
    'DATA-FM-N': 'F',
    'C4FM': 'H'
}

/**
 * Reverse Mapping for Reading from Radio
 */
export const MODE_REV_MAP = Object.fromEntries(
    Object.entries(MODE_MAP).map(([name, code]) => [code, name])
)

/**
 * Tone Mode Mappings (CT Command)
 * Used to set the squelch type.
 */
export const TONE_MODE_MAP = {
    'OFF': '0',
    'TONE': '1', // CTCSS Encode (Repeater Tone)
    'TSQL': '2', // CTCSS Encode/Decode (Tone Squelch)
    'DCS': '3', // Digital Coded Squelch
    'PR_FREQ': '4', // Priority Frequency
    'REV_TONE': '5' // Reverse Tone
}

/**
 * CHIRP CSV Header (For reference and generation)
 */
export const CHIRP_HEADER = [
    "Location", "Name", "Frequency", "Duplex", "Offset", "Tone",
    "rToneFreq", "cToneFreq", "DtcsCode", "DtcsPolarity", "Mode",
    "TStep", "Skip", "Comment", "URCALL", "RPT1CALL", "RPT2CALL"
]

/**
 * FTX-1 Frequency Ranges (in Hz)
 * Used for validating entries before upload
 */
export const FTX1_FREQ_RANGES = [
    { min: 100000, max: 174000000, name: 'HF' },
    { min: 174000000, max: 350000000, name: 'VHF' },
    { min: 350000000, max: 400000000, name: 'Airband' },
    { min: 400000000, max: 524000000, name: 'UHF' },
    // Note: 1.2GHz band (1240-1300 MHz) may not be supported by all FTX-1 models
    // Adding a conservative upper limit
]

/**
 * Check if a frequency is within FTX-1's supported ranges
 * @param {number} freqHz - Frequency in Hz
 * @returns {boolean} True if frequency is supported
 */
export function isFrequencySupported(freqHz) {
    for (const range of FTX1_FREQ_RANGES) {
        if (freqHz >= range.min && freqHz <= range.max) {
            return true
        }
    }
    return false
}