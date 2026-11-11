# Recall extension

React + TypeScript frontend for the Chrome side panel. See the [project README](../README.md) for backend setup, PostgreSQL and phone pairing.

From this directory:

```powershell
npm ci
npm run dev
npm run lint
npm test
npm run build
```

Load `dist` as an unpacked extension at chrome://extensions. Rebuild, reload Recall and reopen the panel after editing. The backend toolbar status does not need to be connected to use local quizzes, flashcards or the timer.

The API defaults to localhost:8080/api. A hosted backend needs a build-time VITE_API_BASE value and its exact origin in the manifest host permissions. Never include private server keys in frontend environment variables: Vite embeds them in browser assets.

The visual system uses Space Grotesk, IBM Plex Sans and IBM Plex Mono with charcoal/signal-green tokens. Layouts use a narrow icon rail below 700px and labelled navigation above it. Camera tools remain collapsed and explicitly planned. Connect requires an account; images are reviewed and transcribed manually before their text is added to Notes.
