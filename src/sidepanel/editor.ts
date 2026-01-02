import { marked } from 'marked'
import DOMPurify from 'dompurify'

const editor = document.getElementById('editor') as HTMLDivElement

if (!editor) {
    throw new Error('Editor element not found')
}

console.log('[Side Panel] Editor initialized', editor)

function insertMarkdownAtCursor(markdown: string): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
        return
    }

    const range = selection.getRangeAt(0)
    range.deleteContents()

    const html = marked.parse(markdown) as string
    const sanitizedHtml = DOMPurify.sanitize(html)

    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = sanitizedHtml

    const fragment = document.createDocumentFragment()
    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild)
    }

    range.insertNode(fragment)

    const newRange = range.cloneRange()
    newRange.setStartAfter(fragment.lastChild || range.startContainer)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)
}

function handlePlaceholder(): void {
    if (editor.textContent?.trim() === '') {
        editor.classList.add('empty')
    } else {
        editor.classList.remove('empty')
    }
}

function createLoadingIndicator(command: string): { container: HTMLSpanElement; updateDots: () => void; stop: () => void } {
    const container = document.createElement('span')
    container.className = 'loading-indicator'
    container.textContent = `Executing /${command}`

    const dotsSpan = document.createElement('span')
    dotsSpan.className = 'loading-dots'
    dotsSpan.textContent = '...'
    container.appendChild(dotsSpan)

    let dotCount = 0
    let intervalId: number | null = null

    const updateDots = () => {
        dotCount = (dotCount + 1) % 4
        dotsSpan.textContent = '.'.repeat(dotCount)
    }

    const start = () => {
        intervalId = window.setInterval(updateDots, 500)
    }

    const stop = () => {
        if (intervalId !== null) {
            clearInterval(intervalId)
            intervalId = null
        }
    }

    start()

    return { container, updateDots, stop }
}

async function executeCommand(command: string): Promise<void> {
    console.log(`[Side Panel] Command detected: /${command}`)
    console.log(`[Side Panel] Executing command: /${command}`)

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
        console.error('[Side Panel] No selection available')
        return
    }

    const range = selection.getRangeAt(0)
    const loadingIndicator = createLoadingIndicator(command)

    range.deleteContents()
    range.insertNode(loadingIndicator.container)

    const newRange = range.cloneRange()
    newRange.setStartAfter(loadingIndicator.container)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    try {
        console.log(`[Side Panel] Sending message to service worker for command: /${command}`)
        const response = await chrome.runtime.sendMessage({
            type: 'executeCommand',
            command: command,
            selection: '',
        })

        console.log(`[Side Panel] Received response for /${command}:`, response)

        if (response.success && response.response) {
            console.log(`[Side Panel] Command /${command} executed successfully, inserting markdown`)
            loadingIndicator.stop()
            loadingIndicator.container.remove()
            insertMarkdownAtCursor(response.response)
            console.log(`[Side Panel] Markdown inserted successfully`)
        } else {
            console.error(`[Side Panel] Command /${command} failed:`, response.error)
            loadingIndicator.stop()
            loadingIndicator.container.textContent = `❌ Error: ${response.error || 'Unknown error'}`
            loadingIndicator.container.className = 'error-message'
        }
    } catch (error) {
        console.error(`[Side Panel] Error executing command /${command}:`, error)
        loadingIndicator.stop()
        loadingIndicator.container.textContent = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        loadingIndicator.container.className = 'error-message'
    }

    handlePlaceholder()
}

function getCurrentLineText(range: Range): { text: string; lineRange: Range } | null {
    const startContainer = range.startContainer
    const startOffset = range.startOffset

    const fullText = editor.textContent || editor.innerText || ''
    const beforeCursor = fullText.substring(0, getTextOffsetBeforeCursor(range))

    const lastNewline = beforeCursor.lastIndexOf('\n')
    const lineStartOffset = lastNewline + 1
    const lineEndOffset = fullText.indexOf('\n', getTextOffsetBeforeCursor(range))
    const actualLineEnd = lineEndOffset === -1 ? fullText.length : lineEndOffset

    const lineText = fullText.substring(lineStartOffset, actualLineEnd).trim()

    if (!lineText) {
        return null
    }

    const lineRange = document.createRange()
    try {
        const startPos = findTextPosition(editor, lineStartOffset)
        const endPos = findTextPosition(editor, actualLineEnd)

        if (startPos && endPos) {
            lineRange.setStart(startPos.node, startPos.offset)
            lineRange.setEnd(endPos.node, endPos.offset)

            return {
                text: lineText,
                lineRange,
            }
        }
    } catch (error) {
        console.error('[Side Panel] Error creating line range:', error)
    }

    return null
}

function getTextOffsetBeforeCursor(range: Range): number {
    const rangeBefore = range.cloneRange()
    rangeBefore.selectNodeContents(editor)
    rangeBefore.setEnd(range.endContainer, range.endOffset)
    return rangeBefore.toString().length
}

function findTextPosition(container: Node, targetOffset: number): { node: Node; offset: number } | null {
    let currentOffset = 0
    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
    )

    let node: Node | null
    while ((node = walker.nextNode())) {
        const textLength = node.textContent?.length || 0
        if (currentOffset + textLength >= targetOffset) {
            return {
                node,
                offset: targetOffset - currentOffset
            }
        }
        currentOffset += textLength
    }

    const lastTextNode = getLastTextNode(container)
    if (lastTextNode) {
        return {
            node: lastTextNode,
            offset: lastTextNode.textContent?.length || 0
        }
    }

    return null
}

function getLastTextNode(node: Node): Text | null {
    if (node.nodeType === Node.TEXT_NODE) {
        return node as Text
    }
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const found = getLastTextNode(node.childNodes[i])
        if (found) return found
    }
    return null
}

function detectCommand(lineText: string): string | null {
    const trimmed = lineText.trim()
    if (trimmed.startsWith('/')) {
        const match = trimmed.match(/^\/(\w+)/)
        if (match) {
            return match[1]
        }
    }
    return null
}

editor.addEventListener('input', () => {
    handlePlaceholder()
})

editor.addEventListener('keydown', (e) => {
    console.log('[Side Panel] Keydown event:', e.key, {
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey
    })

    if (e.key === 'Enter' && !e.shiftKey) {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
            console.log('[Side Panel] No selection on Enter key')
            return
        }

        const range = selection.getRangeAt(0)
        const fullText = editor.textContent || editor.innerText || ''
        const cursorOffset = getTextOffsetBeforeCursor(range)
        const beforeCursor = fullText.substring(0, cursorOffset)
        const lastNewline = beforeCursor.lastIndexOf('\n')
        const currentLine = fullText.substring(lastNewline + 1, cursorOffset).trim()

        console.log('[Side Panel] Enter pressed, checking for command...', {
            currentLine,
            cursorOffset,
            fullTextLength: fullText.length
        })

        const command = detectCommand(currentLine)

        if (command) {
            console.log(`[Side Panel] Command detected in input: /${command}`)
            e.preventDefault()

            const lineInfo = getCurrentLineText(range)
            if (lineInfo) {
                selection.removeAllRanges()
                selection.addRange(lineInfo.lineRange)
                lineInfo.lineRange.deleteContents()
            } else {
                const rangeBefore = range.cloneRange()
                rangeBefore.selectNodeContents(editor)
                rangeBefore.setEnd(range.endContainer, range.endOffset)
                const textBefore = rangeBefore.toString()
                const lineStart = textBefore.lastIndexOf('\n') + 1
                const rangeToDelete = range.cloneRange()
                rangeToDelete.setStart(range.startContainer, Math.max(0, range.startOffset - (textBefore.length - lineStart)))
                rangeToDelete.setEnd(range.endContainer, range.endOffset)
                selection.removeAllRanges()
                selection.addRange(rangeToDelete)
                rangeToDelete.deleteContents()
            }

            executeCommand(command)
        } else {
            console.log('[Side Panel] No command detected in line:', currentLine)
        }
    }
})

handlePlaceholder()
