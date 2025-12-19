import { showPalette } from './command-palette'

chrome.runtime.onMessage.addListener((message: { type: string }, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === 'openPalette') {
        showPalette()
    }
})

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        e.preventDefault()
        showPalette()
    }
})
