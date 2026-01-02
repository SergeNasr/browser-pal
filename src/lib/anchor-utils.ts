import { fromRange, toRange } from 'dom-anchor-text-quote'
import { TextAnchor, Highlight } from './storage'

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function createAnchorFromRange(range: Range, container: HTMLElement): TextAnchor | null {
    try {
        const quote = fromRange(container, range)
        if (quote && quote.exact) {
            return {
                exact: quote.exact,
                prefix: quote.prefix || '',
                suffix: quote.suffix || ''
            }
        }
    } catch (error) {
        console.error('[Anchor Utils] Error creating anchor:', error)
    }
    return null
}

export function findRangeFromAnchor(anchor: TextAnchor, container: HTMLElement): Range | null {
    try {
        if (!container.isConnected) {
            return null
        }

        const range = toRange(container, anchor)

        if (!range) {
            return null
        }

        if (!range.startContainer || !range.endContainer) {
            return null
        }

        if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
            return null
        }

        return range
    } catch (error) {
        console.error('[Anchor Utils] Error finding range from anchor:', error)
    }

    return null
}

export function applyHighlight(highlight: Highlight, container: HTMLElement): boolean {
    const range = findRangeFromAnchor(highlight.anchor, container)
    if (!range) {
        return false
    }

    try {
        const highlightSpan = document.createElement('span')
        highlightSpan.className = 'highlight'
        highlightSpan.dataset.highlightId = highlight.id
        highlightSpan.style.backgroundColor = '#fff3cd'
        highlightSpan.style.cursor = 'pointer'

        if (range.collapsed) {
            return false
        }

        const contents = range.extractContents()
        highlightSpan.appendChild(contents)
        range.insertNode(highlightSpan)

        return true
    } catch (error) {
        console.error('[Anchor Utils] Error applying highlight:', error)
        return false
    }
}

export function removeHighlights(container: HTMLElement): void {
    const highlights = container.querySelectorAll('.highlight')
    highlights.forEach(highlight => {
        const parent = highlight.parentNode
        if (parent) {
            while (highlight.firstChild) {
                parent.insertBefore(highlight.firstChild, highlight)
            }
            parent.removeChild(highlight)
        }
    })
}

export function applyHighlights(highlights: Highlight[], container: HTMLElement): void {
    removeHighlights(container)

    highlights.forEach(highlight => {
        applyHighlight(highlight, container)
    })
}

export function findHighlightElement(highlightId: string, container: HTMLElement): HTMLElement | null {
    return container.querySelector(`[data-highlight-id="${highlightId}"]`) as HTMLElement | null
}

