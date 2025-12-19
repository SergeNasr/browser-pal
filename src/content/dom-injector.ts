import DOMPurify from 'dompurify'

const INJECTOR_ID = 'browser-pal-injector'

export interface InjectOptions {
    position?: 'top' | 'bottom'
    containerId?: string
}

export function injectContent(htmlContent: string, options: InjectOptions = {}): void {
    const { position = 'top', containerId = INJECTOR_ID } = options

    const existing = document.getElementById(containerId)
    if (existing) {
        existing.remove()
    }

    const container = document.createElement('div')
    container.id = containerId
    container.style.cssText = `
        position: fixed;
        ${position === 'top' ? 'top: 0;' : 'bottom: 0;'}
        left: 0;
        right: 0;
        background: #f0f0f0;
        border-${position === 'top' ? 'bottom' : 'top'}: 2px solid #333;
        padding: 16px;
        z-index: 999999;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `

    container.innerHTML = DOMPurify.sanitize(htmlContent)

    if (position === 'top') {
        document.body.insertBefore(container, document.body.firstChild)
        document.body.style.paddingTop = `${container.offsetHeight}px`
    } else {
        document.body.appendChild(container)
        document.body.style.paddingBottom = `${container.offsetHeight}px`
    }
}

export function removeContent(containerId: string = INJECTOR_ID): void {
    const existing = document.getElementById(containerId)
    if (existing) {
        const wasTop = existing.style.top === '0px'
        existing.remove()
        if (wasTop) {
            document.body.style.paddingTop = ''
        } else {
            document.body.style.paddingBottom = ''
        }
    }
}
