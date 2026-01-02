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
    return result.openaiApiKey || null
}

export async function setApiKey(key: string): Promise<void> {
    await chrome.storage.local.set({ openaiApiKey: key })
}

export type { State }