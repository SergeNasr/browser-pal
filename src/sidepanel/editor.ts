import { marked } from 'marked'
import { default as DOMPurify } from 'dompurify'
import {
    getSidebarContent,
    getSidepanelData,
    setSidepanelData,
    SidepanelContent,
    Highlight,
    Thread,
    ThreadMessage,
    OldSidepanelContent
} from '../lib/storage'
import {
    generateId,
    createAnchorFromRange,
    applyHighlights,
    removeHighlights,
    findHighlightElement,
    applyHighlight as applyHighlightUtil
} from '../lib/anchor-utils'

const editor = document.getElementById('editor') as HTMLDivElement
const threadPanel = document.getElementById('thread-panel') as HTMLDivElement
const threadMessages = threadPanel?.querySelector('.thread-messages') as HTMLDivElement
const threadInput = threadPanel?.querySelector('.thread-input') as HTMLInputElement
const threadPanelToggle = threadPanel?.querySelector('.thread-panel-toggle') as HTMLButtonElement
const threadPanelClose = threadPanel?.querySelector('.thread-panel-close') as HTMLButtonElement
const threadDeleteBtn = threadPanel?.querySelector('.thread-delete-btn') as HTMLButtonElement
const threadPanelContent = threadPanel?.querySelector('.thread-panel-content') as HTMLDivElement

if (!editor) {
    throw new Error('Editor element not found')
}

let currentGroupId: number | null = null
let saveTimeout: number | null = null
let currentData: SidepanelContent | null = null
let selectedHighlightId: string | null = null
let isApplyingHighlights = false

async function getCurrentGroupId(): Promise<number | null> {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const tabId = tabs[0]?.id
        if (!tabId) return null

        const tab = await chrome.tabs.get(tabId)
        return tab.groupId !== -1 ? tab.groupId : null
    } catch (error) {
        console.error('[Side Panel] Error getting group ID:', error)
        return null
    }
}

function migrateOldContent(oldData: OldSidepanelContent): SidepanelContent {
    let content = ''
    const highlights: Highlight[] = []

    for (const section of oldData.sections) {
        if (section.type === 'text') {
            if (content) {
                content += '\n\n'
            }
            content += section.content

            for (const oldHighlight of section.highlights) {
                const text = oldHighlight.text
                const textContent = section.content
                const textIndex = textContent.indexOf(text)

                if (textIndex !== -1) {
                    const prefix = textContent.substring(Math.max(0, textIndex - 20), textIndex)
                    const suffix = textContent.substring(textIndex + text.length, Math.min(textContent.length, textIndex + text.length + 20))

                    highlights.push({
                        id: oldHighlight.id,
                        anchor: {
                            exact: text,
                            prefix: prefix,
                            suffix: suffix
                        },
                        thread: oldHighlight.thread,
                        createdAt: oldHighlight.createdAt
                    })
                }
            }
        }
    }

    return {
        content: content,
        highlights: highlights,
        version: 2
    }
}

async function loadContent(): Promise<void> {
    const groupId = await getCurrentGroupId()
    if (groupId === null) {
        currentGroupId = null
        window.close()
        return
    }

    currentGroupId = groupId

    let data = await getSidepanelData(groupId)

    if (!data) {
        const oldContent = await getSidebarContent(groupId)
        if (oldContent) {
            data = {
                content: oldContent,
                highlights: [],
                version: 2
            }
            await setSidepanelData(groupId, data)
        }
    }

    if (data) {
        if ('sections' in data) {
            data = migrateOldContent(data as unknown as OldSidepanelContent)
            await setSidepanelData(groupId, data)
        }
    }

    if (!data) {
        data = {
            content: '',
            highlights: [],
            version: 2
        }
    }

    currentData = data
    editor.innerHTML = data.content || ''
    applyHighlightsToEditor()
    handlePlaceholder()
}

function applyHighlightsToEditor(): void {
    if (!currentData || isApplyingHighlights) return

    isApplyingHighlights = true
    applyHighlights(currentData.highlights, editor)
    isApplyingHighlights = false
}

async function checkGroupMembership(): Promise<void> {
    const groupId = await getCurrentGroupId()
    if (groupId === null || groupId !== currentGroupId) {
        window.close()
    }
}

function saveContent(): void {
    if (currentGroupId === null || !currentData) return

    if (!isApplyingHighlights) {
        currentData.content = editor.innerHTML
    }

    if (saveTimeout !== null) {
        clearTimeout(saveTimeout)
    }

    saveTimeout = window.setTimeout(async () => {
        try {
            await setSidepanelData(currentGroupId!, currentData!)
        } catch (error) {
            console.error('[Side Panel] Error saving content:', error)
        }
        saveTimeout = null
    }, 500)
}

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

    saveContent()
    applyHighlightsToEditor()
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
        const response = await chrome.runtime.sendMessage({
            type: 'executeCommand',
            command: command,
            selection: '',
        })

        if (response.success && response.response) {
            loadingIndicator.stop()
            loadingIndicator.container.remove()
            insertMarkdownAtCursor(response.response)
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

async function createHighlight(range: Range): Promise<void> {
    if (!currentData) {
        currentData = {
            content: editor.innerHTML,
            highlights: [],
            version: 2
        }
    }

    const anchor = createAnchorFromRange(range, editor)
    if (!anchor) return

    const highlight: Highlight = {
        id: generateId(),
        anchor: anchor,
        createdAt: Date.now()
    }

    currentData.highlights.push(highlight)

    applyHighlight(highlight, editor)
    saveContent()

    showThread(highlight.id)
}

function applyHighlight(highlight: Highlight, container: HTMLElement): void {
    applyHighlightUtil(highlight, container)
}

function showThread(highlightId: string): void {
    if (!currentData || !threadPanel) return

    const highlight = currentData.highlights.find(h => h.id === highlightId)
    if (!highlight) return

    selectedHighlightId = highlightId
    threadPanel.classList.remove('collapsed')
    threadPanelToggle.textContent = '▼'

    renderThreadMessages(highlight.thread)

    setTimeout(() => {
        scrollToBottom()
    }, 200)
}

function hideThread(): void {
    if (!threadPanel) return
    threadPanel.classList.add('collapsed')
    threadPanelToggle.textContent = '▶'
    selectedHighlightId = null
    if (threadMessages) {
        threadMessages.innerHTML = ''
    }
    if (threadInput) {
        threadInput.value = ''
    }
}

function scrollToBottom(): void {
    if (threadPanelContent) {
        setTimeout(() => {
            threadPanelContent.scrollTop = threadPanelContent.scrollHeight
        }, 100)
    }
}

function renderThreadMessages(thread?: Thread): void {
    if (!threadMessages) return

    threadMessages.innerHTML = ''

    if (!thread || thread.messages.length === 0) {
        const emptyMsg = document.createElement('div')
        emptyMsg.className = 'thread-empty'
        emptyMsg.textContent = 'No messages yet. Start a conversation about this highlight.'
        threadMessages.appendChild(emptyMsg)
        scrollToBottom()
        return
    }

    thread.messages.forEach(msg => {
        const msgDiv = document.createElement('div')
        msgDiv.className = `thread-message thread-message-${msg.role}`

        const contentDiv = document.createElement('div')
        contentDiv.className = 'thread-message-content'

        if (msg.role === 'assistant') {
            const html = marked.parse(msg.content) as string
            const sanitizedHtml = DOMPurify.sanitize(html)
            contentDiv.innerHTML = sanitizedHtml
        } else {
            contentDiv.textContent = msg.content
        }

        msgDiv.appendChild(contentDiv)
        threadMessages.appendChild(msgDiv)
    })

    scrollToBottom()
}

async function sendThreadMessage(message: string): Promise<void> {
    if (!currentData || !selectedHighlightId) return

    const highlight = currentData.highlights.find(h => h.id === selectedHighlightId)
    if (!highlight) return

    if (!highlight.thread) {
        highlight.thread = {
            id: generateId(),
            messages: [],
            collapsed: false,
            createdAt: Date.now()
        }
    }

    const userMessage: ThreadMessage = {
        id: generateId(),
        role: 'user',
        content: message,
        createdAt: Date.now()
    }

    highlight.thread.messages.push(userMessage)
    renderThreadMessages(highlight.thread)
    saveContent()

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'threadMessage',
            highlightId: selectedHighlightId,
            message: message,
            context: highlight.anchor.exact
        })

        if (response.success && response.response) {
            const assistantMessage: ThreadMessage = {
                id: generateId(),
                role: 'assistant',
                content: response.response,
                createdAt: Date.now()
            }

            highlight.thread.messages.push(assistantMessage)
            renderThreadMessages(highlight.thread)
            saveContent()
        }
    } catch (error) {
        console.error('[Side Panel] Error sending thread message:', error)
    }
}

async function deleteThread(): Promise<void> {
    if (!currentData || !selectedHighlightId) return

    const highlightIndex = currentData.highlights.findIndex(h => h.id === selectedHighlightId)
    if (highlightIndex !== -1) {
        currentData.highlights.splice(highlightIndex, 1)
        removeHighlights(editor)
        applyHighlightsToEditor()
        saveContent()
        hideThread()
    }
}

async function summarizeThread(): Promise<void> {
    if (!currentData || !selectedHighlightId) return

    const highlight = currentData.highlights.find(h => h.id === selectedHighlightId)
    if (!highlight || !highlight.thread || highlight.thread.messages.length === 0) return

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'summarizeThread',
            highlightId: selectedHighlightId,
            messages: highlight.thread.messages,
            context: highlight.anchor.exact
        })

        if (response.success && response.summary) {
            const summaryHtml = marked.parse(response.summary) as string
            const sanitizedSummary = DOMPurify.sanitize(summaryHtml)

            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0)
                range.collapse(false)

                const summaryDiv = document.createElement('div')
                summaryDiv.className = 'summary-section'
                summaryDiv.innerHTML = `<h3>Summary</h3>${sanitizedSummary}`

                range.insertNode(summaryDiv)

                saveContent()
                applyHighlightsToEditor()
            }
        }
    } catch (error) {
        console.error('[Side Panel] Error summarizing thread:', error)
    }
}

let mouseDownOnHighlight = false

editor.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement
    const highlightEl = target.closest('.highlight')
    if (highlightEl) {
        mouseDownOnHighlight = true
        e.preventDefault()
    } else {
        mouseDownOnHighlight = false
    }
})

editor.addEventListener('mouseup', (e) => {
    const target = e.target as HTMLElement
    const highlightEl = target.closest('.highlight')

    if (highlightEl && mouseDownOnHighlight) {
        const highlightId = highlightEl.getAttribute('data-highlight-id')
        if (highlightId) {
            showThread(highlightId)
            e.preventDefault()
            e.stopPropagation()
        }
        window.getSelection()?.removeAllRanges()
        mouseDownOnHighlight = false
        return
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (range.collapsed) {
        mouseDownOnHighlight = false
        return
    }

    const selectedText = range.toString().trim()
    if (selectedText.length === 0) {
        mouseDownOnHighlight = false
        return
    }

    setTimeout(() => {
        createHighlight(range)
        selection.removeAllRanges()
        mouseDownOnHighlight = false
    }, 100)
})

editor.addEventListener('input', () => {
    handlePlaceholder()

    if (!isApplyingHighlights) {
        removeHighlights(editor)
        saveContent()
        setTimeout(() => {
            applyHighlightsToEditor()
        }, 100)
    }
})

editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
            return
        }

        const range = selection.getRangeAt(0)
        const fullText = editor.textContent || editor.innerText || ''
        const cursorOffset = getTextOffsetBeforeCursor(range)
        const beforeCursor = fullText.substring(0, cursorOffset)
        const lastNewline = beforeCursor.lastIndexOf('\n')
        const currentLine = fullText.substring(lastNewline + 1, cursorOffset).trim()

        const command = detectCommand(currentLine)

        if (command) {
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
        }
    }
})

if (threadPanelToggle) {
    threadPanelToggle.addEventListener('click', () => {
        threadPanel.classList.toggle('collapsed')
        threadPanelToggle.textContent = threadPanel.classList.contains('collapsed') ? '▶' : '▼'
    })
}

if (threadPanelClose) {
    threadPanelClose.addEventListener('click', () => {
        hideThread()
    })
}

if (threadInput) {
    threadInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            const message = threadInput.value.trim()
            if (message) {
                threadInput.value = ''
                await sendThreadMessage(message)
            }
        }
    })

    threadInput.addEventListener('input', () => {
        if (threadInput.value.trim() === '') {
            threadInput.value = ''
        }
    })
}

if (threadDeleteBtn) {
    threadDeleteBtn.addEventListener('click', async () => {
        await deleteThread()
    })
}

loadContent().then(() => {
    handlePlaceholder()
})

setInterval(checkGroupMembership, 1000)
