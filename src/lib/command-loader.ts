import matter from 'gray-matter'

export interface Command {
    name: string;
    description: string;
    requiresSelection: boolean;
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
        template: parsed.content.trim(),
    }
}

export function loadAllCommands(): Command[] {
    const commands: Command[] = []

    for (const [path, rawContent] of Object.entries(commandModules)) {
        const parsed = matter(rawContent as string)
        commands.push({
            name: parsed.data.name,
            description: parsed.data.description,
            requiresSelection: parsed.data.requiresSelection ?? false,
            template: parsed.content.trim(),
        })
    }

    return commands
}