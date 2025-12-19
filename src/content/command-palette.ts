import { loadAllCommands, type Command } from '../lib/command-loader'
import htmlContent from './ui/command-palette/palette.html?raw'
import cssContent from './ui/command-palette/palette.css?raw'

const PALETTE_ID = 'browser-pal-palette'
let paletteElement: HTMLElement | null = null
let inputElement: HTMLInputElement | null = null
let commandsListElement: HTMLElement | null = null
let commands: Command[] = []
let selectedIndex = 0
let filteredCommands: Command[] = []

export function initCommandPalette(): void {
    if (paletteElement) return

    const style = document.createElement('style')
    style.textContent = cssContent
    document.head.appendChild(style)

    const container = document.createElement('div')
    container.innerHTML = htmlContent
    paletteElement = container.firstElementChild as HTMLElement
    document.body.appendChild(paletteElement)

    inputElement = paletteElement.querySelector('#palette-input') as HTMLInputElement
    commandsListElement = paletteElement.querySelector('#palette-commands') as HTMLElement

    commands = loadAllCommands()
    filteredCommands = commands

    inputElement.addEventListener('input', handleInput)
    inputElement.addEventListener('keydown', handleKeyDown)

    const backdrop = paletteElement.querySelector('.palette-backdrop')
    backdrop?.addEventListener('click', hidePalette)

    renderCommands()
}

function handleInput(e: Event): void {
    const value = (e.target as HTMLInputElement).value.trim()

    if (value.startsWith('/')) {
        const query = value.slice(1).toLowerCase()
        filteredCommands = commands.filter(cmd =>
            cmd.name.toLowerCase().includes(query) ||
            cmd.description.toLowerCase().includes(query)
        )
    } else {
        filteredCommands = commands
    }

    selectedIndex = 0
    renderCommands()
}

function handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
        case 'Escape':
            hidePalette()
            break
        case 'ArrowDown':
            e.preventDefault()
            selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1)
            renderCommands()
            break
        case 'ArrowUp':
            e.preventDefault()
            selectedIndex = Math.max(selectedIndex - 1, 0)
            renderCommands()
            break
        case 'Enter':
            e.preventDefault()
            if (filteredCommands[selectedIndex]) {
                executeCommand(filteredCommands[selectedIndex])
            }
            break
    }
}

function renderCommands(): void {
    if (!commandsListElement) return

    commandsListElement.innerHTML = ''

    if (filteredCommands.length === 0) {
        const item = document.createElement('li')
        item.className = 'palette-command-item no-results'
        item.textContent = 'No commands found'
        commandsListElement.appendChild(item)
        return
    }

    filteredCommands.forEach((cmd, index) => {
        const item = document.createElement('li')
        item.className = 'palette-command-item'
        if (index === selectedIndex) {
            item.classList.add('selected')
        }

        const name = document.createElement('div')
        name.className = 'palette-command-name'
        name.textContent = cmd.name

        const desc = document.createElement('div')
        desc.className = 'palette-command-description'
        desc.textContent = cmd.description

        item.appendChild(name)
        item.appendChild(desc)

        item.addEventListener('click', () => executeCommand(cmd))
        commandsListElement!.appendChild(item)
    })

    const selectedItem = commandsListElement.querySelector('.selected')
    if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' })
    }
}

function executeCommand(cmd: Command): void {
    hidePalette()

    const selection = window.getSelection()?.toString().trim() || ''

    if (cmd.requiresSelection && !selection) {
        alert(`Command /${cmd.name} requires selected text`)
        return
    }

    chrome.runtime.sendMessage({
        type: 'executeCommand',
        command: cmd.name,
        selection,
    })
}

export function showPalette(): void {
    if (!paletteElement || !inputElement) {
        initCommandPalette()
    }

    if (paletteElement && inputElement) {
        paletteElement.classList.remove('palette-hidden')
        inputElement.value = ''
        inputElement.focus()
        filteredCommands = commands
        selectedIndex = 0
        renderCommands()
    }
}

export function hidePalette(): void {
    if (paletteElement) {
        paletteElement.classList.add('palette-hidden')
        if (inputElement) {
            inputElement.value = ''
        }
    }
}
