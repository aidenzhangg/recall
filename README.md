# Recall

A Chrome side-panel workspace for studying your own notes and course materials. I started Recall because getting an AI answer immediately can feel like understanding without actually testing what I remember. Recall keeps practice, hints and review beside the material.

## What works

Recall runs entirely inside Chrome, with no server of its own. Study data (notes, quizzes, flashcards, review history) is saved only to an account, never to the device. Accounts live in a Supabase project you connect; without one, work lasts until Recall is closed.

- **Notes and PDFs.** Paste notes or import TXT, Markdown or PDF files, including past papers. PDFs are read in the browser, in reading order, with page and word counts and a warning for pages that have no selectable text. Scanned pages need text recognition, which is not built yet.
- **Recall AI chat.** A dedicated chat about your notes: explanations in plain words, comparisons, follow-up questions, "quiz me". It reads the relevant parts of your notes and writes its own answer, then shows which note lines it leaned on. For quiz questions it is hints only: three steps that explain the idea, narrow it down and get you almost there. It never gives the answer, and a reply that would leak it is thrown away. There is no setting that turns hints off.
- **AI-written quizzes and flashcards.** Quizzes are written from the meaning of your notes (real questions, plausible wrong options, a one-line explanation after you answer) and aimed at the topics you have missed. Flashcards can be written the same way.
- **AI with no setup for users.** The person who builds the extension supplies the AI key (see "The AI key" below). Users never see or enter a key. Where Chrome offers its on-device model, that works too. With no AI at all, Recall falls back to rule-based questions and a search of your notes.
- **Practice.** Multiple choice, fill in the blank, long answer or mixed. Every question is marked as soon as you answer it, written answers get AI feedback when an AI is connected, and the session ends on a results page that lists each question, your answer and the correct one. Only first-try answers score. Misses and correct answers are tracked per passage, missed material comes back first, and a later review is scheduled after correct answers. This is a rule-based scheduler, not a trained model.
- **Camera focus.** An optional check on the focus timer that uses the webcam to estimate whether you are looking at the screen: looking at screen, looking away, eyes closed or no face. The preview traces your face outline, and the card shows screen attention (time looking at the screen divided by time tracked), how many times you looked away, your best unbroken streak and a strip of the last minute. After three seconds away it counts down; at the timeout you choose (15 seconds to 2 minutes) it chimes and pauses the timer. Looking back at the screen for two seconds resumes it by itself, or press **I'm back**. Time spent paused is not scored.
- **Site blocker.** Block distracting domains and their subdomains with one switch, quick-add buttons for common sites and a list you manage. It uses Chrome's blocking rules and records no browsing history.
- **Dashboard.** Missed topics with one-click targeted practice and search links (Wikipedia, Khan Academy, YouTube, MIT OpenCourseWare). The links open a search; they are not curated recommendations.
- **Prediction papers.** Upload a past paper PDF and, with an AI connected, Recall writes a new paper in the same format: same header, sections, numbering, sub-parts and marks, with different questions on the same topics. Save it as a PDF, answer it inside Recall, or add a mark scheme. It copies the paper's structure and wording style, not its fonts, logos or diagrams, and it is an AI guess at similar questions, not a real or leaked exam.
- **Focus lock.** Starting the focus timer turns site blocking on and locks it: until the session finishes or you end it, sites cannot be removed and blocking cannot be turned off. Pages that were already open stay open until they are reloaded.
- **Past papers.** Numbered questions found in an imported paper, one at a time, with self-review (papers carry no answer key).
- **Flashcards and focus timer.** Flip, Got it / Still learning, a missed-card round, and a 15 to 60 minute timer.
- **Accounts.** Sign in with email and password (or Google) to save everything to your account. Without an account nothing is saved.
- **Recall Connect (needs the backend).** Pair a phone with a QR code, send a photo from its browser, then review and import the text on the desktop.

The interface is a dark or light side-panel workspace set in Outfit and IBM Plex Sans.

## Tech stack

| Part | What it uses |
| --- | --- |
| Extension | React 19, TypeScript, Vite, plain CSS, Chrome Manifest V3 (side panel, storage, declarativeNetRequest, identity) |
| PDF reading | pdf.js (`pdfjs-dist`), in the browser |
| Camera focus | MediaPipe Tasks Vision **Face Landmarker**, running as WebAssembly in the browser |
| AI chat, hints, quizzes, flashcards | Chrome's built-in Prompt API (Gemini Nano), or a hosted model through an OpenAI-compatible API: Groq, Google Gemini, OpenRouter or OpenAI |
| Optional backend | Java 21, Spring Boot, JDBC with HikariCP, PDFBox, Maven |
| Optional database | PostgreSQL, for example Supabase or Neon |
| Optional hosting | AWS Elastic Beanstalk (Java / Corretto 21) |
| Tests and CI | node:test, ESLint, JUnit, H2, GitHub Actions |

### Models: nothing here was trained by this project

Recall does not train, fine-tune or ship a model of its own, and it never uses your notes or camera to train anything.

- **Face Landmarker** is a pretrained model published by Google (MediaPipe). Recall downloads it as is and only reads its output: face landmark positions and eye "blendshape" scores. The rules that turn those numbers into "looking at screen", "looking away" or "eyes closed" are plain hand-written thresholds in `extension/src/gaze.ts`, not machine learning.
- **Language models** (Gemini Nano on device, or whichever model you pick at Groq, Gemini, OpenRouter or OpenAI) are pretrained by their providers. Recall sends them a prompt and shows the reply.
- **Review scheduling and the fallback quiz generator** are rule-based code.

## Run it

Install Node.js 24. From the repository root:

```powershell
npm ci --prefix extension
npm run build --prefix extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist` (not `extension` or `public`). Click Recall's toolbar icon. That is everything needed to use Recall; no backend has to run. To share it with someone else, send them the `extension/dist` folder (zipped) and they load it the same way, or publish it to the Chrome Web Store.

Rebuild and reload the extension after source changes. For frontend development, use `npm run dev --prefix extension`; the installed extension uses built assets, not Vite hot reload.

### The AI key

Users are never asked for a key. Whoever builds the extension provides one, in a file Git ignores:

1. Get a free key: Groq at `https://console.groq.com/keys` (**Create API Key**, starts with `gsk_`), or Google Gemini at `https://aistudio.google.com/apikey`.
2. Copy `extension/.env.example` to `extension/.env.local`.
3. Set `VITE_AI_PROVIDER=groq` (or `gemini`) and paste the key after `VITE_AI_KEY=`. `VITE_AI_MODEL` is optional.
4. Run `npm run build --prefix extension` and share the `extension/dist` folder.

The key is not in the repository, but it is inside the built extension, and anyone who installs that build can read it and use it elsewhere. Only use a free key with no payment method attached, expect its rate limit to be shared by everyone, and revoke it at the provider if it is abused. The only way to keep a key truly hidden from users is to hold it on a server.

### Accounts that save to the cloud (Supabase, no server)

Recall saves study data only to an account. To have accounts, connect a free Supabase project. The extension talks to Supabase directly, so there is no backend to host.

1. Create a project at Supabase.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and press **Run**. This creates one `progress` table where each person can only read and write their own row.
3. Open **Project Settings**, then **API**. Copy the **Project URL** and the **anon** (publishable) key.
4. Copy `extension/.env.example` to `extension/.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Optional: under **Authentication**, then **Sign In / Providers**, then **Email**, turn off "Confirm email" if you want people signed in the moment they register. Left on, they must open the emailed link first.
6. Run `npm run build --prefix extension` and reload the extension.

With this on, sign-in is the first screen, people stay signed in between sessions, and notes, quizzes and progress are saved to their account. Without it, nothing is saved and work is lost when Recall closes.

The Project URL and anon key are meant to be public; row-level security is what protects the data. **Never** use the `service_role` or secret key in the extension: it bypasses that security. As the project owner you can read stored notes in the Supabase dashboard, so tell your users.

**Continue with Google** in this mode needs two more steps in Supabase: enable the Google provider under Authentication (it asks for a Google OAuth client ID and secret, which stay in Supabase), and add `https://<your-extension-id>.chromiumapp.org/` under Authentication, URL Configuration, Redirect URLs. Recall Connect (phone photos) still needs the Java backend.

### Camera focus

Open **Focus** and switch on **Camera focus**. It works in the side panel. Chrome cannot show its camera question inside a side panel, so the first time Recall shows **Allow camera**, which opens a tab where Chrome asks once; choose Allow and camera focus turns on in the panel by itself. The first start also downloads Google's face-landmark model (a few megabytes), so it needs a connection that one time.

It estimates head direction and eye closure, not what you are thinking, so treat the percentage as a rough signal. A browser extension is not allowed to lock the computer, so Recall pauses the timer and checks in instead.

### The optional backend

Only needed for accounts that sync, Recall Connect, or one AI key shared by all signed-in users. Install JDK 21, then:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

On Windows you can instead run `.\start-backend.cmd` from the repository root (or double-click it). `mvnw.cmd` must be run as `.\mvnw.cmd` from inside `backend`. The backend is ready when the log shows `Started BackendApplication`. Health check: `http://localhost:8080/api/health`.

### How Supabase and AWS fit in

Neither is needed to use Recall. They matter only if you want accounts that follow people between computers:

```
Chrome extension  ->  Recall backend (Spring Boot jar on AWS Elastic Beanstalk)  ->  Supabase PostgreSQL
```

1. **Supabase** holds the accounts table. Create a free project, copy the Session pooler address, user and password, and give them to the backend (see Database below). You never talk to Supabase from the extension, so no Supabase key goes in it.
2. **AWS** runs the backend jar so it has a public HTTPS address (see Hosting below). The database values go in as environment properties there.
3. **The extension** is built with `VITE_API_BASE` set to that address, so sign-in and sync use your hosted backend instead of `localhost`.

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

To keep the AI key hidden from users, a hosted backend can hold one key for all signed-in users, using any OpenAI-compatible API. Several providers have a free tier with a free key: Groq, Google Gemini (AI Studio) and OpenRouter's free models. Ollama runs a model on your own computer with no key at all.

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

## Data disclaimer

Recall is a student project, provided as is with no warranty. Read this before putting anything sensitive in it.

- **Your notes and progress** are saved only to your account in the Supabase project the builder connected. Whoever owns that project can read them. Nothing study-related is written to the device; only your sign-in session and the light/dark setting are kept in the browser.
- **AI.** Your questions, the relevant parts of your notes, quiz questions and written answers are sent from your browser to the AI provider the builder chose (Groq or Google) and handled under that provider's terms and privacy policy, which may allow logging or, on some free tiers, use for improving their models. Do not put personal, confidential or exam-restricted material in your notes. With Chrome's on-device model, nothing leaves the computer.
- **Camera.** Frames are processed in memory on your computer to get face landmarks and are then discarded. No image, video or face data is saved, uploaded, or used to identify anyone. The only request made is the one-time download of the model file from Google. Turning the switch off stops the camera.
- **The AI key** belongs to whoever built the extension and is readable inside the build. Users do not enter one.
- **Accounts (optional backend).** Email, name, a salted PBKDF2 password hash and your progress snapshot are stored on whichever backend and database you or the host configure. Whoever runs that backend can read the stored notes. This application does not encrypt data at rest.
- **Site blocker** rules stay in the browser; no browsing history is recorded or sent.
- **Accuracy.** AI answers, hints, marks and generated questions can be wrong. The attention percentage is an estimate of where your face points, not a measure of focus. Do not rely on either for grades, assessment or anything medical.
- Recall collects no analytics and has no server of its own. It is not affiliated with Google, Groq, OpenRouter, OpenAI, Supabase or AWS.

## Privacy and limits

Passwords use salted PBKDF2 hashes. Local files and PostgreSQL application data are not encrypted by this application; secure storage and backups at deployment time.

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
