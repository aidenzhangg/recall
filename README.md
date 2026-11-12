# Recall

A Chrome side-panel workspace for studying your own notes and course materials. I started Recall because getting an AI answer immediately can feel like understanding without actually testing what I remember. Recall keeps practice, hints and review beside the material.

## What works

- Import TXT/Markdown or selectable-text PDFs, including past papers. PDF extraction uses the Java backend, orders text by page position and reports page/word counts and missing-text warnings. Scanned PDFs need OCR and are not supported yet.
- Create fill-in-the-blank, multiple-choice, long-answer or mixed practice. Wrapped PDF body lines are joined before question generation, title-like headings and page numbers are skipped, and questions are selected from definitions and concept explanations rather than arbitrary long words. Administrative lines are filtered, and the optional Focus topic limits what is included. Fewer questions are returned when there is insufficient matching content. The Spring Boot endpoint prioritizes previously missed material; the extension has a local fallback.
- Track misses and successful attempts per source passage, schedule later review after correct responses, retry answers and save history with account progress. This is a rule-based review scheduler, not a trained adaptive ML model.
- Block distracting domains and their subdomains from **Block sites**. The on/off control and domain list stay on this browser profile; blocking uses Chrome rules without recording browsing history. Existing pages are not closed.
- Ask Recall AI a question and get the matching passages quoted from your own notes. With a quiz question selected and Hints Mode on it gives stepped hints (length and first letter, a related line from your notes, then a letter pattern) without revealing the answer; with Hints Mode off it shows the answer and its source line. By default this is local keyword search, so it only quotes what was imported and says so when nothing matches.
- Optional on-device AI: where Chrome's built-in Prompt API (Gemini Nano) is available, Recall AI can use it to write a short explanation grounded in the matched note lines. It runs inside the browser with no API key, account or network call to an AI service; one click in Recall AI starts Chrome's model download. Replies that would reveal a hidden quiz answer are discarded, and answers not based on your notes are labelled as general knowledge. Without the built-in model, notes search is used.
- See missed topics on the dashboard with a one-click targeted practice session and search links (Wikipedia, Khan Academy, YouTube, MIT OpenCourseWare) for each. The links open a search for the topic; they are not curated recommendations.
- Practise numbered questions detected in an imported past paper, one at a time, with self-review (papers carry no answer key).
- Use flashcards with flip, Got it / Still learning sorting and a missed-card round, plus a deadline-based focus timer. Long answers are explicitly self-reviewed. Camera gaze check-ins are planned only; nothing uses the camera.
- Register/sign in to save progress. Local file storage is the default; setting a database address switches accounts to PostgreSQL (for example Supabase), with no Docker.
- Multiple choice asks a real question ("Which of these is the movement of water across a membrane?") and marks your pick right or wrong the moment you choose. With Hints Mode on you can try again; with it off the correct option is shown. A wrong first pick still counts as a miss for review.
- Optionally use a hosted language model through your backend with a free-tier key. The key stays on the backend.
- Pair a phone from Connect using a locally generated QR code. Open the browser upload page without installing an app, send a JPEG/PNG, then refresh the desktop inbox to review/transcribe and import its text.

The interface uses a compact utility layout, Space Grotesk + IBM Plex Sans typography, IBM Plex Mono for status/data, and charcoal/signal-green or light surfaces.

## Stack

React, TypeScript, Vite, plain CSS, Chrome Manifest V3, Java 21, Spring Boot, JDBC/PostgreSQL, PDFBox, Maven and GitHub Actions. Hints and quizzes use local rules. By default no external AI provider or API key is used; a hosted model is opt-in through backend settings.

## Run locally

Install Node.js 24 and JDK 21. From the repository root:

```powershell
npm ci --prefix extension
npm run build --prefix extension
cd backend
.\mvnw.cmd spring-boot:run
```

On Windows you can instead run `.\start-backend.cmd` from the repository root (or double-click it); it works from any folder. Note that `mvnw.cmd` must be run as `.\mvnw.cmd` from inside `backend`, not from the root. The backend is ready when the log shows `Started BackendApplication`.

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist` (not `extension` or `public`). Click Recall's toolbar icon. Rebuild and reload the extension after source changes. Health check: `http://localhost:8080/api/health`.

For frontend development, use `npm run dev --prefix extension` from the root. The installed extension uses built assets, not Vite hot reload.

### Private settings

Keys and passwords never go in the repository. Copy `backend/recall.example.properties` to `backend/recall.local.properties` and fill in only the parts you use; Git ignores that file. On a hosting platform, set the matching environment variables instead (named in each section below).

### Database: Supabase or any PostgreSQL (no Docker)

By default accounts are stored in local files under `backend/data`. To use a real database, give the backend a PostgreSQL address; nothing else needs installing.

1. Create a free project at Supabase (or Neon, or use a PostgreSQL you installed yourself).
2. In Supabase open **Connect** and copy the **Session pooler** address, user and password.
3. Put them in `backend/recall.local.properties` as `recall.database.url`, `recall.database.username` and `recall.database.password` (environment: `RECALL_DATABASE_URL`, `RECALL_DATABASE_USER`, `RECALL_DATABASE_PASSWORD`).
4. Start the backend. `http://localhost:8080/api/health` shows `"storage":"database"` when it is in use.

The address can be the `postgresql://...` form providers show or a JDBC address. TLS is required for any host other than this computer. The table is created on first start, and accounts made earlier in local-file mode are copied into the database once so they keep working. A small connection pool keeps hosted free tiers within their connection limits. Login sessions stay in memory, so sign in again after a backend restart. MongoDB is not supported; the account store is SQL.

### AI answers with a key (optional)

Recall AI can use a hosted language model through any OpenAI-compatible API. Several providers have a free tier with a free key: Groq, Google Gemini (AI Studio) and OpenRouter's free models. Ollama runs a model on your own computer with no key at all.

1. Create a key on the provider's site and pick a model name from its model list.
2. In `backend/recall.local.properties` set `recall.ai.provider` (`groq`, `gemini`, `openrouter`, `openai` or `ollama`), `recall.ai.model` and `recall.ai.key` (environment: `RECALL_AI_PROVIDER`, `RECALL_AI_MODEL`, `RECALL_AI_KEY`; `RECALL_AI_BASE_URL` for any other compatible service).
3. Restart the backend and sign in to the extension. Recall AI shows which model is on.

How the key stays private: the extension never sees it. It sends your question and the matching note lines to your backend, which adds the key and calls the provider. Only signed-in users can use it, each limited to 20 questions per five minutes, so a hosted backend cannot be used as an open proxy. Replies that would reveal a hidden quiz answer are refused. Free tiers have their own limits and terms, and the provider receives the text sent to it. Without this setup Recall AI uses Chrome's on-device model where available, otherwise notes search.

### Hosting the backend on AWS (no Docker)

The backend is one runnable jar, which AWS Elastic Beanstalk's Java platform runs directly.

1. Build it from `backend`: `.\mvnw.cmd -DskipTests package`. The jar is `backend/target/backend-0.0.1-SNAPSHOT.jar`.
2. In the AWS console create an Elastic Beanstalk application on the **Java (Corretto 21)** platform, single instance, and upload the jar.
3. In the environment's configuration add environment properties: `PORT=5000`, the three `RECALL_DATABASE_*` values (a hosted database is required, because the instance's disk is not permanent), and optionally the `RECALL_AI_*` values and `RECALL_GOOGLE_CLIENT_ID`.
4. Put HTTPS in front before anyone signs in, for example a CloudFront distribution pointing at the environment, or a load balancer with a certificate for your own domain. Do not send passwords to the plain `http://` address.
5. Build the extension against it: set `VITE_API_BASE=https://your-address/api` in `extension/.env.local`, run `npm run build --prefix extension`, and reload the extension. The build adds permission for that address to the manifest.

AWS bills by usage once any free allowance runs out, so check the pricing for the instance type you choose and delete the environment when you stop using it. These steps have not been run from this repository.

### Sign in with Google (optional)

Email and password accounts work without any setup. Passwords are never stored in readable form: the backend keeps only a salted PBKDF2-HMAC-SHA256 hash (210,000 iterations). To also allow **Continue with Google**:

1. In Google Cloud Console, create an OAuth client ID of type **Web application**.
2. Load the extension, open `chrome://extensions`, and copy Recall's ID. Add `https://<that-id>.chromiumapp.org/` as an authorised redirect URI on the client.
3. Give the backend the client ID through the environment, in the same terminal you start it from. Do not put it in a file in this repository.
4. Start the backend and reload the extension so it picks up the new `identity` permission.

The client ID is a public identifier, not a secret; no client secret or API key is used. The extension receives a Google ID token, and the backend asks Google to verify it and checks that it was issued for this client and this sign-in attempt. A Google sign-in with the same verified email as an existing Recall account opens that account. Until a client ID is set, the button explains that Google sign-in is not set up.

### Recall Connect: phone to desktop

1. Sign in on the extension and open **Connect**.
2. Enter the address of this same backend that your phone can reach. For local tests, both devices must be on the same trusted Wi-Fi and the address must use your computer's LAN IP, not localhost. Windows Firewall must allow the backend on that trusted network.
3. Generate a pairing and scan its QR code with the phone's camera. The link opens a browser page; no app or Shortcut is required.
4. Send one JPEG/PNG up to 20 MB. You may also type/paste text from the photo.
5. Refresh Recall's inbox. Open the photo, review or transcribe the text, and select **Import text to notes**. Imports that would exceed the 200,000-character notes limit are rejected without changing your notes.

Pairing expires in five minutes and allows one upload. Generating a new pairing invalidates the previous one. You can cancel a pending pairing in Connect; signing out of the session that created it also revokes it. Photos expire after an hour, can be deleted, and are cleared on restart. The inbox is limited to five photos per account and 50 MB globally. Images are decoded and re-encoded to remove metadata; original filenames are not retained.

Transfer is **through the backend**, including a local backend on your laptop. It is not peer-to-peer, not an iPhone Share Sheet extension and not automatic OCR. For access beyond trusted local testing, deploy the backend behind HTTPS and configure access controls before exposing it. Do not publicly expose a development server.

### Hosted extension configuration

Set `VITE_API_BASE` at build time to the HTTPS backend `/api` URL. The build adds that origin to `host_permissions` in the built manifest. The default permission covers only localhost:8080. The phone page is served by the same backend, so its uploads use same-origin requests.

## Privacy and limits

Quiz generation sends the provided notes and review history to your Recall backend, without a model request. Signed-in snapshots are stored on the configured backend. Hints send only the selected prompt and message to your Recall backend. The application does not call an external AI provider or read an AI API key. Passwords use salted PBKDF2 hashes. Local files and PostgreSQL application data are not encrypted by this application; secure storage/backups at deployment time.

Pairing capabilities are kept in URL fragments on the phone link, removed from its address bar after loading, and sent in a header rather than a query string. The server retains a hash of the capability. Keep pairing links private. Uploads are accessible only through the paired account's authenticated inbox. Validation errors return generic messages instead of echoing rejected values.

Gaze estimation, webcam capture, trained attention models, automated image transcription, semantic grading, external learning-resource recommendations and direct device-to-device sharing remain planned. A timer does not measure attention. Locally generated questions use conservative English-language text patterns, not semantic understanding or knowledge of your exam syllabus. They can miss equations, unusual sentence structures and important details; review the extracted material and use Focus topic or edit the source text to narrow scope; imported past papers are not automatically reconstructed into exam marking schemes.

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

### Website blocking
After installing or updating, reload Recall at chrome://extensions and approve the added storage/request-blocking permissions if Chrome asks. Open **Block sites**, add a domain (for example, youtube.com), then turn **Blocking on**. Remove entries or turn blocking off to allow them again. Rules persist across browser restarts and apply to new page loads in this Chrome profile; they do not close existing tabs, block other browsers or restrict Chrome internal pages. Chrome displays its native blocked-request page. The list is local to the device, not tied to an account or sent to the server. You can save up to 100 domains. URL paths and query strings are stripped; local addresses and IP addresses are rejected. This is a voluntary study aid, not tamper-proof parental control.
