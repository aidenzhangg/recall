# Recall

A Chrome side-panel workspace for studying your own notes and course materials. I started Recall because getting an AI answer immediately can feel like understanding without actually testing what I remember. Recall keeps practice, hints and review beside the material.

## What works

Recall runs entirely inside Chrome. Nobody has to start a server: notes, quizzes, flashcards, review history and settings are saved in the browser. The Java backend is optional and only adds accounts that sync, phone photo transfer and a shared AI key.

- **Notes and PDFs.** Paste notes or import TXT, Markdown or PDF files, including past papers. PDFs are read in the browser, in reading order, with page and word counts and a warning for pages that have no selectable text. Scanned pages need text recognition, which is not built yet.
- **Recall AI chat.** A real conversation about your notes: explanations in plain words, comparisons, follow-up questions, "quiz me". It reads the relevant parts of your notes and writes its own answer rather than pasting lines back, then shows which note lines it leaned on. With a quiz question selected and Hints Mode on, it gives stepped hints and never the answer; a reply that would leak the answer is thrown away.
- **AI-written quizzes and flashcards.** With an AI engine on, quizzes are written from the meaning of your notes (real questions, plausible wrong options, a one-line explanation after you answer) and aimed at the topics you have missed. Flashcards can be written the same way.
- **Three AI engines, no key in the code.** (1) Chrome's on-device model where available: free, private, one download, no key. (2) Your own key from a provider with a free tier (Groq, Google Gemini, OpenRouter) or any OpenAI-compatible service, entered under **AI settings**. (3) No AI at all: Recall falls back to rule-based questions and a search of your notes, and says so.
- **Practice.** Multiple choice (marked the moment you pick), fill in the blank, long answer or mixed. Misses and correct answers are tracked per passage, missed material comes back first, and a later review is scheduled after correct answers. This is a rule-based scheduler, not a trained model.
- **Camera focus.** An optional check on the focus timer that uses the webcam to estimate whether you are looking at the screen: looking at screen, looking away, eyes closed or no face. It shows screen attention as time looking at the screen divided by time tracked, counts how long you have looked away, and after the timeout you choose (15 seconds to 2 minutes) it chimes, pauses the timer and asks if you are still there.
- **Site blocker.** Block distracting domains and their subdomains with one switch, quick-add buttons for common sites and a list you manage. It uses Chrome's blocking rules and records no browsing history.
- **Dashboard.** Missed topics with one-click targeted practice and search links (Wikipedia, Khan Academy, YouTube, MIT OpenCourseWare). The links open a search; they are not curated recommendations.
- **Past papers.** Numbered questions found in an imported paper, one at a time, with self-review (papers carry no answer key).
- **Flashcards and focus timer.** Flip, Got it / Still learning, a missed-card round, and a 15 to 60 minute timer.
- **Optional account.** Register or use Google to keep progress on a backend you run or host. Without an account everything stays on this device.
- **Recall Connect (needs the backend).** Pair a phone with a QR code, send a photo from its browser, then review and import the text on the desktop.

The interface is a dark or light side-panel workspace set in Outfit and IBM Plex Sans.

## Stack

React, TypeScript, Vite, plain CSS, Chrome Manifest V3, pdf.js, MediaPipe Face Landmarker, and an optional Java 21 / Spring Boot backend with JDBC/PostgreSQL, PDFBox and Maven. No API key is stored in this repository or in the built extension.

## Run it

Install Node.js 24. From the repository root:

```powershell
npm ci --prefix extension
npm run build --prefix extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist` (not `extension` or `public`). Click Recall's toolbar icon. That is everything needed to use Recall; no backend has to run. To share it with someone else, send them the `extension/dist` folder (zipped) and they load it the same way, or publish it to the Chrome Web Store.

Rebuild and reload the extension after source changes. For frontend development, use `npm run dev --prefix extension`; the installed extension uses built assets, not Vite hot reload.

### Turning on AI

Open **Recall AI**, then **AI settings**.

- **On-device model.** If your Chrome offers its built-in model, a **Turn on** button appears. It downloads once and then runs on your computer.
- **Your own key.** Pick a provider, create a free key on that provider's site, paste it, choose **Find models**, pick one and **Save**. The key is kept in this browser's storage and sent only to the provider you picked, together with your question and the relevant parts of your notes. Free tiers have their own limits and terms. Use **Remove key** to delete it.

Anyone who can open this browser profile can use a saved key, so do not save one on a shared computer.

### Camera focus

Open **Focus** and switch on **Camera focus**. Chrome asks for camera permission; if the side panel cannot show the prompt, open Recall in a full tab once and allow it there. The first start downloads Google's face-landmark model (a few megabytes), so it needs a connection that one time. Frames are analysed on your computer and are never saved or uploaded.

It estimates head direction and eye closure, not what you are thinking, so treat the percentage as a rough signal. A browser extension is not allowed to lock the computer, so Recall pauses the timer and checks in instead.

### The optional backend

Only needed for accounts that sync, Recall Connect, or one AI key shared by all signed-in users. Install JDK 21, then:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

On Windows you can instead run `.\start-backend.cmd` from the repository root (or double-click it). `mvnw.cmd` must be run as `.\mvnw.cmd` from inside `backend`. The backend is ready when the log shows `Started BackendApplication`. Health check: `http://localhost:8080/api/health`.

### Private settings

Keys and passwords never go in the repository. Copy `backend/recall.example.properties` to `backend/recall.local.properties` and fill in only the parts you use; Git ignores that file. On a hosting platform, set the matching environment variables instead (named in each section below).

### Database: Supabase or any PostgreSQL (no Docker)

By default accounts are stored in local files under `backend/data`. To use a real database, give the backend a PostgreSQL address; nothing else needs installing.

1. Create a free project at Supabase (or Neon, or use a PostgreSQL you installed yourself).
2. In Supabase open **Connect** and copy the **Session pooler** address, user and password.
3. Put them in `backend/recall.local.properties` as `recall.database.url`, `recall.database.username` and `recall.database.password` (environment: `RECALL_DATABASE_URL`, `RECALL_DATABASE_USER`, `RECALL_DATABASE_PASSWORD`).
4. Start the backend. `http://localhost:8080/api/health` shows `"storage":"database"` when it is in use.

The address can be the `postgresql://...` form providers show or a JDBC address. TLS is required for any host other than this computer. The table is created on first start, and accounts made earlier in local-file mode are copied into the database once so they keep working. A small connection pool keeps hosted free tiers within their connection limits. Login sessions stay in memory, so sign in again after a backend restart. MongoDB is not supported; the account store is SQL.

### A shared AI key on the backend (optional)

Instead of each person entering their own key in the extension, a hosted backend can hold one key for all signed-in users, using any OpenAI-compatible API. Several providers have a free tier with a free key: Groq, Google Gemini (AI Studio) and OpenRouter's free models. Ollama runs a model on your own computer with no key at all.

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

Without an account, notes and progress stay in this browser. With an AI key saved, your question and the relevant parts of your notes go straight from the browser to the provider you chose; with the on-device model nothing leaves the computer. Camera frames never leave the computer. When signed in, progress snapshots are stored on the backend you configured, and quiz requests may be sent to it. Passwords use salted PBKDF2 hashes. Local files and PostgreSQL application data are not encrypted by this application; secure storage and backups at deployment time.

Pairing capabilities are kept in URL fragments on the phone link, removed from its address bar after loading, and sent in a header rather than a query string. The server retains a hash of the capability. Keep pairing links private. Uploads are accessible only through the paired account's authenticated inbox. Validation errors return generic messages instead of echoing rejected values.

Not built: text recognition for scanned PDFs and phone photos, locking the computer, trained attention models, semantic grading of long answers and direct device-to-device sharing. AI-written questions can be wrong, so check anything surprising against your notes. Without an AI engine, questions come from conservative English-language text patterns and can miss equations and unusual sentences; use Focus topic or edit the notes to narrow scope. The camera check, the on-device model, provider keys and Google sign-in have automated tests for their logic but have not been exercised end to end from this repository.

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
