import { TextAnchor, Highlight } from '../storage'
import { PositionCalculator, HighlightRects } from './position-calculator'

export interface HighlightClickEvent {
    highlightId: string
}

/**
 * Manages highlight overlay rendering.
 * Renders highlights as absolutely-positioned divs instead of inline spans.
 * This separates the highlight layer from the content layer.
 */
export class HighlightOverlayManager {
    private container: HTMLElement
    private overlayContainer: HTMLElement
    private positionCalculator: PositionCalculator
    private overlays: Map<string, HTMLDivElement[]> = new Map()
    private highlights: Map<string, { anchor: TextAnchor }> = new Map()
    private pendingRecalc = false
    private onHighlightClick: ((event: HighlightClickEvent) => void) | null = null

    constructor(editorContainer: HTMLElement) {
        this.container = editorContainer

        // Create overlay container
        this.overlayContainer = document.createElement('div')
        this.overlayContainer.className = 'highlight-overlay-container'
        this.overlayContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            overflow: hidden;
        `

        // Insert overlay container as sibling, positioned over editor
        const parent = editorContainer.parentElement
        if (parent) {
            parent.style.position = 'relative'
            parent.insertBefore(this.overlayContainer, editorContainer.nextSibling)
        }

        this.positionCalculator = new PositionCalculator(editorContainer)
        this.setupListeners()
    }

    private setupListeners(): void {
        // Scroll - recalculate positions
        this.container.addEventListener('scroll', () => {
            this.scheduleRecalculation()
        }, { passive: true })

        // Resize - recalculate positions
        const resizeObserver = new ResizeObserver(() => {
            this.scheduleRecalculation()
        })
        resizeObserver.observe(this.container)

        // Font loading - recalculate after fonts load
        document.fonts.ready.then(() => {
            this.scheduleRecalculation()
        })
    }

    /**
     * Register click handler for highlight overlays.
     */
    setClickHandler(handler: (event: HighlightClickEvent) => void): void {
        this.onHighlightClick = handler
    }

    /**
     * Add a highlight to be rendered.
     */
    addHighlight(id: string, anchor: TextAnchor): void {
        this.highlights.set(id, { anchor })
        this.renderHighlight(id, anchor)
    }

    /**
     * Remove a highlight.
     */
    removeHighlight(id: string): void {
        this.highlights.delete(id)
        this.clearOverlayElements(id)
    }

    /**
     * Clear all highlights.
     */
    clear(): void {
        this.highlights.clear()
        this.overlayContainer.innerHTML = ''
        this.overlays.clear()
    }

    /**
     * Schedule a position recalculation using RAF for batching.
     */
    scheduleRecalculation(): void {
        if (this.pendingRecalc) return
        this.pendingRecalc = true

        requestAnimationFrame(() => {
            this.recalculateAll()
            this.pendingRecalc = false
        })
    }

    /**
     * Force immediate recalculation of all highlight positions.
     */
    recalculateAll(): void {
        const highlightData = Array.from(this.highlights.entries()).map(
            ([id, { anchor }]) => ({ id, anchor })
        )

        const results = this.positionCalculator.calculateAll(highlightData)

        for (const result of results) {
            this.updateOverlayElements(result.id, result.rects)
        }
    }

    private renderHighlight(id: string, anchor: TextAnchor): void {
        const rects = this.positionCalculator.getRectsForAnchor(anchor)
        const containerRects = this.positionCalculator.toContainerRelative(rects)
        this.updateOverlayElements(id, containerRects)
    }

    private clearOverlayElements(id: string): void {
        const elements = this.overlays.get(id)
        if (elements) {
            elements.forEach(el => el.remove())
            this.overlays.delete(id)
        }
    }

    private updateOverlayElements(id: string, rects: DOMRect[]): void {
        // Clear existing overlays for this highlight
        this.clearOverlayElements(id)

        if (rects.length === 0) return

        // Create one overlay div per line rectangle
        const elements: HTMLDivElement[] = []

        for (const rect of rects) {
            const overlay = document.createElement('div')
            overlay.className = 'highlight-overlay'
            overlay.dataset.highlightId = id
            overlay.style.cssText = `
                position: absolute;
                left: ${rect.left}px;
                top: ${rect.top}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background-color: rgba(255, 243, 205, 0.7);
                border-radius: 2px;
                pointer-events: auto;
                cursor: pointer;
                transition: background-color 0.15s ease;
            `

            // Hover effect
            overlay.addEventListener('mouseenter', () => {
                overlay.style.backgroundColor = 'rgba(255, 230, 156, 0.9)'
            })
            overlay.addEventListener('mouseleave', () => {
                overlay.style.backgroundColor = 'rgba(255, 243, 205, 0.7)'
            })

            // Click handler
            overlay.addEventListener('click', (e) => {
                e.stopPropagation()
                if (this.onHighlightClick) {
                    this.onHighlightClick({ highlightId: id })
                }
            })

            this.overlayContainer.appendChild(overlay)
            elements.push(overlay)
        }

        this.overlays.set(id, elements)
    }

    /**
     * Load multiple highlights at once.
     */
    loadHighlights(highlights: Highlight[]): void {
        this.clear()
        for (const highlight of highlights) {
            this.addHighlight(highlight.id, highlight.anchor)
        }
    }

    /**
     * Get all currently tracked highlight IDs.
     */
    getHighlightIds(): string[] {
        return Array.from(this.highlights.keys())
    }

    /**
     * Destroy the overlay manager and clean up.
     */
    destroy(): void {
        this.clear()
        this.overlayContainer.remove()
    }
}
