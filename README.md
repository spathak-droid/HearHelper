# HearHelper

HearHelper is a browser-based companion that lets you speak to Codex, hear natural responses, and stream curated public-domain audiobooks (think Sherlock Holmes). Press and hold anywhere to talk, release to send, and enjoy hands-free listening.

> ℹ️ All narrated stories bundled with this prototype are sourced from public-domain books.

## What this project does

- Captures speech via the Web Speech API and sends it to a backend over WebSockets.
- Streams TTS/audio responses, including multi-chunk book narration.
- Provides a Help page with FAQs and a Sign-in page for future authentication layers.
- Shows celebratory dialogs (e.g., when you finish a book chunk) encouraging the user to sign in and continue.

## How to run it locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Angular dev server:
   ```bash
   npm run start
   ```
3. Visit `http://localhost:4200/` in Chrome (recommended) and allow microphone access when prompted.
4. Ensure your backend WebSocket server is running at `ws://localhost:8000/ws/hat/` (or update the URL in `mainPage.ts`).

Hot reloading is enabled, so UI changes will auto-refresh. If speech or TTS hangs, reload the page after restarting the backend.

## Project structure highlights

- `src/app/pages/mainPage/` – voice UI, WebSocket logic, playback controls, and dialogs.
- `src/app/pages/helpPage/` – FAQ view with guidance for new users.
- `src/app/pages/signInPage/` – placeholder for Google/manual sign-in flows.
- `ssl/` – certificates (if you plan to run the backend with HTTPS/WSS).

## Additional scripts

- `npm run build` – production build emitted to `dist/`.
- `npm run test` – execute Angular’s unit tests (Karma/Cypress not configured yet).

## Notes

- Designed for desktop or large-screen tablets with pointer support.
- Uses experimental Web Speech APIs; availability depends on the browser.
- Audio playback currently supports MP3 chunks delivered as base64 from the backend.

Happy building! Let us know what other public-domain books you’d like to hear through HearHelper. 🎧
