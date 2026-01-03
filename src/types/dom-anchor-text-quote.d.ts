declare module 'dom-anchor-text-quote' {
    interface TextQuoteSelector {
        exact: string
        prefix?: string
        suffix?: string
    }

    export function fromRange(root: Element | Document, range: Range): TextQuoteSelector
    export function toRange(root: Element | Document, selector: TextQuoteSelector): Range | null
}
