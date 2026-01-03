import { TextAnchor, Highlight } from './storage'
import { HighlightOverlayManager, HighlightClickEvent, HighlightUpdatedEvent } from './overlay/highlight-overlay'
import { createAnchorFromRange } from './anchor-utils'

export interface SelectionInfo {
    text: string
    range: Range
}

export interface EditorEvents {
    onContentChange: () => void
    onSelectionChange: (selection: SelectionInfo | null) => void
    onHighlightClick: (highlightId: string) => void
    onHighlightUpdated: (highlightId: string, newExact: string) => void
}

/**
 * EditorController - abstraction layer for the text editor.
 *
 * This interface allows swapping the underlying editor implementation
 * (e.g., from contenteditable to TipTap) without changing the rest of the app.
 *
 * Current implementation: contenteditable + overlay highlights
 * Future implementation: TipTap with marks
 */
export class EditorController {
    private editor: HTMLElement
    private overlayManager: HighlightOverlayManager
    private events: Partial<EditorEvents> = {}
    private highlights: Map<string, Highlight> = new Map()

    constructor(editorElement: HTMLElement) {
        this.editor = editorElement
        this.overlayManager = new HighlightOverlayManager(editorElement)

        this.setupEventListeners()
    }

    private setupEventListeners(): void {
        // Content changes
        this.editor.addEventListener('input', () => {
            // Schedule highlight recalculation after DOM settles
            this.overlayManager.scheduleRecalculation()
            this.events.onContentChange?.()
        })

        // Selection changes
        document.addEventListener('selectionchange', () => {
            const selection = this.getSelection()
            this.events.onSelectionChange?.(selection)
        })

        // Highlight clicks
        this.overlayManager.setClickHandler((event: HighlightClickEvent) => {
            this.events.onHighlightClick?.(event.highlightId)
        })

        // Highlight text updates (when user edits highlighted text)
        this.overlayManager.setUpdateHandler((event: HighlightUpdatedEvent) => {
            // Update our local copy of the highlight
            const highlight = this.highlights.get(event.highlightId)
            if (highlight) {
                highlight.anchor.exact = event.newExact
            }
            // Notify listeners so they can save the updated highlight
            this.events.onHighlightUpdated?.(event.highlightId, event.newExact)
        })
    }

    // ==================== Content Methods ====================

    /**
     * Get the current HTML content.
     */
    getContent(): string {
        return this.editor.innerHTML
    }

    /**
     * Set the editor content.
     */
    setContent(html: string): void {
        this.editor.innerHTML = html
        this.updateEmptyState()
        this.overlayManager.scheduleRecalculation()
    }

    /**
     * Insert HTML at the current cursor position.
     */
    insertAtCursor(html: string): void {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
            // No selection, append to end
            this.editor.innerHTML += html
            this.updateEmptyState()
            this.overlayManager.scheduleRecalculation()
            return
        }

        const range = selection.getRangeAt(0)
        if (!this.editor.contains(range.commonAncestorContainer)) {
            // Selection not in editor, append to end
            this.editor.innerHTML += html
            this.updateEmptyState()
            this.overlayManager.scheduleRecalculation()
            return
        }

        // Delete any selected content
        range.deleteContents()

        // Create a temporary container to parse HTML
        const temp = document.createElement('div')
        temp.innerHTML = html

        // Insert each node
        const fragment = document.createDocumentFragment()
        let lastNode: Node | null = null
        while (temp.firstChild) {
            lastNode = fragment.appendChild(temp.firstChild)
        }

        range.insertNode(fragment)

        // Move cursor to end of inserted content
        if (lastNode) {
            range.setStartAfter(lastNode)
            range.setEndAfter(lastNode)
            selection.removeAllRanges()
            selection.addRange(range)
        }

        this.updateEmptyState()
        this.overlayManager.scheduleRecalculation()
    }

    private updateEmptyState(): void {
        const isEmpty = this.editor.textContent?.trim() === ''
        this.editor.classList.toggle('empty', isEmpty)
    }

    // ==================== Selection Methods ====================

    /**
     * Get the current selection if it's within the editor.
     */
    getSelection(): SelectionInfo | null {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
            return null
        }

        const range = selection.getRangeAt(0)

        // Check if selection is within editor
        if (!this.editor.contains(range.commonAncestorContainer)) {
            return null
        }

        // Check if selection is not empty
        if (range.collapsed) {
            return null
        }

        const text = range.toString()
        if (!text.trim()) {
            return null
        }

        return { text, range: range.cloneRange() }
    }

    /**
     * Check if a point is within a highlight overlay.
     * Used to prevent showing thread button when clicking on highlights.
     */
    isPointInHighlight(x: number, y: number): boolean {
        const element = document.elementFromPoint(x, y)
        return element?.classList.contains('highlight-overlay') ?? false
    }

    // ==================== Highlight Methods ====================

    /**
     * Add a highlight from the current selection.
     * Returns the highlight ID or null if failed.
     */
    addHighlightFromSelection(): string | null {
        const selection = this.getSelection()
        if (!selection) {
            return null
        }

        const anchor = createAnchorFromRange(selection.range, this.editor)
        if (!anchor) {
            return null
        }

        const id = this.generateId()
        const highlight: Highlight = {
            id,
            anchor,
            createdAt: Date.now()
        }

        this.highlights.set(id, highlight)
        this.overlayManager.addHighlight(id, anchor)

        // Clear selection after creating highlight
        window.getSelection()?.removeAllRanges()

        return id
    }

    /**
     * Add a highlight with an existing anchor.
     */
    addHighlight(highlight: Highlight): void {
        this.highlights.set(highlight.id, highlight)
        this.overlayManager.addHighlight(highlight.id, highlight.anchor)
    }

    /**
     * Remove a highlight.
     */
    removeHighlight(id: string): void {
        this.highlights.delete(id)
        this.overlayManager.removeHighlight(id)
    }

    /**
     * Get a highlight by ID.
     */
    getHighlight(id: string): Highlight | undefined {
        return this.highlights.get(id)
    }

    /**
     * Get all highlights.
     */
    getAllHighlights(): Highlight[] {
        return Array.from(this.highlights.values())
    }

    /**
     * Load highlights from storage data.
     */
    loadHighlights(highlights: Highlight[]): void {
        this.highlights.clear()
        for (const highlight of highlights) {
            this.highlights.set(highlight.id, highlight)
        }
        this.overlayManager.loadHighlights(highlights)
    }

    /**
     * Update a highlight's thread data.
     */
    updateHighlight(id: string, updates: Partial<Highlight>): void {
        const highlight = this.highlights.get(id)
        if (highlight) {
            Object.assign(highlight, updates)
        }
    }

    // ==================== Event Registration ====================

    onContentChange(callback: () => void): void {
        this.events.onContentChange = callback
    }

    onSelectionChange(callback: (selection: SelectionInfo | null) => void): void {
        this.events.onSelectionChange = callback
    }

    onHighlightClick(callback: (highlightId: string) => void): void {
        this.events.onHighlightClick = callback
    }

    onHighlightUpdated(callback: (highlightId: string, newExact: string) => void): void {
        this.events.onHighlightUpdated = callback
    }

    // ==================== Utilities ====================

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * Focus the editor.
     */
    focus(): void {
        this.editor.focus()
    }

    /**
     * Get the underlying editor element (for advanced use cases).
     */
    getElement(): HTMLElement {
        return this.editor
    }

    /**
     * Force recalculation of highlight positions.
     */
    recalculateHighlights(): void {
        this.overlayManager.recalculateAll()
    }

    /**
     * Destroy the controller and clean up resources.
     */
    destroy(): void {
        this.overlayManager.destroy()
    }
}
