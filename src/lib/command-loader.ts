export interface Command {
    name: string;
    description: string;
    requiresSelection: boolean;
    template: string;
}

function parseFrontmatter(content: string): { data: Record<string, any>; content: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)

    if (!match) {
        console.warn(`Invalid frontmatter in command ${content}`)
        return { data: {}, content: content.trim() }
    }

    const yamlContent = match[1]
    const body = match[2]

    const data: Record<string, any> = {}
    yamlContent.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim()
            let value: any = line.slice(colonIndex + 1).trim()

            if (value === 'true') value = true
            else if (value === 'false') value = false

            data[key] = value
        }
    })

    return { data, content: body.trim() }
}

const commandModules = import.meta.glob('../commands/*.md', { query: "?raw", eager: true }) as Record<string, string>;

export async function loadCommand(name: String): Promise<Command> {
    const filePath = `../commands/${name}.md`
    const rawContent = commandModules[filePath]

    if (!rawContent) {
        throw new Error(`Command ${name} not found`)
    }

    const content = typeof rawContent === 'string' ? rawContent : (rawContent as any).default || rawContent
    if (typeof content !== 'string') {
        throw new Error(`Command ${name} has invalid content`)
    }

    const parsed = parseFrontmatter(content)
    return {
        name: parsed.data.name,
        description: parsed.data.description,
        requiresSelection: parsed.data.requiresSelection ?? false,
        template: parsed.content,
    }
}

export function loadAllCommands(): Command[] {
    const commands: Command[] = []

    for (const [path, rawContent] of Object.entries(commandModules)) {
        if (!rawContent) {
            console.warn(`Skipping invalid command module: ${path}`)
            continue
        }

        const content = typeof rawContent === 'string' ? rawContent : (rawContent as any).default || rawContent
        if (typeof content !== 'string') {
            console.warn(`Skipping invalid command module: ${path}`)
            continue
        }

        const parsed = parseFrontmatter(content)
        commands.push({
            name: parsed.data.name,
            description: parsed.data.description,
            requiresSelection: parsed.data.requiresSelection ?? false,
            template: parsed.content,
        })
    }

    return commands
}