import { defineConfig } from 'vite'
import { resolve } from 'path'

// Separate Vite config for the test harness (no Chrome extension plugin)
export default defineConfig({
    root: resolve(__dirname, 'test'),
    publicDir: false,
    build: {
        outDir: resolve(__dirname, 'dist-test'),
        emptyOutDir: true,
    },
    server: {
        port: 3001,
        open: true
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    }
})
