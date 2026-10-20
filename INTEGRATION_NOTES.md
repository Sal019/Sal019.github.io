# SubDub → iQPlay Integration (Phase 1) — Notes

Built 2026-10-20 in this working copy (`~/workspace/iqplay-subdub/`), copied from
Salman's chosen base `~/workspace/iqplay-static/` (the original is untouched).
Nothing published or pushed.

## What was added / changed
- **ADDED `assets/subdub.js`** — the whole data layer + renderers (feed loader,
  post parser, TMDB matcher, home/catalogue/details/player renderers).
- **ADDED `assets/subdub.css`** — styles in the site's own design language
  (same CSS variables: `--keycolor`, `--bg-card`, `--text-primary`, …).
- **ADDED `p/subdub.html`** — full catalogue: grid of ALL posts + live search
  filter. Built from `p/about-us.html` following the established
  bookmark/account pattern (title/canonical swapped, the six template view
  containers hidden by a page style, content div before the bottom nav,
  init script before `</body>`).
- **ADDED `p/subdub-details.html`** — per-post details: backdrop/poster,
  TMDB-enriched meta/genres/synopsis/cast/Trailer button, episode grid.
- **ADDED `p/subdub-player.html`** — 16:9 iframe player with Ruby/Blakite
  server selection, episode switching, synopsis + cast.
- **CHANGED `index.html`** — two script tags before `</body>`
  (`assets/subdub.js` + `SubDub.initHome()`), inserting a "SubDub Anime"
  section (latest 20 posts, site card style) above the first TMDB section,
  with a "View All" link to `/p/subdub.html`.

## How it works
- At runtime the pages JSONP-load the blog's public feed
  (`subdubanime.site/feeds/posts/default`, 3 pages × 150) — **no post list is
  hardcoded**, so new Blogger posts appear automatically. Parsed posts are
  cached in `localStorage` (`subdub_posts_v1`, 6 h TTL).
- Each post's content is parsed (never eval'd) for two episode formats:
  `episodeData = { n: { EID: '…' } }` and/or
  `<div id="blakiteapi" data-tmdb data-season data-episodes>`.
- TMDB enrichment: posts with a declared TMDB id use it directly; others are
  matched by cleaned-title search (tv first, then multi). Matches are cached
  in `localStorage` (`subdub_tmdb_map`). Details fetch
  `/{type}/{id}?append_to_response=credits,videos` for cast + YouTube trailer.
- Stream URLs use the blog template's own rules:
  Ruby = `https://rubyvidhub.com/embed-<EID>.html?streamrurucy=true`
  (episode needs an EID); Blakite =
  `https://blakiteapi.xyz/embed/<tmdbId>/<season>-<episode>`
  (needs a TMDB match/declared id).
- SubDub cards reuse the site's `.tmdb-card` markup for identical styling; a
  capture-phase guard keeps the app's own card handlers (hover popup /
  TMDB navigation) from hijacking SubDub card clicks.

## Feed parse stats (all 358 posts, checked 2026-10-20)
- Total posts: **358**. With resolvable episodes: **350**.
- `episodeData` only: 220 · both formats: 98 · `blakiteapi` only: 32.
- Declared TMDB ids (`blakiteapi` div): 130 posts.
- 40 posts carry the `Movie` label; 87 posts have a single episode entry.
- Posters: the JSON feed has **no `media$thumbnail`** for any post, so the
  poster is the first `<img>` in the post content (present in 357/358);
  one fallback placeholder covers the rest.
- TMDB matching sample (every 15th post, n=23): **20 matched (87%)**,
  including all declared posts. Spot-verified exact: "Kaiju no 8 Season 2"
  → *Kaiju No. 8* (score 100); Death Note's declared id 13916 is the real
  *Death Note*. Misses are blog-side title quirks (a typo "Vemding Machine",
  "Ghost in the Shell - Solid State Society (2007)",
  "Attack on Titan Season 4 Part 2,3"). Unmatched posts still show full
  blog data, episodes and the Ruby server — only TMDB enrichment and the
  Blakite server are absent.

## Format exceptions found in his posts
- **8 posts have neither episode format** (catalogue/details show
  poster/title/labels, no episodes): "Streaming" (utility page),
  "Pokemon: The Arceus Chronicles (Movie)", "Pokemon: I Choose You (Movie)",
  "VTuber Legend" (×2 duplicate posts), "Testing 01 (No Need To Open)",
  "Look Back (Hindi)", "Dororo Season 1 (Hindi)".
- Some `episodeData` episodes carry only VID/TID/SID (no EID) — e.g. Black
  Summoner eps 7–12: those episodes have no Ruby server (Blakite only).
- `episodeData` objects usually end with a trailing comma and **no
  semicolon**; the parser deliberately does not anchor on `};`.
- The `Streaming` post (no episodes/poster) is excluded from the Home row
  but included in the full catalogue grid.

## Verification (jsdom harness, pack served at a local domain root)
All 8 checks PASS:
- Home: SubDub section renders 20 real cards from the live feed; cards link
  to `/p/subdub-details.html?post=<id>`; View All → `/p/subdub.html`.
- Catalogue: grid renders all **358** posts.
- Details (Death Note, declared-id post): **37** episode buttons, **11**
 cast items, trailer button appears.
- Details (Kaiju, search-matched post): 3 episodes, 5 cast, meta enriched
  ("2024 • ★ 8.4 • Series • 24 min • 3 Episodes").
- Player (Kaiju ep 1): iframe src is exactly
  `https://rubyvidhub.com/embed-9tjfzdg9juzr.html?streamrurucy=true`;
  server buttons show Ruby (active) + Blakite; switching to Blakite gives
  `https://blakiteapi.xyz/embed/207468/2-1`; episode 2 keeps the chosen
  server (`…/2-2`); switching back to Ruby uses ep 2's own EID.

Note: like the base pack, this copy must be hosted at a **domain root**
(absolute `/p/…` and `/assets/…` paths), and it needs internet access for
the Blogger feed, TMDB, posters and the embed hosts.

## ⚠️ Separate finding — TMDB key in the Flutter app
The key constant in `~/workspace/iqplay-app-project/lib/tmdb.dart` is only
10 characters and does **not** validate against TMDB. The website's real key
(assembled at runtime into `window.apiKey` by the site's config widget,
32 chars) validates fine (HTTP 200) and is the one `subdub.js` uses.
The Flutter app's key likely needs the same correction.
