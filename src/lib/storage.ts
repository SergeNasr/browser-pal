interface State {
    summaries: Record<string, Summary>;
    notes: Record<string, Note>;
}

interface Summary {
    content: string;
    createdAt: number;
}

interface Note {
    id: string;
    anchor: Anchor;
    note: string;
    createdAt: number;
}

interface Anchor {
    exact: string;
    prefix: string;
    suffix: string;
}

export async function getState(): Promise<State> {
    const result = await chrome.storage.local.get(['summaries', 'notes']) as {
        summaries?: Record<string, Summary>;
        notes?: Record<string, Note>;
    }
    return result as State
}

export async function getApiKey(): Promise<string | null> {
    const result = await chrome.storage.local.get(['openaiApiKey'])
    const value = (result as Record<string, unknown>).openaiApiKey
    return typeof value === 'string' ? value : null
}

export async function setApiKey(key: string): Promise<void> {
    await chrome.storage.local.set({ openaiApiKey: key })
}

export async function getSidebarContent(groupId: number): Promise<string | null> {
    const key = `sidebar_content_${groupId}`
    const result = await chrome.storage.local.get([key])
    const value = (result as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : null
}

export async function setSidebarContent(groupId: number, content: string): Promise<void> {
    const key = `sidebar_content_${groupId}`
    await chrome.storage.local.set({ [key]: content })
}

export async function deleteSidebarContent(groupId: number): Promise<void> {
    const key = `sidebar_content_${groupId}`
    await chrome.storage.local.remove([key])
}

export interface TextAnchor {
    exact: string
    prefix: string
    suffix: string
}

export interface ThreadMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt: number
}

export interface Thread {
    id: string
    messages: ThreadMessage[]
    collapsed: boolean
    createdAt: number
}

export interface Highlight {
    id: string
    anchor: TextAnchor
    thread?: Thread
    createdAt: number
}

export interface SidepanelContent {
    content: string
    highlights: Highlight[]
    version: number
}

export interface OldSidepanelContent {
    sections: Array<{
        id: string
        type: 'text' | 'summary'
        content: string
        highlights: Array<{
            id: string
            text: string
            startOffset: number
            endOffset: number
            thread?: Thread
            createdAt: number
        }>
        createdAt: number
    }>
    version: number
}

export async function getSidepanelData(groupId: number): Promise<SidepanelContent | null> {
    const key = `sidepanel_data_${groupId}`
    const result = await chrome.storage.local.get([key])
    const value = (result as Record<string, unknown>)[key]
    if (value && typeof value === 'object') {
        return value as SidepanelContent
    }
    return null
}

export async function setSidepanelData(groupId: number, data: SidepanelContent): Promise<void> {
    const key = `sidepanel_data_${groupId}`
    await chrome.storage.local.set({ [key]: data })
}

export async function deleteSidepanelData(groupId: number): Promise<void> {
    const key = `sidepanel_data_${groupId}`
    await chrome.storage.local.remove([key])
}

export type { State }