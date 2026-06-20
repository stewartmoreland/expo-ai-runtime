# Expo AI Runtime — documentation site

The documentation site for the [Expo AI Runtime](../README.md), built with
[Docusaurus](https://docusaurus.io/). It is themed with the example apps' design tokens
(`examples/_shared/src/theme.ts`) and is **dark-only**.

This is a standalone package (its own `package-lock.json`) — it is intentionally **not**
part of the root npm workspaces, to avoid React 19 / React Native version clashes with
the runtime packages.

## Develop

```bash
npm install        # from this directory (website/)
npm start          # dev server with live reload
npm run build      # static build into build/ — fails on broken internal links
npm run typecheck  # tsc
npm run serve      # serve the production build locally
```

## Content

- `docs/` — the documentation (Getting started, Concepts, Packages, Examples, Reference).
  Sourced from the repo's `README.md`, `docs/prd.md`, and the package/example READMEs.
- `changelog/` — releases feed (the Docusaurus blog plugin, repurposed).
- `src/components/` — `Badge`, `ProviderRouting` (the homepage signature), and `Packages`,
  ported from `examples/_shared/src/ui.tsx`.
- `src/css/custom.css` — the brand theme (tokens → Infima variables).

## Deploy (GitHub Pages)

Configured for the project site at `https://stewmore.github.io/expo-ai-runtime/`.

```bash
# Using SSH:
USE_SSH=true npm run deploy

# Or with a username:
GIT_USER=stewmore npm run deploy
```

This builds the site and pushes to the `gh-pages` branch. Alternatively, deploy `build/`
with a GitHub Pages Action on push to `main`.
