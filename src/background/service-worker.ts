import { loadCommand } from '../lib/command-loader'
import { getApiKey } from '../lib/storage'

interface ExecuteCommandMessage {
    type: 'executeCommand'
    command: string
    selection: string
}

async function getPageContent(tabId: number): Promise<string> {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const body = document.body.innerText || ''
            const title = document.title || ''
            return `${title}\n\n${body}`.trim()
        },
    })
    return results[0]?.result || ''
}

function processTemplate(template: string, pageContent: string, selection: string): string {
    return template
        .replace(/\{\{pageContent\}\}/g, pageContent)
        .replace(/\{\{selection\}\}/g, selection)
}

async function callOpenAI(prompt: string): Promise<string> {
    const apiKey = await getApiKey()
    if (!apiKey) {
        throw new Error('OpenAI API key not configured')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
        throw new Error(error.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
}

async function handleExecuteCommand(
    message: ExecuteCommandMessage,
    sender: chrome.runtime.MessageSender
): Promise<{ success: boolean; response?: string; error?: string }> {
    console.log(`[Service Worker] Received command execution request: /${message.command}`)

    try {
        console.log(`[Service Worker] Loading command: /${message.command}`)
        const cmd = await loadCommand(message.command)
        console.log(`[Service Worker] Command loaded: /${message.command}`)

        let tabId = sender.tab?.id

        if (!tabId) {
            console.log(`[Service Worker] No tab in sender, querying active tab`)
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
            tabId = tabs[0]?.id
        }

        if (!tabId) {
            console.error(`[Service Worker] No active tab found for command: /${message.command}`)
            return { success: false, error: 'No active tab found' }
        }

        console.log(`[Service Worker] Getting page content from tab ${tabId}`)
        const pageContent = await getPageContent(tabId)
        console.log(`[Service Worker] Page content retrieved (${pageContent.length} chars)`)

        console.log(`[Service Worker] Processing template for /${message.command}`)
        const prompt = processTemplate(cmd.template, pageContent, message.selection)

        console.log(`[Service Worker] Calling OpenAI API for /${message.command}`)
        const response = await callOpenAI(prompt)
        console.log(`[Service Worker] OpenAI API response received (${response.length} chars) for /${message.command}`)

        return { success: true, response }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Service Worker] Command execution failed for /${message.command}:`, errorMessage)
        return { success: false, error: errorMessage }
    }
}

chrome.action.onClicked.addListener((tab) => {
    console.log('action clicked', tab)
    const tabId = tab.id
    if (!tabId) return

    chrome.sidePanel.open({ tabId }).catch((error) => {
        console.error('Side panel open failed:', error)
    })

    chrome.tabs.get(tabId).then((tabInfo) => {
        if (tabInfo.groupId === -1) {
            chrome.tabs.group({ tabIds: [tabId] }).then((groupId) => {
                chrome.tabGroups.update(groupId, { title: 'Browser Pal' }).catch((error) => {
                    console.error('Group update failed:', error)
                })
            }).catch((error) => {
                console.error('Group creation failed:', error)
            })
        }
    }).catch((error) => {
        console.error('Tab get failed:', error)
    })
})

chrome.runtime.onMessage.addListener(
    (message: ExecuteCommandMessage, sender: chrome.runtime.MessageSender, sendResponse) => {
        if (message.type === 'executeCommand') {
            console.log(`[Service Worker] Message received: executeCommand for /${message.command}`)
            handleExecuteCommand(message, sender).then((result) => {
                console.log(`[Service Worker] Sending response for /${message.command}:`, result.success ? 'success' : 'error')
                sendResponse(result)
            })
            return true
        }
    }
)

