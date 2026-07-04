# 🍳 Beggar Network

A map-based, community-verified wiki of cheap eats — every spot $14 or under.
Anyone can submit a spot or verify a price, no account required. Also
generates home-cook recipes (with savings math) from any YouTube cooking
video.

**Live site:** see repo description / About for the current URL.

## How it works

- **Map** — browse verified cheap spots by category and price tier.
- **Judge** — anonymous crowd verification (`legit` / `cap`) keeps prices
  honest. Enough "cap" votes with no "legit" auto-hides a listing; enough
  "legit" votes auto-approves a new submission. No admin bottleneck for
  routine moderation — admins only review edge cases.
- **Recipes** — paste a cooking video link, get a recipe with a
  restaurant-price-vs-home-price savings comparison and an Amazon shopping
  list for the ingredients.

## Architecture

- Static frontend (`index.html`, `js/`, `css/`, `assets/`) — hosted on
  GitHub Pages.
- **Writes** (new spot submissions, price verification votes) go straight to
  Supabase — this is real-time by design, and write volume is naturally low
  relative to reads.
- **Reads** (the map itself) are served from a static, versioned data
  snapshot — see `data/api/v1/` and `DATA_LICENSE.md`. A scheduled GitHub
  Action (`.github/workflows/build-snapshot.yml`) regenerates the snapshot
  and the SEO recipe pages (`recipe/<slug>/`) and `sitemap.xml` periodically
  by running `build/generate-static.mjs`.

This split keeps read traffic (which scales with visitors) off the database
entirely, while keeping writes (which scale with contributors, a much
smaller number) on a real backend with moderation logic.

## Public data API

`data/api/v1/*.json` is a documented, versioned, freely reusable data feed
under CC BY 4.0 — see [DATA_LICENSE.md](./DATA_LICENSE.md) if you want to
build something on top of it.

## Contributing

Issues and PRs welcome. This is a small, actively-developed project — please
open an issue before a large PR so we can align on direction first.
