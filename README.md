# Pages Desk

An internal portal for Pages Production:

- **Leads** — daily call queue, one-tap call outcomes, hot/warm/cold ratings, follow-up reminders, filters, CSV import/export.
- **Invoices** — GST and non-GST invoices in the Pages Production format, single or bulk creation, PDF/ZIP download, payments, history with filters.
- **Overview** and **Settings** (seller details, bank terms, numbering, logo, backups).

Fonts: Noto Sans (SIL Open Font License), subset to Latin + ₹ in `fonts/`.

- **App:** a single static page (`index.html`) served by GitHub Pages.
- **Data:** Firebase Firestore (free Spark plan). Lead data is never stored in this repo.
- **Login:** Google sign-in. Only the emails listed in `firestore.rules` can read or edit leads.

## Setup

1. In the Firebase console, create a project, then:
   - **Build → Firestore Database → Create database** (production mode, region `asia-south1`).
   - **Build → Authentication → Get started → Google → Enable.**
   - **Authentication → Settings → Authorized domains → Add domain:** `iharshgarg04.github.io`.
   - **Project settings → General → Your apps → Web (`</>`)** → register an app → copy the config into `config.js`.
2. Copy `firestore.rules.example` to `firestore.rules` (git-ignored, so emails stay private), put the two allowed emails in it, and paste it into **Firestore → Rules → Publish**.
3. Push to `main`; GitHub Pages serves the site.

## Moving data in

Import (in the app) → **Choose file** → pick a Lead Book backup `.json` to restore all leads with their history.
