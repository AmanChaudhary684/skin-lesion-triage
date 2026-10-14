Optional automated tests (29). Not needed to run the app.

1. In frontend/: npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
2. Copy these files to frontend/src/test/
3. Add this to your vite.config.js inside defineConfig({ ... }):
     test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.js' },
4. npx vitest run
