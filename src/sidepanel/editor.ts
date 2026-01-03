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
import { generateId } from '../lib/anchor-utils'
import { EditorController } from '../lib/editor-controller'

async function parseMarkdown(markdown: string): Promise<string> {
    const result = marked.parse(markdown)
    if (result instanceof Promise) {
        return await result
    }
    return result
}

const editorElement = document.getElementById('editor') as HTMLDivElement
const threadPanel = document.getElementById('thread-panel') as HTMLDivElement
const threadMessages = threadPanel?.querySelector('.thread-messages') as HTMLDivElement
const threadInput = threadPanel?.querySelector('.thread-input') as HTMLInputElement
const threadPanelToggle = threadPanel?.querySelector('.thread-panel-toggle') as HTMLButtonElement
const threadPanelClose = threadPanel?.querySelector('.thread-panel-close') as HTMLButtonElement
const threadDeleteBtn = threadPanel?.querySelector('.thread-delete-btn') as HTMLButtonElement
const threadPanelContent = threadPanel?.querySelector('.thread-panel-content') as HTMLDivElement

if (!editorElement) {
    throw new Error('Editor element not found')
}

// Initialize the EditorController (handles highlights via overlay system)
const editor = new EditorController(editorElement)

let currentGroupId: number | null = null
let saveTimeout: number | null = null
let currentData: SidepanelContent | null = null
let selectedHighlightId: string | null = null

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
    editor.setContent(data.content || '')
    editor.loadHighlights(data.highlights)
    handlePlaceholder()
}

async function checkGroupMembership(): Promise<void> {
    const groupId = await getCurrentGroupId()
    if (groupId === null || groupId !== currentGroupId) {
        window.close()
    }
}

function saveContent(): void {
    if (currentGroupId === null || !currentData) return

    // Update content from editor
    currentData.content = editor.getContent()
    // Update highlights from editor (in case anchors were updated due to edits)
    currentData.highlights = editor.getAllHighlights()

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

async function insertMarkdownAtCursor(markdown: string): Promise<void> {
    const html = await parseMarkdown(markdown)
    const sanitizedHtml = DOMPurify.sanitize(html)
    editor.insertAtCursor(sanitizedHtml)
    saveContent()
}

function handlePlaceholder(): void {
    const element = editor.getElement()
    if (element.textContent?.trim() === '') {
        element.classList.add('empty')
    } else {
        element.classList.remove('empty')
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
            await insertMarkdownAtCursor(response.response)
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
    const element = editor.getElement()
    const fullText = element.textContent || element.innerText || ''
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
        const startPos = findTextPosition(element, lineStartOffset)
        const endPos = findTextPosition(element, actualLineEnd)

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
    const element = editor.getElement()
    const rangeBefore = range.cloneRange()
    rangeBefore.selectNodeContents(element)
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

async function createHighlight(): Promise<void> {
    if (!currentData) {
        currentData = {
            content: editor.getContent(),
            highlights: [],
            version: 2
        }
    }

    const highlightId = editor.addHighlightFromSelection()
    if (!highlightId) return

    // Get the created highlight and add thread data structure
    const highlight = editor.getHighlight(highlightId)
    if (highlight) {
        currentData.highlights = editor.getAllHighlights()
        saveContent()
        await showThread(highlightId)
    }
}

async function showThread(highlightId: string): Promise<void> {
    if (!currentData || !threadPanel) return

    const highlight = editor.getHighlight(highlightId)
    if (!highlight) return

    selectedHighlightId = highlightId
    threadPanel.classList.remove('collapsed')
    threadPanelToggle.textContent = '▼'

    await renderThreadMessages(highlight.thread)

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

async function renderThreadMessages(thread?: Thread): Promise<void> {
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

    for (const msg of thread.messages) {
        const msgDiv = document.createElement('div')
        msgDiv.className = `thread-message thread-message-${msg.role}`

        const contentDiv = document.createElement('div')
        contentDiv.className = 'thread-message-content'

        if (msg.role === 'assistant') {
            const html = await parseMarkdown(msg.content)
            const sanitizedHtml = DOMPurify.sanitize(html)
            contentDiv.innerHTML = sanitizedHtml
        } else {
            contentDiv.textContent = msg.content
        }

        msgDiv.appendChild(contentDiv)
        threadMessages.appendChild(msgDiv)
    }

    scrollToBottom()
}

async function sendThreadMessage(message: string): Promise<void> {
    if (!currentData || !selectedHighlightId) return

    const highlight = editor.getHighlight(selectedHighlightId)
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
    editor.updateHighlight(selectedHighlightId, { thread: highlight.thread })
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
            editor.updateHighlight(selectedHighlightId, { thread: highlight.thread })
            renderThreadMessages(highlight.thread)
            saveContent()
        }
    } catch (error) {
        console.error('[Side Panel] Error sending thread message:', error)
    }
}

async function deleteThread(): Promise<void> {
    if (!currentData || !selectedHighlightId) return

    editor.removeHighlight(selectedHighlightId)
    currentData.highlights = editor.getAllHighlights()
    saveContent()
    hideThread()
}

// Set up EditorController event handlers
editor.onContentChange(() => {
    handlePlaceholder()
    hideThreadButton()
    saveContent()
})

editor.onHighlightClick((highlightId) => {
    showThread(highlightId)
})

editor.onHighlightUpdated((highlightId, newExact) => {
    // Highlight text was edited - save the updated anchor
    saveContent()
})

// Thread button for creating new highlights
const threadButton = document.createElement('button')
threadButton.className = 'thread-button'
threadButton.textContent = 'thread'
threadButton.style.display = 'none'
const editorContainer = editorElement.parentElement || document.body
editorContainer.appendChild(threadButton)

let currentSelectionRange: Range | null = null

function showThreadButton(range: Range): void {
    if (!range || range.collapsed) {
        hideThreadButton()
        return
    }

    const selectedText = range.toString().trim()
    if (selectedText.length === 0) {
        hideThreadButton()
        return
    }

    const rect = range.getBoundingClientRect()
    const containerRect = editorContainer.getBoundingClientRect()

    threadButton.style.display = 'block'
    const buttonWidth = 60
    const buttonHeight = 28
    const left = rect.left - containerRect.left + rect.width / 2 - buttonWidth / 2
    const top = rect.top - containerRect.top - buttonHeight - 8

    threadButton.style.left = `${Math.max(8, Math.min(left, containerRect.width - buttonWidth - 8))}px`
    threadButton.style.top = `${Math.max(8, top)}px`

    currentSelectionRange = range
}

function hideThreadButton(): void {
    threadButton.style.display = 'none'
    currentSelectionRange = null
}

threadButton.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (currentSelectionRange) {
        try {
            const range = currentSelectionRange.cloneRange()
            const element = editor.getElement()
            if (range.collapsed || !element.contains(range.commonAncestorContainer)) {
                hideThreadButton()
                return
            }

            const selection = window.getSelection()
            if (selection) {
                selection.removeAllRanges()
                selection.addRange(range)
            }
            await createHighlight()
            hideThreadButton()
            if (selection) {
                selection.removeAllRanges()
            }
        } catch (error) {
            console.error('[Side Panel] Error creating highlight from button:', error)
            hideThreadButton()
        }
    }
})

// Selection change handling via EditorController
editor.onSelectionChange((selection) => {
    if (!selection) {
        hideThreadButton()
        return
    }

    const element = editor.getElement()
    if (!element.contains(selection.range.commonAncestorContainer)) {
        hideThreadButton()
        return
    }

    // Don't show thread button if selection is within an existing highlight overlay
    // (The overlay manager handles highlight clicks)
    showThreadButton(selection.range)
})

// Keydown handler for command detection
editorElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
            return
        }

        const range = selection.getRangeAt(0)
        const element = editor.getElement()
        const fullText = element.textContent || element.innerText || ''
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
                rangeBefore.selectNodeContents(element)
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

// Thread panel event listeners
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

// Scroll/resize handlers for thread button positioning
editorElement.addEventListener('scroll', () => {
    if (currentSelectionRange && threadButton.style.display !== 'none') {
        showThreadButton(currentSelectionRange)
    }
})

window.addEventListener('resize', () => {
    if (currentSelectionRange && threadButton.style.display !== 'none') {
        showThreadButton(currentSelectionRange)
    }
})

document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target === threadButton || threadButton.contains(target)) {
        return
    }

    if (!editorElement.contains(target)) {
        hideThreadButton()
    }
})

// Initialize
loadContent().then(() => {
    handlePlaceholder()
})

setInterval(checkGroupMembership, 1000)
