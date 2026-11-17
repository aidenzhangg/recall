# Recall

A Chrome side-panel study app. It turns your own notes into quizzes, flashcards and practice papers, with an AI tutor that gives hints instead of answers.

**[See the full project write-up and live focus-tracking demo →](https://aidenzhang.vercel.app/#projects/recall-ai-study-assistant-chrome-extension)**

![Recall's practice, sign-in and focus timer screens](docs/screenshots/recall-cover.jpg)

## Why

Getting an AI answer straight away can feel like understanding without actually testing what you remember. Recall keeps practice, hints and review next to your material, so you still do the thinking.

## Screens

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/01-welcome.png" alt="Sign-in screen"><br><sub>Sign in or continue as a guest</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/03-notes.png" alt="Notes"><br><sub>Paste notes or import PDFs</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/04-practice-question.png" alt="Practice question"><br><sub>Quizzes marked as you go</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/05-flashcards.png" alt="Flashcards"><br><sub>Flashcards</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/02-recall-ai.png" alt="Recall AI chat"><br><sub>AI chat grounded in your notes</sub></td>
    <td align="center"><img src="docs/screenshots/06-focus-running.png" alt="Focus timer"><br><sub>Focus timer with camera check</sub></td>
    <td align="center"><img src="docs/screenshots/07-block-sites.png" alt="Website blocker"><br><sub>Site blocker, locked during focus</sub></td>
    <td align="center"><img src="docs/screenshots/08-blocked-page.png" alt="Chrome blocking instagram.com"><br><sub>A blocked site in Chrome</sub></td>
  </tr>
</table>

## Features

- **Notes and PDFs.** Paste notes or import TXT, Markdown or PDF files, read in the browser.
- **Recall AI.** Chat about your notes and paste screenshots with Ctrl+V. On quiz questions it gives three hints and never the answer.
- **Practice.** Multiple choice, fill in the blank, long answer or mixed. Missed topics come back first.
- **Practice papers and problem sets.** A new paper in the same format as an uploaded past paper, or worked problems on any topic, as PDFs.
- **Focus timer and camera focus.** The webcam check pauses the timer when you look away and resumes it when you look back.
- **Site blocker.** Blocks distracting domains and locks on during a focus session.
- **Accounts or guest mode.** Google or email sign-in. Guests get everything except Recall AI, and nothing is saved.

## Tech stack

| Part | Built with |
| --- | --- |
| Extension | React 19, TypeScript, Vite, Chrome Manifest V3 |
| AI | Supabase Edge Function (Deno) calling Groq (`gpt-oss-120b`, plus a vision model for pictures) |
| Accounts and data | Supabase Auth (email and Google via a Google Cloud OAuth client), PostgreSQL |
| Camera focus | MediaPipe Face Landmarker, running in the browser |
| PDFs | pdf.js to read, jsPDF to write |
| Optional backend | Java 21, Spring Boot, JDBC, HikariCP, PostgreSQL |
| Tests and CI | node:test, JUnit, ESLint, GitHub Actions |

## Security

- **No AI key in the extension.** It lives in Supabase. Each signed-in user gets a daily limit (200 by default).
- **Row-level security.** Every user can only read and write their own data.
- **Parameterized SQL.** All backend queries use JDBC placeholders, so input is never pasted into SQL.
- **Passwords** are hashed with salted PBKDF2-HMAC-SHA256 (210,000 iterations), and sign-in locks after 8 failed tries.
- **Camera frames** stay in memory on your computer and are never saved or sent.

## Quick start

Install Node.js 24, then from the repository root:

```powershell
npm ci --prefix extension
npm run build --prefix extension
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `extension/dist`. Click Recall's toolbar icon to open it.

Connecting Supabase for accounts and Recall AI, plus the optional backend, Google sign-in, hosting and the full privacy notes, are in **[docs/setup.md](docs/setup.md)**.

## Notes

Recall is a student project, provided as is. It doesn't train any models: the language models and Face Landmarker are pretrained, and the camera check uses hand-written thresholds. AI answers and generated questions can be wrong, so check them against your notes.
