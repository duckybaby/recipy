# recipy

Web app that helps one person (the owner's wife) decide what to cook tonight,
pulls a real recipe from the web, and walks her through cooking it. Mobile-first,
no keyboard, no accounts.

See [`docs/spec.md`](./docs/spec.md) for the full v1 spec.

## Stack

- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind v4
- **Routing:** `react-router-dom` v7
- **Icons:** `lucide-react`
- **Backend:** Firebase Cloud Functions (Node 20, 2nd gen) — wired in M2
- **Hosting:** Firebase Hosting — wired in M2
- **Secrets:** Firebase Secret Manager (`ANTHROPIC_API_KEY`)

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (also exposed on LAN for iPhone testing)
npm run build        # type-check + production build
npm run preview      # preview the production build locally
```

## Build milestones

| # | Milestone | Status |
|---|---|---|
| M0 | Bootstrap: Vite + Tailwind v4 + PWA scaffold + folder structure | ✅ |
| M1 | Form → Results → Recipe (mocked data) | next |
| M2 | Wire Claude + Cloud Function | |
| M3 | Cooking mode + persistence + wake lock + timer alert | |
| M4 | Instamart (Path B heuristic) | |
| M5 | Polish + acceptance criteria + deploy | |

## Folder layout (spec §13)

```
src/
├── routes/        # Form, Results, Recipe, Cooking
├── components/    # ChipGroup, RecipeCard, ResumeBanner, Timer, …
├── hooks/         # useWakeLock, useCookingState, useUserContext (v2), …
├── lib/           # api, storage, scaling, types
└── styles/        # index.css with @theme tokens
functions/         # Cloud Functions (wired in M2)
public/            # manifest, icons
```
