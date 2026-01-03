/**
 * Test harness for the overlay-based editor.
 * Run with: pnpm dev, then open test/index.html
 */

import { EditorController, SelectionInfo } from '../src/lib/editor-controller'
import { Highlight, TextAnchor } from '../src/lib/storage'
import '../src/sidepanel/editor.css'

// Mock chrome.storage API for testing
declare global {
    interface Window {
        chrome: typeof chrome
    }
}

const mockStorage: Record<string, unknown> = {}

window.chrome = {
    storage: {
        local: {
            get: (keys: string | string[] | null, callback?: (result: Record<string, unknown>) => void) => {
                const result: Record<string, unknown> = {}
                const keyArray = Array.isArray(keys) ? keys : keys ? [keys] : Object.keys(mockStorage)
                for (const key of keyArray) {
                    if (key in mockStorage) {
                        result[key] = mockStorage[key]
                    }
                }
                callback?.(result)
                return Promise.resolve(result)
            },
            set: (items: Record<string, unknown>, callback?: () => void) => {
                Object.assign(mockStorage, items)
                callback?.()
                return Promise.resolve()
            },
            remove: (keys: string | string[], callback?: () => void) => {
                const keyArray = Array.isArray(keys) ? keys : [keys]
                for (const key of keyArray) {
                    delete mockStorage[key]
                }
                callback?.()
                return Promise.resolve()
            }
        }
    }
} as typeof chrome

// Sample content for testing
const SAMPLE_CONTENT = `
<h1>Test Editor</h1>
<p>This is a test paragraph. Try selecting some text and clicking the "thread" button that appears.</p>
<p>You can also test multi-line selections by selecting text across multiple paragraphs like this one.</p>
<h2>Features to Test</h2>
<ul>
    <li>Text selection shows a hover button</li>
    <li>Clicking the button creates a highlight</li>
    <li>Highlights are rendered as overlays (not inline spans)</li>
    <li>Editing text should not corrupt highlights</li>
    <li>Scrolling should update highlight positions</li>
</ul>
<p>Try editing this text and watch the highlights adjust their positions automatically.</p>
<blockquote>This is a blockquote for testing highlight across different block elements.</blockquote>
<p>Final paragraph for testing.</p>
`.trim()

// Initialize the test harness
function init() {
    const editor = document.getElementById('editor')
    const threadButton = document.getElementById('thread-button')
    const statusEl = document.getElementById('status')
    const highlightListEl = document.getElementById('highlight-list')

    if (!editor || !threadButton || !statusEl || !highlightListEl) {
        console.error('Required elements not found')
        return
    }

    // Set initial content
    editor.innerHTML = SAMPLE_CONTENT

    // Create editor controller
    const controller = new EditorController(editor)

    // Track current selection for thread button
    let currentSelection: SelectionInfo | null = null

    // Handle selection changes
    controller.onSelectionChange((selection) => {
        currentSelection = selection

        if (selection && !controller.isPointInHighlight(0, 0)) {
            // Show thread button near selection
            const range = selection.range
            const rect = range.getBoundingClientRect()

            threadButton.style.display = 'block'
            threadButton.style.left = `${rect.left + rect.width / 2 - 40}px`
            threadButton.style.top = `${rect.top - 40}px`

            updateStatus(`Selected: "${selection.text.substring(0, 30)}${selection.text.length > 30 ? '...' : ''}"`)
        } else {
            threadButton.style.display = 'none'
            updateStatus('No selection')
        }
    })

    // Handle thread button click
    threadButton.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (currentSelection) {
            const highlightId = controller.addHighlightFromSelection()
            if (highlightId) {
                updateStatus(`Created highlight: ${highlightId}`)
                updateHighlightList()
            } else {
                updateStatus('Failed to create highlight')
            }
        }

        threadButton.style.display = 'none'
    })

    // Handle content changes
    controller.onContentChange(() => {
        updateStatus('Content changed - highlights repositioned')
    })

    // Handle highlight clicks
    controller.onHighlightClick((highlightId) => {
        updateStatus(`Clicked highlight: ${highlightId}`)
        // In the real app, this would open the thread panel
    })

    // Helper to update status
    function updateStatus(message: string) {
        statusEl.textContent = message
        console.log('[Harness]', message)
    }

    // Helper to update highlight list
    function updateHighlightList() {
        const highlights = controller.getAllHighlights()
        highlightListEl.innerHTML = highlights.map(h => `
            <div class="highlight-item">
                <span>"${h.anchor.exact.substring(0, 20)}${h.anchor.exact.length > 20 ? '...' : ''}"</span>
                <button data-id="${h.id}">Remove</button>
            </div>
        `).join('')

        // Add remove handlers
        highlightListEl.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id')
                if (id) {
                    controller.removeHighlight(id)
                    updateHighlightList()
                    updateStatus(`Removed highlight: ${id}`)
                }
            })
        })
    }

    // Add some sample highlights for testing
    const addSampleHighlightsBtn = document.getElementById('add-sample-highlights')
    addSampleHighlightsBtn?.addEventListener('click', () => {
        const sampleHighlights: Highlight[] = [
            {
                id: 'sample-1',
                anchor: { exact: 'test paragraph', prefix: 'This is a ', suffix: '. Try selecting' },
                createdAt: Date.now()
            },
            {
                id: 'sample-2',
                anchor: { exact: 'multi-line selections', prefix: 'also test ', suffix: ' by selecting' },
                createdAt: Date.now()
            }
        ]

        controller.loadHighlights(sampleHighlights)
        updateHighlightList()
        updateStatus('Loaded sample highlights')
    })

    // Clear highlights button
    const clearHighlightsBtn = document.getElementById('clear-highlights')
    clearHighlightsBtn?.addEventListener('click', () => {
        controller.loadHighlights([])
        updateHighlightList()
        updateStatus('Cleared all highlights')
    })

    updateStatus('Editor initialized - select text to create highlights')

    // Expose controller for debugging
    ;(window as unknown as { controller: EditorController }).controller = controller
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
} else {
    init()
}
