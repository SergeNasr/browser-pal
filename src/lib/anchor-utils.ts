import { fromRange, toRange } from 'dom-anchor-text-quote'
import { TextAnchor } from './storage'

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
