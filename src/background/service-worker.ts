import { loadCommand } from '../lib/command-loader'
import { getApiKey, deleteSidebarContent } from '../lib/storage'

interface ExecuteCommandMessage {
    type: 'executeCommand'
    command: string
    selection: string
}

interface ThreadMessageRequest {
    type: 'threadMessage'
    highlightId: string
    message: string
    context: string
}

async function getPageContent(tabId: number): Promise<string> {
    const tab = await chrome.tabs.get(tabId)
    const url = tab.url || ''

    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://')) {
        throw new Error(`Cannot access ${url.startsWith('chrome://') ? 'chrome://' : url.startsWith('edge://') ? 'edge://' : 'extension'} URLs`)
    }

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

async function callOpenAI(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): Promise<string> {
    const apiKey = await getApiKey()
    if (!apiKey) {
        throw new Error('OpenAI API key not configured')
    }

    const model = 'gpt-5-nano-2025-08-07'
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
        }),
    })

    console.log('model:', model)
    const text = await response.clone().text()
    console.log(text)

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
    try {
        const cmd = await loadCommand(message.command)

        let tabId = sender.tab?.id

        if (!tabId) {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
            tabId = tabs[0]?.id
        }

        if (!tabId) {
            console.error(`[Service Worker] No active tab found for command: /${message.command}`)
            return { success: false, error: 'No active tab found' }
        }

        const pageContent = await getPageContent(tabId)
        const prompt = processTemplate(cmd.template, pageContent, message.selection)
        const response = await callOpenAI([{ role: 'user', content: prompt }])

        return { success: true, response }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Service Worker] Command execution failed for /${message.command}:`, errorMessage)
        return { success: false, error: errorMessage }
    }
}

chrome.action.onClicked.addListener(async (tab) => {
    const tabId = tab.id
    if (!tabId) return

    chrome.sidePanel.open({ tabId }).catch((error) => {
        console.error('Side panel open failed:', error)
    })

    try {
        const tabInfo = await chrome.tabs.get(tabId)

        if (tabInfo.groupId === -1) {
            const groupId = await chrome.tabs.group({ tabIds: [tabId] })
            await chrome.tabGroups.update(groupId, { title: 'Browser Pal' }).catch((error) => {
                console.error('Group update failed:', error)
            })
        }
    } catch (error) {
        console.error('Action click handler failed:', error)
    }
})

async function handleThreadMessage(
    message: ThreadMessageRequest,
    sender: chrome.runtime.MessageSender
): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
        const systemPrompt = `You are a helpful assistant discussing a highlighted section of text. The user has highlighted: "${message.context}"

Please provide a helpful, concise response to the user's question about this highlighted text.`

        const messages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: message.message }
        ]

        const response = await callOpenAI(messages)
        return { success: true, response }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Service Worker] Thread message failed:`, errorMessage)
        return { success: false, error: errorMessage }
    }
}

chrome.runtime.onMessage.addListener(
    (message: ExecuteCommandMessage | ThreadMessageRequest, sender: chrome.runtime.MessageSender, sendResponse) => {
        if (message.type === 'executeCommand') {
            handleExecuteCommand(message, sender).then((result) => {
                sendResponse(result)
            })
            return true
        } else if (message.type === 'threadMessage') {
            handleThreadMessage(message, sender).then((result) => {
                sendResponse(result)
            })
            return true
        }
    }
)

chrome.tabGroups.onRemoved.addListener(async (group) => {
    try {
        await deleteSidebarContent(group.id)
    } catch (error) {
        console.error(`[Service Worker] Error deleting sidebar content for group ${group.id}:`, error)
    }
})

