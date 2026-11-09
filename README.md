# Pages Desk

Internal portal for Pages Production:

- **Overview** — calls due, hot leads, billing and outstanding at a glance.
- **Leads** — daily call queue, one-tap call outcomes, hot/warm/cold ratings, follow-ups, filters, import/export.
- **Invoices** — GST and non-GST invoices in the Pages Production format, single or bulk creation, PDF/ZIP download, payments, history with filters.
- **Settings** — seller details, bank terms, numbering, logo and full backups.

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript, Vite 8 |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| Routing | React Router 7 (hash routes, works on GitHub Pages) |
| Forms | React Hook Form + Zod |
| Data & auth | Firebase — Firestore (live sync, offline cache) + Google sign-in |
| PDFs | jsPDF + JSZip, Noto Sans subset (₹) in `public/fonts` |
| Hosting | GitHub Pages, deployed by GitHub Actions on every push to `main` |

Business details (seller, GSTIN, bank) live **only in Firestore** (`settings/business`), never in this repo.
Access is limited to the Google accounts listed in the deployed Firestore rules (`firestore.rules`, git-ignored; see `firestore.rules.example`).

## Develop

Requires Node 22.12+ (`.nvmrc`).

```bash
npm install
npm run dev          # against the live Firebase project
npm run typecheck
npm run build        # outputs dist/
```

### Local testing with the Firebase emulators (no live data touched)

```bash
firebase emulators:start --config firebase.emulator.json --project khushi-lead-book --only auth,firestore
python3 tools/seed_emulator.py   # loads backup/leads-backup.json + example settings
npm run dev:emu                  # sign in as tester@example.com in the emulator popup
```

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and publishes to
https://iharshgarg04.github.io/lead-book/. Firestore rules: `firebase deploy --only firestore:rules --project khushi-lead-book`.
