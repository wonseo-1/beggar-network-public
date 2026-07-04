# Data License — Beggar Network public data API

The data served under `/data/api/v1/**` (spot listings, prices, city index) is
licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

https://creativecommons.org/licenses/by/4.0/

## What this means

You're free to:
- **Use** this data in your own app, script, research, or analysis
- **Share** and redistribute it, in any format
- **Adapt** it — remix, transform, build on top of it

As long as you:
- **Give attribution** — link back to Beggar Network (the site this repo
  deploys) and mention "Data by Beggar Network" somewhere a user would
  reasonably see it (an about page, a footer, API docs, etc.)

## What's NOT covered by this license

- The **application code** in this repository (JS/CSS/HTML) — see the
  repository's main license for that.
- Any **user-submitted content** beyond factual price/location data (e.g.
  photos) may carry its own rights; check with the maintainers before reuse.

## Schema

See `/data/api/v1/meta.json` for the current schema version and generation
timestamp. The API is versioned (`v1`, `v2`, ...) — a version won't change
shape once published, so it's safe to build against.

- `/data/api/v1/meta.json` — schema version, license pointer, generated-at
- `/data/api/v1/cities.json` — supported cities + spot counts
- `/data/api/v1/spots/<city>.json` — full spot list for one city

Questions or want to be listed as a project using this data? Open an issue.
