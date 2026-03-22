/**
 * MemoryManager - Manages FTX-1 memory entries with localStorage persistence.
 * Handles the working memory list: add, remove, reorder, assign memory numbers.
 */
export default class MemoryManager {
    constructor() {
        this.storageKey = 'ftx1-memories'
        this.entries = []
        this.load()
    }

    /** Load entries from localStorage */
    load() {
        try {
            const data = localStorage.getItem(this.storageKey)
            this.entries = data ? JSON.parse(data) : []
        } catch (e) {
            console.error('Failed to load from localStorage:', e)
            this.entries = []
        }
    }

    /** Save entries to localStorage */
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.entries))
        } catch (e) {
            console.error('Failed to save to localStorage:', e)
        }
    }

    /** Get all entries */
    getAll() {
        return this.entries
    }

    /** Get entries that have a memory number assigned and are selected */
    getSelectedForProgramming() {
        return this.entries
            .filter(e => e.selected && e.memoryNumber != null && e.memoryNumber >= 1 && e.memoryNumber <= 900)
            .sort((a, b) => a.memoryNumber - b.memoryNumber)
    }

    /** Add entries (from repeater import or CSV import), avoids exact RX freq duplicates */
    addEntries(newEntries) {
        for (const entry of newEntries) {
            const exists = this.entries.some(e =>
                e.rxFreq === entry.rxFreq && e.txFreq === entry.txFreq
            )
            if (!exists) {
                this.entries.push({ ...entry })
            }
        }
        this.save()
    }

    /** Replace all entries (e.g., from maintenance CSV import) */
    replaceAll(entries) {
        this.entries = entries.map(e => ({ ...e }))
        this.save()
    }

    /** Update a single entry by index */
    updateEntry(index, updates) {
        if (index >= 0 && index < this.entries.length) {
            Object.assign(this.entries[index], updates)
            this.save()
        }
    }

    /** Remove entry by index */
    removeEntry(index) {
        if (index >= 0 && index < this.entries.length) {
            this.entries.splice(index, 1)
            this.save()
        }
    }

    /** Remove all entries */
    clearAll() {
        this.entries = []
        this.save()
    }

    /** Toggle selection of entry */
    toggleSelected(index) {
        if (index >= 0 && index < this.entries.length) {
            this.entries[index].selected = !this.entries[index].selected
            this.save()
        }
    }

    /** Select all entries */
    selectAll() {
        this.entries.forEach(e => { e.selected = true })
        this.save()
    }

    /** Deselect all entries */
    deselectAll() {
        this.entries.forEach(e => { e.selected = false })
        this.save()
    }

    /** Auto-assign memory numbers starting from a given number */
    autoAssignMemoryNumbers(startFrom = 1) {
        let num = startFrom
        for (const entry of this.entries) {
            if (entry.selected) {
                entry.memoryNumber = num++
                if (num > 900) break
            }
        }
        this.save()
    }

    /** Set entries from radio read */
    setFromRadioRead(entries) {
        for (const entry of entries) {
            entry.source = 'radio-read'
        }
        this.addEntries(entries)
    }

    /** Validate memory number (1-900 for regular memories) */
    isValidMemoryNumber(num) {
        return Number.isInteger(num) && num >= 1 && num <= 900
    }
}