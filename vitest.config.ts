import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
	plugins: [react()],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup/vitest.setup.ts'],
		include: [
			'tests/unit/**/*.test.ts',
			'tests/unit/**/*.test.tsx',
			'tests/integration/**/*.test.ts',
		],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['services/**', 'repositories/**', 'lib/**'],
			exclude: ['lib/db/migrations/**', 'lib/db/seeds/**'],
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, '.'),
		},
	},
})
