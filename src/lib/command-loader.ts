import matter from 'gray-matter'

export interface Command {
    name: string;
    description: string;
    requiresSelection: boolean;
    opensNewTab: boolean;
    template: string;
}

const commandModules = import.meta.glob('../commands/*.md', { query: "?raw", eager: true }) as Record<string, string>;

export async function loadCommand(name: String): Promise<Command> {
    const filePath = `../commands/${name}.md`
    const rawContent = commandModules[filePath]

    if (!rawContent) {
        throw new Error(`Command ${name} not found`)
    }

    const parsed = matter(rawContent)
    return {
        name: parsed.data.name,
        description: parsed.data.description,
        requiresSelection: parsed.data.requiresSelection ?? false,
        opensNewTab: parsed.data.opensNewTab ?? false,
        template: parsed.content.trim(),
    }
}