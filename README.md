# Recall

A Chrome side-panel workspace for studying your own notes and course materials. I started Recall because getting an AI answer immediately can feel like understanding without actually testing what I remember. Recall keeps practice, hints and review beside the material.

## What works

- Import TXT/Markdown or selectable-text PDFs, including past papers. PDF extraction uses the Java backend; scanned PDFs need OCR and are not supported yet.
- Create fill-in-the-blank, multiple-choice, long-answer or mixed practice. The Spring Boot endpoint prioritizes previously missed material; the extension has a local fallback.
- Track misses and successful attempts per source passage, schedule later review after correct responses, retry answers and save history with account progress. This is a rule-based review scheduler, not a trained adaptive ML model.
- Use flashcards, a deadline-based focus timer, and a hint-only Recall AI tutor. Long answers are explicitly self-reviewed.
- Register/sign in to save progress. Local file storage is the default; a PostgreSQL profile is available.
- Pair a phone from Connect using a locally generated QR code. Open the browser upload page without installing an app, send a JPEG/PNG, then refresh the desktop inbox to review/transcribe and import its text.

The interface uses a compact utility layout, Space Grotesk + IBM Plex Sans typography, IBM Plex Mono for status/data, and charcoal/signal-green or light surfaces.

## Stack

React, TypeScript, Vite, plain CSS, Chrome Manifest V3, Java 21, Spring Boot, JDBC/PostgreSQL, PDFBox, Maven and GitHub Actions. OpenAI is optional for selecting restricted hint strategies; no key is needed for local hints or quizzes.

## Run locally

Install Node.js 24 and JDK 21. From the repository root:

```powershell
npm ci --prefix extension
npm run build --prefix extension
cd backend
.\mvnw.cmd spring-boot:run
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist` (not `extension` or `public`). Click Recall's toolbar icon. Rebuild and reload the extension after source changes. Health check: `http://localhost:8080/api/health`.

For frontend development, use `npm run dev --prefix extension` from the root. The installed extension uses built assets, not Vite hot reload.

### PostgreSQL

The default local mode does not require Docker and preserves the existing file-account workflow. To use PostgreSQL, start Docker Desktop and set a private password in the same PowerShell terminal:

```powershell
$env:RECALL_DATABASE_PASSWORD = [Net.NetworkCredential]::new('', (Read-Host 'Local database password' -AsSecureString)).Password
```

From the repository root:

```powershell
docker compose up -d postgres
$env:SPRING_PROFILES_ACTIVE = 'postgres'
cd backend
.\mvnw.cmd spring-boot:run
```

PostgreSQL is bound to the local machine on port 5432. The profile uses the local `recall` database and user. A hosted database can be configured with `RECALL_DATABASE_URL`, `RECALL_DATABASE_USER` and `RECALL_DATABASE_PASSWORD`; keep their values outside Git. The URL must be a JDBC PostgreSQL URL. No environment values should be pasted into logs or support messages.

Profiles use separate account stores. Existing file accounts are not automatically migrated to PostgreSQL; switching back restores access to the original files. Do not delete them. PostgreSQL accounts and workspace snapshots persist; login sessions remain in memory and require signing in again after a backend restart. The initial table is created idempotently; a schema migration tool and a bounded connection pool are future production work.

### Recall Connect: phone to desktop

1. Sign in on the extension and open **Connect**.
2. Enter the address of this same backend that your phone can reach. For local tests, both devices must be on the same trusted Wi-Fi and the address must use your computer's LAN IP, not localhost. Windows Firewall must allow the backend on that trusted network.
3. Generate a pairing and scan its QR code with the phone's camera. The link opens a browser page; no app or Shortcut is required.
4. Send one JPEG/PNG under 5 MB. You may also type/paste text from the photo.
5. Refresh Recall's inbox. Open the photo, review or transcribe the text, and select **Import text to notes**.

Pairing expires in five minutes and allows one upload. Generating a new pairing invalidates the previous one. Photos expire after an hour, can be deleted, and are cleared on restart. The inbox is limited to five photos per account and 50 MB globally. Images are decoded and re-encoded to remove metadata; original filenames are not retained.

Transfer is **through the backend**, including a local backend on your laptop. It is not peer-to-peer, not an iPhone Share Sheet extension and not automatic OCR. For access beyond trusted local testing, deploy the backend behind HTTPS and configure access controls before exposing it. Do not publicly expose a development server.

### Hosted extension configuration

Set `VITE_API_BASE` at build time to the HTTPS backend `/api` URL. Add only that origin to `host_permissions` in `extension/public/manifest.json` and rebuild. The default permission covers only localhost:8080. The phone page is served by the same backend, so its uploads use same-origin requests.

## Privacy and limits

Quiz generation sends the provided notes and review history to your Recall backend, without a model request. Signed-in snapshots are stored on the configured backend. Hints send the selected prompt and message to the backend and optionally OpenAI; the hint request does not send the full notes or answer key. Keys stay server-side. Passwords use salted PBKDF2 hashes. Local files and PostgreSQL application data are not encrypted by this application; secure storage/backups at deployment time.

Pairing capabilities are kept in URL fragments on the phone link, removed from its address bar after loading, and sent in a header rather than a query string. The server retains a hash of the capability. Keep pairing links private. Uploads are accessible only through the paired account's authenticated inbox. Validation errors return generic messages instead of echoing rejected values.

Gaze estimation, webcam capture, trained attention models, automated image transcription, semantic grading, external learning-resource recommendations and direct device-to-device sharing remain planned. A timer does not measure attention. Locally generated questions use deterministic text heuristics and may need editing of the source material to be useful; imported past papers are not automatically reconstructed into exam marking schemes.

## Checks

From the root:

```powershell
npm run lint --prefix extension
npm test --prefix extension
npm run build --prefix extension
cd backend
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```

GitHub Actions runs these on pushes and pull requests. Its backend job starts a disposable PostgreSQL service and enables the real PostgreSQL persistence tests. Without `RECALL_TEST_POSTGRES_URL`, those integration tests are skipped locally; H2 PostgreSQL-mode tests still exercise the repository contract. No provider keys are needed. CI does not deploy the app.

## What I am learning

Shared React state, async cancellation, runtime validation, Java request validation, password hashing and account isolation, JDBC persistence, capability-based pairing, bounded file handling and tests across component boundaries. The central trade-off is keeping a usable local prototype while being honest about the work needed for hosted concurrency, data migration and reliable machine-learning features.

## Design reference

The earlier layout was inspired by [Aspira](https://wabtech.gumroad.com/l/aspira). The current interface is a compact desktop-utility interpretation with project-specific components and interactions.
