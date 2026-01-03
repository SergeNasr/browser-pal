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
        highlightSpan.style.display = 'inline'

        if (range.collapsed) {
            return false
        }

        try {
            range.surroundContents(highlightSpan)
            return true
        } catch (surroundError) {
            const startContainer = range.startContainer
            const endContainer = range.endContainer
            const startOffset = range.startOffset
            const endOffset = range.endOffset

            if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
                const textNode = startContainer as Text
                const text = textNode.textContent || ''
                const beforeText = text.substring(0, startOffset)
                const selectedText = text.substring(startOffset, endOffset)
                const afterText = text.substring(endOffset)

                const parent = textNode.parentNode
                if (!parent) return false

                if (beforeText) {
                    parent.insertBefore(document.createTextNode(beforeText), textNode)
                }

                highlightSpan.textContent = selectedText
                parent.insertBefore(highlightSpan, textNode)

                if (afterText) {
                    parent.insertBefore(document.createTextNode(afterText), textNode)
                }

                parent.removeChild(textNode)
                return true
            }

            const contents = range.extractContents()
            if (contents.childNodes.length === 0 && contents.textContent === '') {
                return false
            }
            
            highlightSpan.appendChild(contents)
            range.insertNode(highlightSpan)
            return true
        }
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

