# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A minimal Cloudflare Worker that queries a D1 (Cloudflare's serverless SQLite) database and renders the result as HTML. It's the `d1-template` starter from `cloudflare/templates`, meant to be a jumping-off point rather than a full application — expect the codebase to grow well beyond `comments`.

## Commands

- `npm install` — install dependencies
- `npm run dev` — apply D1 migrations to the local DB, then start `wrangler dev`
- `npm run check` — typecheck (`tsc --noEmit`) and validate the deploy config (`wrangler deploy --dry-run`); run this before considering a change done
- `npm run deploy` — apply migrations to the remote D1 database, then deploy via `wrangler deploy`
- `npm run cf-typegen` — regenerate `worker-configuration.d.ts` (the `Env` types) from `wrangler.json`; re-run after changing bindings in `wrangler.json`
- `npx wrangler d1 migrations create d1-template-database <name>` — scaffold a new migration file in `migrations/`
- `npx wrangler d1 migrations apply DB --local` — apply pending migrations to the local D1 instance directly
- `npx wrangler d1 migrations apply d1-template-database --remote` — apply pending migrations to the remote D1 database directly

There is no test suite or linter configured in this repo.

## Architecture

- **`src/index.ts`** — the Worker entry point (`export default { fetch }`). All request handling currently lives here as a single handler with no router; as routes are added, this is where they'd be dispatched from.
- **`src/renderHtml.ts`** — builds the HTML response as a template literal. Keep view logic here rather than inline in `index.ts`.
- **`env.DB`** — the D1 binding, typed via `Env` in `worker-configuration.d.ts` (generated — don't hand-edit; run `npm run cf-typegen` instead). Queries use the D1 prepared-statement API (`env.DB.prepare(sql).all()` / `.first()` / `.run()`), not an ORM.
- **`migrations/`** — numbered SQL migration files (`NNNN_description.sql`) applied in order by `wrangler d1 migrations apply`. This is the only source of truth for the D1 schema — there's no separate schema file.
- **`wrangler.json`** — Worker config: binds the `DB` D1 database (name/ID), sets the entry point and compatibility date, and enables observability. Any new binding (KV, R2, secrets, another D1 DB, etc.) is declared here first, then picked up by `cf-typegen`.

## Conventions

- Tabs for indentation (see existing files).
- Strict TypeScript (`strict: true` in `tsconfig.json`); no emit — Wrangler/esbuild handles bundling, `tsc` is typecheck-only.
