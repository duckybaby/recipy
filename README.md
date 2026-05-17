# recipy

A mobile-first web app for deciding what to cook tonight. It pulls a real recipe from the web, scales it, walks you through cooking it. One user (the owner's wife). No keyboard, no accounts.

Live at [recipy.shankar.design](https://recipy.shankar.design) and [recipy-63422.web.app](https://recipy-63422.web.app).

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/spec.md`](docs/spec.md) | Product spec — prime directives, screens, flows, acceptance criteria |
| [`docs/architecture.md`](docs/architecture.md) | Tech architecture — stack, state, routing, backend, deployment |
| [`docs/api.md`](docs/api.md) | API contracts — endpoint shapes, auth, error envelopes |
| [`CHANGELOG.md`](CHANGELOG.md) | Ship log per milestone |

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 + http://<lan-ip>:5173 for phone testing
npm run build        # tsc -b + vite build — what CI runs
npm run preview      # serve the built bundle locally
```

For mock-only frontend work (no Anthropic spend):

```bash
echo 'VITE_USE_MOCKS=true' > .env.local
npm run dev
```

For the Cloud Function:

```bash
cd functions
npm install
npm run build           # compile TS → lib/
firebase emulators:start --only functions
```

You'll need to be logged in to the `recipy-63422` Firebase project and have `ANTHROPIC_API_KEY` set as a secret (`firebase functions:secrets:set ANTHROPIC_API_KEY`) for any real API call to work.

## Stack

React 19 + Vite 8 + TypeScript + Tailwind v4 on the frontend. Firebase Hosting + Cloud Functions (Node 20, `asia-south1`) on the backend. Anthropic Claude Sonnet 4.6 with the `web_search_20250305` server tool for recipe sourcing. Firebase App Check (reCAPTCHA v3) shields every API route. State on the client lives in a small Zustand store plus a thin localStorage adapter.

Full stack table in [`docs/architecture.md`](docs/architecture.md).

## Milestones

| # | Milestone | Status |
|---|---|---|
| M0 | Bootstrap: Vite + Tailwind v4 + PWA scaffold | shipped |
| M1 | Form → Results → Recipe with mocked data | shipped |
| M2 | Anthropic Cloud Function + frontend wiring + App Check | shipped |
| M2 polish | Recipe redesign (tabs, sticky CTA, kebab), app-like transitions | shipped |
| M2.1 | State refactor: Zustand store + intent-based loader + alt-recipe history | shipped |
| M3 | Cooking mode: offline + wake lock + multi-channel timer alert | next |
| M4 | Instamart Path B (heuristic cart deep-link) | |
| M5 | Polish + acceptance criteria + custom domain hardening | |

Detail and commit refs in [`CHANGELOG.md`](CHANGELOG.md).

## Deployment

GitHub Actions auto-deploys both Hosting and Cloud Functions on push to `main`. Don't run `firebase deploy` manually — let CI do it so the artifact retention policy and the service-account credentials stay consistent. PRs get a Firebase Hosting preview URL automatically.

## Repo layout

Short version:

```
src/
├── routes/         # Form, Results, Recipe, Cooking
├── components/     # ChipGroup, RecipeCard, IngredientRow, Loader, ...
├── hooks/          # useScrollSpy, useUserContext (v2 seam)
├── lib/            # store, storage, filters, api, firebase, scaling, types
└── styles/         # index.css with @theme tokens

functions/src/      # Cloud Function (index, anthropic, prompts, cache, validation)
docs/               # spec, architecture, api
.github/workflows/  # auto-deploy on merge, preview on PR
public/             # manifest, icons
```

Annotated layout in [`docs/architecture.md`](docs/architecture.md).

## Conventions

Worth knowing before touching code:

- File-level comments at the top of every TS/TSX file. State the file's role and any non-obvious rule.
- Imports grouped: React → libraries → relative.
- No `firebase deploy` from a developer machine — push to `main` and let GitHub Actions run.
- No editing `settings.json` or git hooks without explicit reason.
- Spec changes go in the same PR as the code change. Don't let docs drift.
