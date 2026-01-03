import { toRange } from 'dom-anchor-text-quote'
import { TextAnchor } from '../storage'

export interface HighlightRects {
    id: string
    rects: DOMRect[]
    isValid: boolean
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
     */
    getRectsForAnchor(anchor: TextAnchor): DOMRect[] {
        try {
            const range = toRange(this.container, anchor)
            if (!range) {
                return []
            }

            // Validate range is within container
            if (!this.container.contains(range.startContainer) ||
                !this.container.contains(range.endContainer)) {
                return []
            }

            // getClientRects returns one rect per line
            const rects = range.getClientRects()
            return Array.from(rects)
        } catch (error) {
            console.error('[PositionCalculator] Error getting rects:', error)
            return []
        }
    }

    /**
     * Convert viewport-relative rects to container-relative coordinates.
     * This is needed because overlays are positioned relative to the container.
     */
    toContainerRelative(rects: DOMRect[]): DOMRect[] {
        const containerRect = this.container.getBoundingClientRect()
        const scrollTop = this.container.scrollTop
        const scrollLeft = this.container.scrollLeft

        return rects.map(rect => new DOMRect(
            rect.left - containerRect.left + scrollLeft,
            rect.top - containerRect.top + scrollTop,
            rect.width,
            rect.height
        ))
    }

    /**
     * Calculate positions for multiple highlights at once.
     */
    calculateAll(highlights: Array<{ id: string; anchor: TextAnchor }>): HighlightRects[] {
        return highlights.map(({ id, anchor }) => {
            const viewportRects = this.getRectsForAnchor(anchor)
            const containerRects = this.toContainerRelative(viewportRects)
            return {
                id,
                rects: containerRects,
                isValid: containerRects.length > 0
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
