/**
 * App - Main application controller for Yaesu FTX-1 Memory Manager.
 * Coordinates UI, memory management, CSV import/export, and CAT serial communication.
 */
import CharConverter from './CharConverter.js'
import CsvParser from './CsvParser.js'
import MemoryManager from './MemoryManager.js'
import CatInterface from './CatInterface.js'

export default class App {
    constructor() {
        this.converter = new CharConverter()
        this.csvParser = new CsvParser()
        this.memoryManager = new MemoryManager()
        this.catInterface = new CatInterface()
        this.statusTimeout = null
    }

    init() {
        this._bindEvents()
        this._updateSerialSupport()
        this._renderTable()
        this._updateStats()
    }

    // === UI Binding ===

    _bindEvents() {
        // Repeater CSV import
        document.getElementById('btn-import-repeater').addEventListener('click', () => {
            document.getElementById('file-repeater-csv').click()
        })
        document.getElementById('file-repeater-csv').addEventListener('change', (e) => this._handleRepeaterImport(e))

        // Maintenance CSV import/export
        document.getElementById('btn-import-maintenance').addEventListener('click', () => {
            document.getElementById('file-maintenance-csv').click()
        })
        document.getElementById('file-maintenance-csv').addEventListener('change', (e) => this._handleMaintenanceImport(e))
        document.getElementById('btn-export-maintenance').addEventListener('click', () => this._handleMaintenanceExport())

        // Selection
        document.getElementById('btn-select-all').addEventListener('click', () => {
            this.memoryManager.selectAll()
            this._renderTable()
            this._updateStats()
        })
        document.getElementById('btn-deselect-all').addEventListener('click', () => {
            this.memoryManager.deselectAll()
            this._renderTable()
            this._updateStats()
        })
        document.getElementById('btn-auto-assign').addEventListener('click', () => this._handleAutoAssign())

        // Clear
        document.getElementById('btn-clear-all').addEventListener('click', () => {
            if (confirm('Delete all memory entries? This cannot be undone.')) {
                this.memoryManager.clearAll()
                this._renderTable()
                this._updateStats()
                this._setStatus('All entries cleared.', 'info')
            }
        })

        // Serial / CAT
        document.getElementById('btn-connect').addEventListener('click', () => this._handleConnect())
        document.getElementById('btn-disconnect').addEventListener('click', () => this._handleDisconnect())
        document.getElementById('btn-read-radio').addEventListener('click', () => this._handleReadRadio())
        document.getElementById('btn-write-radio').addEventListener('click', () => this._handleWriteRadio())
    }

    // === Repeater CSV Import ===

    _handleRepeaterImport(event) {
        const file = event.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const text = e.target.result
                const entries = this.csvParser.parseRepeaterCsv(text, this.converter)
                if (entries.length === 0) {
                    this._setStatus('No valid entries found in repeater CSV.', 'error')
                    return
                }
                this.memoryManager.addEntries(entries)
                this._renderTable()
                this._updateStats()
                this._setStatus(`Imported ${entries.length} repeater entries.`, 'success')
            } catch (err) {
                this._setStatus('Error importing repeater CSV: ' + err.message, 'error')
            }
        }
        reader.readAsText(file, 'UTF-8')
        event.target.value = ''
    }

    // === Maintenance CSV Import/Export ===

    _handleMaintenanceImport(event) {
        const file = event.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const text = e.target.result
                const entries = this.csvParser.parseMaintenanceCsv(text)
                if (entries.length === 0) {
                    this._setStatus('No valid entries found in maintenance CSV.', 'error')
                    return
                }
                this.memoryManager.replaceAll(entries)
                this._renderTable()
                this._updateStats()
                this._setStatus(`Imported ${entries.length} entries from maintenance CSV.`, 'success')
            } catch (err) {
                this._setStatus('Error importing maintenance CSV: ' + err.message, 'error')
            }
        }
        reader.readAsText(file, 'UTF-8')
        event.target.value = ''
    }

    _handleMaintenanceExport() {
        const entries = this.memoryManager.getAll()
        if (entries.length === 0) {
            this._setStatus('No entries to export.', 'error')
            return
        }
        const csv = this.csvParser.exportMaintenanceCsv(entries)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'ftx1_memories.csv'
        a.click()
        URL.revokeObjectURL(url)
        this._setStatus(`Exported ${entries.length} entries.`, 'success')
    }

    // === Auto-Assign Memory Numbers ===

    _handleAutoAssign() {
        const startInput = document.getElementById('assign-start')
        const startNum = parseInt(startInput.value, 10) || 1
        if (startNum < 1 || startNum > 900) {
            this._setStatus('Start number must be between 1 and 900.', 'error')
            return
        }
        const selected = this.memoryManager.getAll().filter(e => e.selected)
        if (selected.length === 0) {
            this._setStatus('No entries selected for auto-assign.', 'error')
            return
        }
        this.memoryManager.autoAssignMemoryNumbers(startNum)
        this._renderTable()
        this._updateStats()
        this._setStatus(`Auto-assigned memory numbers starting from ${startNum}.`, 'success')
    }

    // === Serial Connection ===

    _updateSerialSupport() {
        const supported = this.catInterface.isSupported()
        const warning = document.getElementById('serial-warning')
        if (warning) {
            warning.style.display = supported ? 'none' : 'block'
        }
        document.getElementById('btn-connect').disabled = !supported
    }

    async _handleConnect() {
        try {
            const baudSelect = document.getElementById('baud-rate')
            const baudRate = parseInt(baudSelect.value, 10) || 38400
            await this.catInterface.connect(baudRate)
            this._updateConnectionUI(true)
            this._setStatus('Connected to radio.', 'success')
        } catch (err) {
            this._setStatus('Connection failed: ' + err.message, 'error')
        }
    }

    async _handleDisconnect() {
        try {
            await this.catInterface.disconnect()
            this._updateConnectionUI(false)
            this._setStatus('Disconnected from radio.', 'info')
        } catch (err) {
            this._setStatus('Disconnect error: ' + err.message, 'error')
        }
    }

    _updateConnectionUI(connected) {
        document.getElementById('btn-connect').disabled = connected
        document.getElementById('btn-disconnect').disabled = !connected
        document.getElementById('btn-read-radio').disabled = !connected
        document.getElementById('btn-write-radio').disabled = !connected
        const indicator = document.getElementById('connection-status')
        if (indicator) {
            indicator.textContent = connected ? '● Connected' : '○ Disconnected'
            indicator.className = connected ? 'status-connected' : 'status-disconnected'
        }
    }

    // === Read/Write Radio ===

    async _handleReadRadio() {
        const progress = document.getElementById('progress-bar')
        const progressText = document.getElementById('progress-text')
        try {
            this._showProgress(true)
            const entries = await this.catInterface.readAllMemories(3, 3, (current, total) => {
                const pct = Math.round((current / total) * 100)
                if (progress) progress.value = pct
                if (progressText) progressText.textContent = `Reading channel ${current} of ${total}...`
            })
            this.memoryManager.setFromRadioRead(entries)
            this._renderTable()
            this._updateStats()
            this._setStatus(`Read ${entries.length} memory channels from radio.`, 'success')
        } catch (err) {
            this._setStatus('Read error: ' + err.message, 'error')
        } finally {
            this._showProgress(false)
        }
    }

    async _handleWriteRadio() {
        const entries = this.memoryManager.getSelectedForProgramming()
        if (entries.length === 0) {
            this._setStatus('No selected entries with assigned memory numbers to write.', 'error')
            return
        }
        if (!confirm(`Write ${entries.length} memory channels to the radio?`)) return

        const progress = document.getElementById('progress-bar')
        const progressText = document.getElementById('progress-text')
        try {
            this._showProgress(true)
            await this.catInterface.writeAllMemories(entries, (current, total, memNum) => {
                const pct = Math.round((current / total) * 100)
                if (progress) progress.value = pct
                if (progressText) progressText.textContent = `Writing channel ${memNum} (${current}/${total})...`
            })
            this._setStatus(`Successfully wrote ${entries.length} channels to radio.`, 'success')
        } catch (err) {
            this._setStatus('Write error: ' + err.message, 'error')
        } finally {
            this._showProgress(false)
        }
    }

    _showProgress(show) {
        const container = document.getElementById('progress-container')
        if (container) container.style.display = show ? 'block' : 'none'
        if (!show) {
            const bar = document.getElementById('progress-bar')
            const text = document.getElementById('progress-text')
            if (bar) bar.value = 0
            if (text) text.textContent = ''
        }
    }

    // === Table Rendering ===

    _renderTable() {
        const tbody = document.getElementById('memory-table-body')
        if (!tbody) return
        const entries = this.memoryManager.getAll()

        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="empty-message">No memory entries. Import a repeater CSV or maintenance CSV to get started.</td></tr>'
            return
        }

        tbody.innerHTML = ''
        entries.forEach((entry, idx) => {
            const tr = document.createElement('tr')
            if (entry.selected) tr.classList.add('selected')

            // Checkbox
            const tdSel = document.createElement('td')
            const cb = document.createElement('input')
            cb.type = 'checkbox'
            cb.checked = entry.selected
            cb.addEventListener('change', () => {
                this.memoryManager.toggleSelected(idx)
                this._renderTable()
                this._updateStats()
            })
            tdSel.appendChild(cb)
            tr.appendChild(tdSel)

            // Memory Number (editable)
            const tdMem = document.createElement('td')
            const memInput = document.createElement('input')
            memInput.type = 'number'
            memInput.className = 'mem-num-input'
            memInput.min = 1
            memInput.max = 900
            memInput.value = entry.memoryNumber ?? ''
            memInput.placeholder = '—'
            memInput.addEventListener('change', (e) => {
                const val = parseInt(e.target.value, 10)
                this.memoryManager.updateEntry(idx, {
                    memoryNumber: (val >= 1 && val <= 900) ? val : null
                })
                this._updateStats()
            })
            tdMem.appendChild(memInput)
            tr.appendChild(tdMem)

            // Tag (editable)
            const tdTag = document.createElement('td')
            const tagInput = document.createElement('input')
            tagInput.type = 'text'
            tagInput.className = 'tag-input'
            tagInput.maxLength = 12
            tagInput.value = entry.tag || ''
            tagInput.addEventListener('change', (e) => {
                const converted = this.converter.toTag(e.target.value)
                e.target.value = converted
                this.memoryManager.updateEntry(idx, { tag: converted })
            })
            tdTag.appendChild(tagInput)
            tr.appendChild(tdTag)

            // RX Freq
            tr.appendChild(this._createCell(this.converter.formatFrequencyMHz(entry.rxFreq)))
            // TX Freq
            tr.appendChild(this._createCell(this.converter.formatFrequencyMHz(entry.txFreq)))
            // Offset
            tr.appendChild(this._createCell(entry.offsetDirection || 'SIMPLEX'))
            // Mode
            tr.appendChild(this._createCell(entry.mode || 'FM'))
            // Tone
            const toneStr = entry.ctcssTone ? `${entry.ctcssTone} Hz` : (entry.dcsCode ? `DCS ${entry.dcsCode}` : '—')
            tr.appendChild(this._createCell(toneStr))
            // Name (original)
            tr.appendChild(this._createCell(entry.name || ''))
            // QTH
            tr.appendChild(this._createCell(entry.qth || ''))

            // Actions
            const tdAct = document.createElement('td')
            const delBtn = document.createElement('button')
            delBtn.className = 'btn-small btn-danger'
            delBtn.textContent = '✕'
            delBtn.title = 'Remove entry'
            delBtn.addEventListener('click', () => {
                this.memoryManager.removeEntry(idx)
                this._renderTable()
                this._updateStats()
            })
            tdAct.appendChild(delBtn)
            tr.appendChild(tdAct)

            tbody.appendChild(tr)
        })
    }

    _createCell(text) {
        const td = document.createElement('td')
        td.textContent = text
        return td
    }

    _updateStats() {
        const entries = this.memoryManager.getAll()
        const selected = entries.filter(e => e.selected).length
        const assigned = entries.filter(e => e.memoryNumber != null).length
        const ready = entries.filter(e => e.selected && e.memoryNumber != null).length

        const el = document.getElementById('stats')
        if (el) {
            el.textContent = `Total: ${entries.length} | Selected: ${selected} | Assigned: ${assigned} | Ready to program: ${ready}`
        }
    }

    _setStatus(message, type = 'info') {
        const el = document.getElementById('status-message')
        if (!el) return
        el.textContent = message
        el.className = 'status-bar status-' + type
        if (this.statusTimeout) clearTimeout(this.statusTimeout)
        this.statusTimeout = setTimeout(() => {
            el.textContent = ''
            el.className = 'status-bar'
        }, 8000)
    }
}