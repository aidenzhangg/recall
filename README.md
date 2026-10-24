# Recall

Recall is a Chrome extension built to make AI a better study partner.

I often struggle to study with AI because it gives me the answer before I have worked through the problem. It is easy to feel productive without really testing what I understand. I am building Recall to keep the focus on thinking through the material, with hints that help me take the next step instead of skipping to the solution.

## How it helps

Recall brings your notes, practice questions, and study help into one browser workspace. Paste or upload course notes, create fill-in-the-blank quizzes, check your understanding, and retry the questions you miss.

With **Hints On**, the study helper guides you without revealing the answer. **No Hints** lets you practice independently and review missed answers after submitting. The goal is to keep you engaged with the material rather than copying an AI response.

Sign in through the profile button to save notes, quiz answers, and study activity on your Recall backend.

## Tech stack

- **Frontend:** React.js, TypeScript, Vite, and CSS
- **Browser extension:** Chrome Manifest V3 and Side Panel API
- **Backend:** Java 21 and Spring Boot REST API
- **Build tooling:** npm and Maven
- **AI integration:** OpenAI API for hint strategy selection, with a local fallback

## What's next

Alongside PDF-based practice, I want to build an optional AI focus companion that supports you during live study sessions. The idea is to explore computer vision tools such as OpenCV and gaze-estimation models to detect when you may have looked away and offer a gentle check-in or break reminder.

This would be an estimate, not proof of attention or understanding. Webcam monitoring, OpenCV integration, and a trained focus model are not implemented yet.

## Privacy

Recall currently has no webcam capture or focus monitoring. Guest notes and quiz answers stay in the open browser session. Signing in saves them and your activity history to your local Recall backend; they are not sent by the hint feature. Account passwords are stored as salted hashes. Saved study data is not encrypted at rest. Asking for a hint sends the selected question and your message to the backend and, when AI is configured, OpenAI. Avoid including sensitive information in those messages.

For the planned focus companion, the goal is opt-in camera access, on-device video processing, and no recording or uploading of webcam footage. You should be able to pause or stop monitoring at any time. These are design commitments for the future feature, not claims about an existing implementation.

## References
https://wabtech.gumroad.com/l/aspira - template (used as reference)
