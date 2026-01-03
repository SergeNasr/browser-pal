import { toRange } from 'dom-anchor-text-quote'
import { TextAnchor } from '../storage'

export interface HighlightRects {
    id: string
    rects: DOMRect[]
    isValid: boolean
    /** If text was edited, this contains the new text (different from anchor.exact) */
    updatedExact?: string
}

export interface AnchorResult {
    rects: DOMRect[]
    /** The actual text found (may differ from anchor.exact if edited) */
    foundText: string | null
}

/**
 * Converts text anchors to screen coordinates.
 * Uses the dom-anchor-text-quote library to find ranges,
 * then getClientRects() for accurate multi-line positioning.
 */
export class PositionCalculator {
    private container: HTMLElement

    constructor(container: HTMLElement) {
        this.container = container
    }

    /**
     * Get screen rectangles for a text anchor.
     * Returns one rect per line for multi-line selections.
     *
     * Also returns the found text, which may differ from anchor.exact if the
     * user edited the highlighted text. The caller can use this to update
     * the anchor so the highlight "follows" edits.
     */
    getRectsForAnchor(anchor: TextAnchor): AnchorResult {
        try {
            const range = toRange(this.container, anchor)
            if (!range) {
                return { rects: [], foundText: null }
            }

            // Validate range is within container
            if (!this.container.contains(range.startContainer) ||
                !this.container.contains(range.endContainer)) {
                return { rects: [], foundText: null }
            }

            const foundText = range.toString()

            // getClientRects returns one rect per line
            const rects = range.getClientRects()
            return {
                rects: Array.from(rects),
                foundText
            }
        } catch (error) {
            console.error('[PositionCalculator] Error getting rects:', error)
            return { rects: [], foundText: null }
        }
    }

    /**
     * Convert viewport-relative rects to container-relative coordinates.
     * This is needed because overlays are positioned relative to the container.
     *
     * NOTE: We DON'T add scroll offset here. Overlays are positioned relative
     * to the visible viewport area. When the editor scrolls, we recalculate
     * positions so overlays stay aligned with visible text.
     */
    toContainerRelative(rects: DOMRect[]): DOMRect[] {
        const containerRect = this.container.getBoundingClientRect()

        return rects.map(rect => new DOMRect(
            rect.left - containerRect.left,
            rect.top - containerRect.top,
            rect.width,
            rect.height
        ))
    }

    /**
     * Calculate positions for multiple highlights at once.
     */
    calculateAll(highlights: Array<{ id: string; anchor: TextAnchor }>): HighlightRects[] {
        return highlights.map(({ id, anchor }) => {
            const result = this.getRectsForAnchor(anchor)
            const containerRects = this.toContainerRelative(result.rects)

            // Track if the text was edited (found text differs from anchor.exact)
            const updatedExact = result.foundText && result.foundText !== anchor.exact
                ? result.foundText
                : undefined

            return {
                id,
                rects: containerRects,
                isValid: containerRects.length > 0,
                updatedExact
            }
        })
    }

    /**
     * Get a Range from a text anchor (for creating new highlights).
     */
    getRangeFromAnchor(anchor: TextAnchor): Range | null {
        try {
            const range = toRange(this.container, anchor)
            if (range && this.container.contains(range.startContainer)) {
                return range
            }
        } catch (error) {
            console.error('[PositionCalculator] Error getting range:', error)
        }
        return null
    }
}
