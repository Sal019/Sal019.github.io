# iQPlay — Static Working Version

The complete iQPlay site (from iqplayofficial.blogspot.com) as a plain static
website. Nothing was removed: the full design, all views, and the built-in
TMDB API code are exactly as in the original — the app code (JS/CSS/HTML) is
byte-for-byte the same file the blog itself serves.

## Why the single home.html "redirected" / broke
This template is built as **7 pages**, one per URL, and its JavaScript
decides which view to show from the URL. Each page is its own document:
the blog serves the same template shell on every page, but each page's body
carries that page's own skeleton containers (for example
`<div id='details-page-container'>` exists only in the real Details page's
body, not in the homepage's). An earlier version of this pack wrongly put
the homepage file at every path, so the Details/Player views had no
container to render into and stayed empty. This pack now uses **each
page's own served document**, exactly as the blog delivers it:

| File | URL it answers | View shown |
|---|---|---|
| `index.html` | `/` or `/index.html` | Home |
| `p/details.html` | `/p/details.html?id=...` | Movie/Series details |
| `p/player.html` | `/p/player.html?id=...` | Video player |
| `p/library.html` | `/p/library.html` | Library / Watchlist |
| `p/about-us.html` | `/p/about-us.html` | About Us |
| `p/privacy-policy.html` | `/p/privacy-policy.html` | Privacy Policy |
| `p/disclaimer.html` | `/p/disclaimer.html` | Disclaimer |
| `p/account.html` | `/p/account.html` | Account (added — see below) |
| `p/bookmark.html` | `/p/bookmark.html` | Bookmarks (added — see below) |

With only one loose `home.html`, every movie click pointed at a `/p/...` page
that did not exist in the copy, and the router did not recognise the page as
"home" (it checks for `/`, `/index.html`, or a blogspot host), so it bounced
navigation back toward the original blog. This pack contains all 7 pages, so
every link stays on **your** site and opens the right view.

## Edits made
1. Three invisible metadata values that pointed at the original blog were
   localised to `/`: the `rel=canonical` link and the two `og:url` meta tags.
2. **Supabase permanently removed** (added 2026-10-19). The original template
   secretly ran a *license check* against the template author's own Supabase
   projects: on page load it asked their database whether the current domain
   was licensed, and on any other domain it redirected visitors to the
   seller's registration page
   (`abefilmofficialzone.blogspot.com/p/registration.html`) — that was the
   mystery redirect. The same backend also powered comments/login.
   What was done:
   - The Supabase JS library `<script>` tag (jsdelivr CDN) was removed.
   - All 5 license-redirect statements in the app code were neutralised.
   - A small local stub now stands in for the backend client so the app's
     UI code keeps running with zero network calls to Supabase: the comment
     section simply shows empty and login is disabled. The TMDB browsing,
     details, player, and local watchlist work exactly as before.
   The two Supabase project addresses/keys still exist as inert text inside
   the template's scrambled string table, but nothing in the site calls
   them anymore.
3. **Ad scripts removed** (added 2026-10-19). The two third-party ad-network
   script tags from `hauledneedy.com` that shipped with the template were
   deleted from all pages, so no ad popups/redirects can come from them.
   A scan of the app code found no other ad-network endpoints — the only
   external services left are TMDB (content), image CDNs, YouTube, and the
   video-source embeds the player itself uses.
4. **Customisations** (added 2026-10-19, on request):
   - The bottom navigation bar is now **identical on every page**
     (Home · Movies · Series · Account). Previously the sub-pages used a
     different bar (Comment/Share/Back/Top). The bar's **Menu** item and
     **Dark Mode** item were removed; an **Account** item (same icon style)
     sits where Dark Mode was and links to `/p/account.html`. (The header's
     own theme switcher is untouched, so Light/Dark/colour modes still work
     from there.)
   - New **Account page** (`p/account.html`): a full-screen page (not a
     slide-in drawer) that carries everything the old Menu/sidebar held —
     profile header, Home, Movies, TV Series, Animation, Library,
     Privacy Policy, Disclaimer, About Us, and the Clear Cache button —
     in the same design (it reuses the sidebar's own markup and styles).
   - The player's **"Enable Sandbox" option was removed**: its controls are
     hidden on the Details/Player pages and the setting is forced off, so
     playback behaves as if Sandbox is disabled, permanently.
   - **Bookmarks page** (`p/bookmark.html`, added later the same day):
     clicking the header **Bookmark/Watchlist button** now opens this
     full page instead of the small dropdown (a tiny capture-phase script
     on every page routes the button here). The page lists everything
     saved in the browser's `abefilm_bookmarks` storage — the same items,
     markup and styles the app's own bookmark list uses — each row links
     to its Details page and has a remove (trash) button; an empty state
     shows when nothing is saved.
   - The header **category row** (For you / Movies / Anime / Series /
     K-Drama / C-Drama) is shown **only on the Home page** — it is hidden
     on every other page (Details, Player, Library, Bookmarks, Account,
     About, Privacy, Disclaimer).
   - **Header restored on view pages**: the template's own router deletes
     the top header (`.top-header`) and the theme modal when a view page
     (Player, Library, …) opens — in this static pack that left those
     pages with no header at all. A small guard script on every `/p/`
     page holds both elements and puts them back if the app removes them,
     so the header now stays on all pages.
   - **Comments & reactions removed** (later the same day): the whole
     `#comment-section` block on the Player view — the emoji reaction bar
     ("What's your opinion on this?" 👍😝😍😮😠😢) and the comment box,
     sort bar and list — is hidden on the Player and Details pages, and so
     are the **Comment tab** beside the Video tab and the **Comment
     button** in the player's control bar.
   - **Editable local profile** on the Account page: a pencil icon beside
     the profile name lets the visitor set their own name, and clicking
     the profile photo lets them pick a new one (downscaled to 256px) —
     a small green camera badge on the photo shows it can be changed, and
     the leftover "Movie" caption under the name was removed. Name and
     photo are saved in the browser's local storage (`iqplay_profile`)
     and restored on every visit — no account or server involved.
   - **Account page refinements**: the menu gained **Bookmarks** (→ the Bookmarks
     page) and **Appearance** (opens the app's theme/mode selector) after
     Library, and the list was lightly polished Android-settings style
     (rounded profile card, row dividers, chevron arrows).

5. **Anti-adblock popup removed** (added 2026-10-19). Every page still carried
   the template's anti-adblock block (by "Fineshop"): on first scroll it loaded
   Google AdSense's `adsbygoogle.js` purely as bait, and if that load failed
   (ad blocker, filtering DNS, some networks) it showed a full-screen
   "Ad-Blocker Detected!" popup with no close button, asking visitors to
   disable their ad blocker to support ad revenue — on a site whose ads were
   already removed. The popup `<div id='antiAdBlock'>` and its script were
   deleted from all 9 pages; all remaining scripts re-validated (syntax OK)
   and the pages re-tested — behaviour is otherwise unchanged.

## How to use
Upload the **whole folder** (keeping the `p/` folder inside) to any static
host — GitHub Pages, Netlify, Vercel, or any web server — and open the root
URL. It needs internet access at runtime (posters/details come from the TMDB
API, images and the Blogger widget script load from their CDNs), exactly like
the original site. Double-clicking the files from disk will not work properly
because the site's links are root-relative (`/p/...`) by design.
