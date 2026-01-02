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
    try {
        const cmd = await loadCommand(message.command)
        const tabId = sender.tab?.id

        if (!tabId) {
            return { success: false, error: 'No active tab' }
        }

        const pageContent = await getPageContent(tabId)
        const prompt = processTemplate(cmd.template, pageContent, message.selection)
        const response = await callOpenAI(prompt)

        return { success: true, response }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

chrome.runtime.onMessage.addListener(
    (message: ExecuteCommandMessage, sender: chrome.runtime.MessageSender, sendResponse) => {
        if (message.type === 'executeCommand') {
            handleExecuteCommand(message, sender).then(sendResponse)
            return true
        }
    }
)
