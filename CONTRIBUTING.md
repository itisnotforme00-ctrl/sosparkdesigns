# Contributing — SoSpark Design v3

Three collaborators work on this repo, each in their own lane. Read your ticket file (`01_FRONTEND.md`, `02_BACKEND.md`, or `03_API_AGENT.md`) before touching anything.

## Branches — never push straight to `main`

```
main                    ← protected, always deployable
├── frontend-motion      ← Frontend worker
├── backend-diagnostics  ← Backend worker
└── api-agent-fixes      ← API/AI worker
```

1. Branch off the current `main` before starting.
2. Only touch files inside your own scope (see your ticket file for exactly which folders/files).
3. Commit as you go with clear messages — don't squash weeks of work into one commit.
4. When done, open a **pull request into `main`**. Do not merge your own PR without the owner's review, even if it "just works" locally.

## Merge order matters

Backend → API agent → Frontend. Frontend's portfolio work depends on backend's confirmed API response shape; the AI widget's visual polish pass depends on frontend's motion/glass system already being in `main`.

## Never commit

- `.env` (real credentials) — only `.env.example` with placeholders belongs in the repo
- `node_modules/`
- Anything with a real Mongo URI, JWT secret, or Groq key in it — including inside comments or commit messages

## Before opening a PR

- Pull latest `main` into your branch first and resolve conflicts locally, not in the PR.
- In the PR description, note anything the next worker in the merge order needs to know (e.g. backend should state the final `/api/portfolio` response shape for frontend).
