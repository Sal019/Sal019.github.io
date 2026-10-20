/* =====================================================================
   SubDub source for iQPlay — data layer + renderers.
   Reads Salman's own Blogger catalogue (subdubanime.site) live at runtime
   via the blog's public JSON feed (JSONP), parses each post's episode
   data, enriches titles with TMDB metadata (the site's own TMDB key),
   and renders catalogue / details / player views in the site's design.
   No post list is hardcoded: new Blogger posts appear automatically.
   ===================================================================== */
window.SubDub = (function () {
  'use strict';

  var TMDB_KEY = 'fed86956458f19fb45cdd382b6e6de83';
  var TMDB_BASE = 'https://api.themoviedb.org/3';
  var FEED_BASE = 'https://www.subdubanime.site/feeds/posts/default';
  var RUBY_BASE = 'https://rubyvidhub.com/';
  var BLAKITE_BASE = 'https://blakiteapi.xyz/';
  var POSTER_FALLBACK = 'https://i.imgur.com/YyHsyEr.png';
  var POSTS_CACHE_KEY = 'subdub_posts_v1';
  var POSTS_TTL = 6 * 60 * 60 * 1000;
  var TMDB_MAP_KEY = 'subdub_tmdb_map';

  /* ---------------- utils ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normTitle(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  /* ---------------- JSONP ---------------- */
  var cbCounter = 0;
  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var name = 'sdjsonp_' + (++cbCounter) + '_' + Date.now();
      var timer = setTimeout(function () { cleanup(); reject(new Error('JSONP timeout')); }, 30000);
      function cleanup() {
        clearTimeout(timer);
        try { delete window[name]; } catch (e) { window[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[name] = function (data) { cleanup(); resolve(data); };
      var script = document.createElement('script');
      script.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + name;
      script.onerror = function () { cleanup(); reject(new Error('JSONP load error')); };
      document.head.appendChild(script);
    });
  }

  /* ---------------- Blogger feed parsing ---------------- */
  // Episode data inside a post's content. Two formats exist on the blog:
  //  A) <script> let episodeData = { 1: { EID: 'x', VID: 'y', ... }, ... } </script>
  //  B) <div id="blakiteapi" data-tmdb="13916" data-season="1" data-episodes="37"></div>
  function parseEntry(entry) {
    var content = (entry.content && entry.content.$t) || (entry.summary && entry.summary.$t) || '';
    var title = (entry.title && entry.title.$t) || 'Untitled';
    var idMatch = /post-(\d+)/.exec((entry.id && entry.id.$t) || '');
    var url = '';
    (entry.link || []).forEach(function (l) { if (l.rel === 'alternate') url = l.href; });
    var labels = (entry.category || []).map(function (c) { return c.term; });

    // poster: first image in the content (the post's thumbnail block)
    var poster = '';
    var imgM = /<img[^>]+src="([^"]+)"/i.exec(content);
    if (imgM) poster = imgM[1].replace(/&amp;/g, '&');
    if (!poster && entry['media$thumbnail'] && entry['media$thumbnail'].url) {
      poster = entry['media$thumbnail'].url.replace(/\/s\d+(-[a-z])?\//, '/s400/');
    }
    if (poster) poster = poster.replace(/=s\d+(-[a-z0-9]+)?$/i, '=s600');
    if (!poster) poster = POSTER_FALLBACK;

    // format B: blakite api declaration
    var api = null;
    var apiM = /id="blakiteapi"[^>]*data-tmdb="(\d+)"[^>]*data-season="(\d+)"[^>]*data-episodes="(\d+)"/i.exec(content)
      || /id="blakiteapi"[^>]*>/i.test(content) && (function () {
        var tag = /<div[^>]*id="blakiteapi"[^>]*>/i.exec(content);
        if (!tag) return null;
        function attr(n) { var mm = new RegExp('data-' + n + '="(\\d+)"').exec(tag[0]); return mm ? parseInt(mm[1], 10) : null; }
        var t = attr('tmdb');
        return t ? [null, String(t), String(attr('season') || 1), String(attr('episodes') || 1)] : null;
      })();
    if (apiM) api = { tmdb: parseInt(apiM[1], 10), season: parseInt(apiM[2] || '1', 10), episodes: parseInt(apiM[3] || '1', 10) };

    // format A: episodeData pairs. NOTE: on the blog the object often ends
    // with a trailing comma + blank lines and NO semicolon, so don't anchor
    // on '};' — take everything up to the end of the script block instead.
    var episodes = [];
    var edM = /episodeData\s*=\s*\{/.exec(content);
    if (edM) {
      var body = content.slice(edM.index, edM.index + 20000);
      var cut = body.indexOf('</script>');
      if (cut !== -1) body = body.slice(0, cut);
      var seen = {};
      var re = /(\d+)\s*:\s*\{([^}]*)\}/g, m;
      while ((m = re.exec(body)) !== null) {
        var n = parseInt(m[1], 10);
        if (seen[n]) continue;
        seen[n] = 1;
        var eidM = /EID\s*:\s*'([^']+)'/.exec(m[2]) || /EID\s*:\s*"([^"]+)"/.exec(m[2]);
        episodes.push({ n: n, eid: eidM ? eidM[1] : null });
      }
      episodes.sort(function (a, b) { return a.n - b.n; });
    }
    if (!episodes.length && api) {
      for (var i = 1; i <= api.episodes; i++) episodes.push({ n: i, eid: null });
    }

    var season = 1;
    var sM = /season\s*(\d+)/i.exec(title);
    if (sM) season = parseInt(sM[1], 10);
    else if (api) season = api.season;

    var isMovie = labels.indexOf('Movie') !== -1 ||
      (labels.indexOf('Series') === -1 && episodes.length <= 1 && !api);

    // plain-text fallback (post bodies are mostly player code; keep it short)
    var text = content
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 500);

    return {
      id: idMatch ? idMatch[1] : encodeURIComponent(url),
      title: title,
      cleanTitle: cleanTitle(title),
      season: season,
      poster: poster,
      labels: labels,
      episodes: episodes,
      api: api,
      isMovie: isMovie,
      url: url,
      published: (entry.published && entry.published.$t) || '',
      text: text
    };
  }

  function cleanTitle(title) {
    var t = String(title || '');
    t = t.replace(/\((?:hindi|english|fandub|fan dub|dub|sub|dubbed|subbed|eng ?dub|hin ?dub|org|200\d|19\d\d|20\d\d)\)/gi, ' ');
    t = t.replace(/\([^)]*\)/g, ' ');              // any remaining parentheticals
    t = t.replace(/\bseason\s*\d+\b/gi, ' ');
    t = t.replace(/\bpart\s*\d+\b/gi, ' ');
    t = t.replace(/[–—]/g, '-').replace(/\s+-\s*$/g, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  var postsPromise = null;
  function fetchAllPosts() {
    if (postsPromise) return postsPromise;
    // localStorage cache (slim parsed records)
    try {
      var raw = localStorage.getItem(POSTS_CACHE_KEY);
      if (raw) {
        var cached = JSON.parse(raw);
        if (cached && cached.t && (Date.now() - cached.t) < POSTS_TTL && cached.posts && cached.posts.length) {
          postsPromise = Promise.resolve(cached.posts);
          return postsPromise;
        }
      }
    } catch (e) {}
    postsPromise = (function () {
      var all = [], start = 1, total = Infinity;
      function page() {
        var u = FEED_BASE + '?alt=json-in-script&max-results=150&start-index=' + start;
        return jsonp(u).then(function (data) {
          var feed = (data && data.feed) || {};
          var entries = feed.entry || [];
          if (feed.openSearch$totalResults) total = parseInt(feed.openSearch$totalResults.$t, 10) || Infinity;
          entries.forEach(function (e) { try { all.push(parseEntry(e)); } catch (err) {} });
          start += 150;
          if (entries.length && all.length < total && entries.length === 150) return page();
          return all;
        });
      }
      return page().then(function (posts) {
        try { localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify({ t: Date.now(), posts: posts })); } catch (e) {}
        return posts;
      });
    })();
    return postsPromise;
  }

  function findPost(posts, id) {
    for (var i = 0; i < posts.length; i++) if (String(posts[i].id) === String(id)) return posts[i];
    return null;
  }

  /* ---------------- TMDB ---------------- */
  function tmdb(path) {
    var sep = path.indexOf('?') === -1 ? '?' : '&';
    return fetch(TMDB_BASE + path + sep + 'api_key=' + TMDB_KEY + '&language=en-US')
      .then(function (r) { if (!r.ok) throw new Error('TMDB ' + r.status); return r.json(); });
  }
  function loadMap() {
    try { return JSON.parse(localStorage.getItem(TMDB_MAP_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveMap(map) { try { localStorage.setItem(TMDB_MAP_KEY, JSON.stringify(map)); } catch (e) {} }

  function titleScore(a, b) {
    var x = normTitle(a), y = normTitle(b);
    if (!x || !y) return 0;
    if (x === y) return 100;
    if (x.indexOf(y) === 0 || y.indexOf(x) === 0) return 85;
    if (x.indexOf(y) !== -1 || y.indexOf(x) !== -1) return 70;
    var xt = x.match(/[a-z]+|\d+/g) || [], yt = y.match(/[a-z]+|\d+/g) || [];
    var hit = 0;
    xt.forEach(function (tok) { if (yt.indexOf(tok) !== -1) hit++; });
    var j = hit / Math.max(xt.length, yt.length, 1);
    return j >= 0.5 ? Math.round(40 + j * 30) : 0;
  }

  // Resolve a post to a TMDB title. Declared posts (blakiteapi) resolve
  // instantly; others are matched by cleaned-title search. Results cached.
  function matchTmdb(post) {
    var map = loadMap();
    var key = String(post.id);
    if (map[key]) return Promise.resolve(map[key].tmdbId ? map[key] : null);
    var result;
    if (post.api && post.api.tmdb) {
      result = Promise.resolve({
        tmdbId: post.api.tmdb,
        mediaType: post.isMovie ? 'movie' : 'tv',
        matchedTitle: post.cleanTitle,
        declared: true
      });
    } else {
      var q = encodeURIComponent(post.cleanTitle || post.title);
      result = tmdb('/search/tv?query=' + q).then(function (d) {
        return bestOf(d.results, 'tv');
      }).catch(function () { return null; }).then(function (best) {
        if (best) return best;
        return tmdb('/search/multi?query=' + q).then(function (d) {
          var rs = (d.results || []).filter(function (r) { return r.media_type === 'tv' || r.media_type === 'movie'; });
          return bestOf(rs, null);
        }).catch(function () { return null; });
      });
      function bestOf(results, forcedType) {
        var best = null, bestScore = 59; // require >= 60
        (results || []).forEach(function (r) {
          var name = r.name || r.title || '';
          var s = titleScore(post.cleanTitle, name);
          // season posts match the base series title; original title too
          if (r.original_name) s = Math.max(s, titleScore(post.cleanTitle, r.original_name));
          if (r.original_title) s = Math.max(s, titleScore(post.cleanTitle, r.original_title));
          if (s > bestScore) {
            bestScore = s;
            best = { tmdbId: r.id, mediaType: forcedType || r.media_type, matchedTitle: name, score: s };
          }
        });
        return best;
      }
    }
    return result.then(function (m) {
      map[key] = m || { tmdbId: 0 };
      saveMap(map);
      return m;
    });
  }

  function getDetails(match) {
    function load(type) {
      return tmdb('/' + type + '/' + match.tmdbId + '?append_to_response=credits,videos').then(function (d) {
        var cast = ((d.credits && d.credits.cast) || []).slice(0, 15).map(function (c) {
          return {
            name: c.name, character: c.character || '',
            img: c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : ''
          };
        });
        var trailer = null;
        var vids = ((d.videos && d.videos.results) || []).filter(function (v) { return v.site === 'YouTube' && v.type === 'Trailer'; });
        vids.sort(function (a, b) { return (b.official === true) - (a.official === true); });
        if (vids.length) trailer = vids[0].key;
        return {
          tmdbId: d.id, mediaType: type,
          title: d.name || d.title || match.matchedTitle,
          year: (d.first_air_date || d.release_date || '').slice(0, 4),
          rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
          genres: (d.genres || []).map(function (g) { return g.name; }),
          overview: d.overview || '',
          cast: cast, trailer: trailer,
          backdrop: d.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + d.backdrop_path : '',
          poster: d.poster_path ? 'https://image.tmdb.org/t/p/w500' + d.poster_path : '',
          seasons: d.number_of_seasons || null,
          runtime: (d.episode_run_time && d.episode_run_time[0]) || d.runtime || null
        };
      });
    }
    return load(match.mediaType).catch(function () {
      var other = match.mediaType === 'tv' ? 'movie' : 'tv';
      return load(other).then(function (det) {
        // persist the corrected type
        var map = loadMap();
        Object.keys(map).forEach(function (k) { if (map[k] && map[k].tmdbId === match.tmdbId) map[k].mediaType = other; });
        saveMap(map);
        return det;
      });
    });
  }

  /* ---------------- stream URL rules (same as the blog template) ------- */
  function rubyUrl(eid) { return RUBY_BASE + 'embed-' + eid + '.html?streamrurucy=true'; }
  function blakiteUrl(tmdbId, season, ep) { return BLAKITE_BASE + 'embed/' + tmdbId + '/' + season + '-' + ep; }

  /* ---------------- shared rendering ---------------- */
  // The app attaches its own delegated handlers to .tmdb-card (hover popup
  // + navigation built from TMDB data attrs). SubDub cards keep the class
  // for identical styling, but their clicks must go to the SubDub pages —
  // stop the app's handlers (capture phase) without blocking navigation.
  var guardDone = false;
  function installCardGuard() {
    if (guardDone) return;
    guardDone = true;
    ['click', 'mouseover'].forEach(function (evt) {
      document.addEventListener(evt, function (e) {
        var a = e.target && e.target.closest ? e.target.closest('.subdub-card') : null;
        if (a) e.stopPropagation();
      }, true);
    });
  }

  function cardHTML(post, metaLine) {
    var year = (post.published || '').slice(0, 4);
    var label = post.isMovie ? 'Movie' : (post.labels.indexOf('Hindi') !== -1 ? '' : '');
    var badge = post.labels.indexOf('FanDub') !== -1 ? 'FanDub' : (post.labels.indexOf('EngDub') !== -1 ? 'EngDub' : 'Hindi');
    return '<a class="tmdb-card subdub-card" title="' + esc(post.title) + '" href="/p/subdub-details.html?post=' + esc(post.id) + '">'
      + '<div class="tmdb-thumb">'
      + '<span class="tmdb-genre-label">' + esc(badge) + '</span>'
      + '<img src="' + esc(post.poster) + '" alt="' + esc(post.title) + '" loading="lazy" onerror="this.src=\'' + POSTER_FALLBACK + '\'" />'
      + '<div class="hover-overlay"></div>'
      + (year ? '<span class="tmdb-meta tmdb-year">' + esc(year) + '</span>' : '')
      + '<span class="tmdb-meta tmdb-rating"><i class="bi bi-star"></i> ' + esc(metaLine || (post.episodes.length ? post.episodes.length + ' EP' : '—')) + '</span>'
      + '</div>'
      + '<div class="tmdb-title">' + esc(post.title) + '</div>'
      + '</a>';
  }

  function castHTML(cast) {
    if (!cast || !cast.length) return '';
    return '<h2 class="sd-h2">Cast</h2><div class="sd-cast">' + cast.map(function (c) {
      return '<div class="sd-cast-item">'
        + (c.img ? '<img src="' + esc(c.img) + '" alt="' + esc(c.name) + '" loading="lazy" />' : '<img src="' + POSTER_FALLBACK + '" alt="" />')
        + '<div class="sd-cast-name">' + esc(c.name) + '</div>'
        + (c.character ? '<div class="sd-cast-char">' + esc(c.character) + '</div>' : '')
        + '</div>';
    }).join('') + '</div>';
  }

  function episodesHTML(post, currentEp) {
    if (!post.episodes.length) return '<p class="sd-muted">No episodes listed for this post yet.</p>';
    return '<div class="sd-episodes">' + post.episodes.map(function (ep) {
      return '<a class="sd-ep' + (currentEp === ep.n ? ' active' : '') + '" href="/p/subdub-player.html?post=' + esc(post.id) + '&ep=' + ep.n + '">'
        + ep.n + (ep.eid ? '<span class="sd-ep-dot" title="Ruby server available"></span>' : '')
        + '</a>';
    }).join('') + '</div>';
  }

  /* ---------------- Home section ---------------- */
  function initHome() {
    installCardGuard();
    var tries = 0;
    (function waitAnchor() {
      var anchor = document.getElementById('tmdb-section-1');
      if (!anchor) { if (++tries < 40) setTimeout(waitAnchor, 400); return; }
      if (document.getElementById('subdub-section')) return;
      var sec = document.createElement('div');
      sec.className = 'subdub-section';
      sec.id = 'subdub-section';
      sec.innerHTML = '<div class="subdub-head"><h3 class="subdub-heading">SubDub Anime</h3>'
        + '<a class="subdub-viewall" href="/p/subdub.html">View All &#8250;</a></div>'
        + '<div class="subdub-row" id="subdub-row"><div class="sd-muted" style="padding:8px 2px">Loading…</div></div>';
      anchor.parentNode.insertBefore(sec, anchor);
      fetchAllPosts().then(function (posts) {
        var row = document.getElementById('subdub-row');
        if (!row) return;
        var latest = posts.filter(function (p) { return p.episodes.length || p.api; }).slice(0, 20);
        row.innerHTML = latest.map(function (p) { return cardHTML(p); }).join('');
      }).catch(function () {
        var row = document.getElementById('subdub-row');
        if (row) row.innerHTML = '<div class="sd-muted" style="padding:8px 2px">Could not load the SubDub catalogue.</div>';
      });
    })();
  }

  /* ---------------- Catalogue page ---------------- */
  function initCatalogue() {
    installCardGuard();
    var grid = document.getElementById('subdub-grid');
    if (!grid) return;
    var count = document.getElementById('subdub-count');
    var input = document.getElementById('subdub-search');
    var all = [];
    function render(list) {
      grid.innerHTML = list.map(function (p) { return cardHTML(p); }).join('');
      if (count) count.textContent = list.length + ' titles';
      if (!list.length) grid.innerHTML = '<div class="sd-center">No titles match your search.</div>';
    }
    fetchAllPosts().then(function (posts) {
      all = posts;
      render(all);
    }).catch(function () {
      grid.innerHTML = '<div class="sd-center">Could not load the catalogue. Check your connection and reload.</div>';
    });
    if (input) input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      if (!q) { render(all); return; }
      render(all.filter(function (p) { return p.title.toLowerCase().indexOf(q) !== -1 || p.cleanTitle.toLowerCase().indexOf(q) !== -1; }));
    });
  }

  /* ---------------- Details page ---------------- */
  function initDetails() {
    installCardGuard();
    var root = document.getElementById('subdub-details');
    if (!root) return;
    var id = qs('post');
    root.innerHTML = '<div class="sd-center">Loading…</div>';
    fetchAllPosts().then(function (posts) {
      var post = findPost(posts, id);
      if (!post) { root.innerHTML = '<div class="sd-center">This title was not found in the SubDub catalogue.</div>'; return; }
      renderDetails(root, post);
    }).catch(function () {
      root.innerHTML = '<div class="sd-center">Could not load this title. Check your connection and reload.</div>';
    });
  }

  function renderDetails(root, post) {
    var firstEp = post.episodes.length ? post.episodes[0].n : 1;
    var metaBits = [];
    if (post.published) metaBits.push(post.published.slice(0, 4));
    var epLabel = post.labels.filter(function (l) { return /^Ep\s/i.test(l); })[0];
    if (epLabel) metaBits.push(epLabel.replace(/^Ep\s*/i, '') + ' Episodes');
    else if (post.episodes.length) metaBits.push(post.episodes.length + ' Episodes');
    post.labels.forEach(function (l) { if (l === 'Completed' || l === 'Ongoing' || l === 'Movie' || l === 'Series') metaBits.push(l); });
    root.innerHTML =
      '<div class="sd-backdrop"><img id="sd-backdrop-img" src="' + esc(post.poster) + '" alt="" /></div>'
      + '<div class="sd-details-main"><img class="sd-poster" id="sd-poster-img" src="' + esc(post.poster) + '" alt="' + esc(post.title) + '" />'
      + '<div class="sd-info"><h1 class="sd-title">' + esc(post.title) + '</h1>'
      + '<div class="sd-meta" id="sd-meta">' + metaBits.map(esc).join(' &bull; ') + '</div>'
      + '<div class="sd-genres" id="sd-genres"></div></div></div>'
      + '<div class="sd-actions">'
      + '<a class="sd-btn primary" href="/p/subdub-player.html?post=' + esc(post.id) + '&ep=' + firstEp + '">&#9654; Play</a>'
      + '<button class="sd-btn" id="sd-trailer-btn" style="display:none">Trailer</button>'
      + '<a class="sd-btn" href="' + esc(post.url) + '" target="_blank" rel="noopener">Original Post</a>'
      + '</div>'
      + '<div class="sd-trailer-wrap" id="sd-trailer-wrap"></div>'
      + '<p class="sd-overview" id="sd-overview">' + esc(post.text || '') + '</p>'
      + '<h2 class="sd-h2">Episodes</h2><div id="sd-episodes">' + episodesHTML(post, null) + '</div>'
      + '<div id="sd-cast"></div>';
    // TMDB enrichment (cast, trailer, genres, rating, synopsis, better art)
    matchTmdb(post).then(function (match) {
      if (!match) return null;
      return getDetails(match);
    }).then(function (det) {
      if (!det) return;
      var meta = document.getElementById('sd-meta');
      if (meta) {
        var bits = [];
        if (det.year) bits.push(det.year);
        if (det.rating) bits.push('<span class="sd-rating">&#9733; ' + det.rating + '</span>');
        bits.push(post.isMovie || det.mediaType === 'movie' ? 'Movie' : 'Series');
        if (det.runtime) bits.push(det.runtime + ' min');
        if (post.episodes.length) bits.push(post.episodes.length + ' Episodes');
        meta.innerHTML = bits.join(' &bull; ');
      }
      var g = document.getElementById('sd-genres');
      if (g && det.genres.length) g.innerHTML = det.genres.map(function (x) { return '<span class="sd-genre">' + esc(x) + '</span>'; }).join('');
      var ov = document.getElementById('sd-overview');
      if (ov && det.overview) ov.textContent = det.overview;
      var bd = document.getElementById('sd-backdrop-img');
      if (bd && det.backdrop) bd.src = det.backdrop;
      var pi = document.getElementById('sd-poster-img');
      if (pi && det.poster) pi.src = det.poster;
      var cast = document.getElementById('sd-cast');
      if (cast) cast.innerHTML = castHTML(det.cast);
      if (det.trailer) {
        var btn = document.getElementById('sd-trailer-btn');
        var wrap = document.getElementById('sd-trailer-wrap');
        if (btn && wrap) {
          btn.style.display = '';
          btn.addEventListener('click', function () {
            if (wrap.classList.contains('open')) { wrap.classList.remove('open'); wrap.innerHTML = ''; }
            else {
              wrap.innerHTML = '<iframe src="https://www.youtube.com/embed/' + esc(det.trailer) + '" allowfullscreen title="Trailer"></iframe>';
              wrap.classList.add('open');
            }
          });
        }
      }
    }).catch(function () {});
  }

  /* ---------------- Player page ---------------- */
  function initPlayer() {
    installCardGuard();
    var root = document.getElementById('subdub-player');
    if (!root) return;
    var id = qs('post');
    var startEp = parseInt(qs('ep') || '1', 10) || 1;
    root.innerHTML = '<div class="sd-center">Loading…</div>';
    fetchAllPosts().then(function (posts) {
      var post = findPost(posts, id);
      if (!post) { root.innerHTML = '<div class="sd-center">This title was not found in the SubDub catalogue.</div>'; return; }
      renderPlayer(root, post, startEp);
    }).catch(function () {
      root.innerHTML = '<div class="sd-center">Could not load this title. Check your connection and reload.</div>';
    });
  }

  function renderPlayer(root, post, startEp) {
    var state = { ep: null, server: null, match: null };
    post.episodes.forEach(function (e) { if (e.n === startEp) state.ep = e; });
    if (!state.ep) state.ep = post.episodes[0] || { n: startEp, eid: null };

    root.innerHTML =
      '<div class="sd-player-frame" id="sd-frame"></div>'
      + '<div class="sd-current">Currently Playing: <b id="sd-current-label"></b></div>'
      + '<div class="sd-servers"><div class="sd-servers-label">PILIH SERVER:</div><div class="sd-server-btns" id="sd-servers"></div></div>'
      + '<h1 class="sd-h1" style="margin-top:20px">' + esc(post.title) + '</h1>'
      + '<div class="sd-meta" id="sd-meta"></div>'
      + '<h2 class="sd-h2">Episodes</h2><div class="sd-episodes" id="sd-episodes"></div>'
      + '<p class="sd-overview" id="sd-overview">' + esc(post.text || '') + '</p>'
      + '<div id="sd-cast"></div>';

    function serversFor(ep) {
      var list = [];
      if (ep.eid) list.push({ key: 'ruby', name: 'Ruby', note: 'Server HD' });
      if (state.match && state.match.tmdbId) list.push({ key: 'blakite', name: 'Blakite', note: 'Server HD' });
      return list;
    }
    function frameSrc() {
      if (!state.server) return '';
      if (state.server === 'ruby') return rubyUrl(state.ep.eid);
      return blakiteUrl(state.match.tmdbId, post.season, state.ep.n);
    }
    function paint() {
      var frame = document.getElementById('sd-frame');
      var src = frameSrc();
      frame.innerHTML = src
        ? '<iframe id="sd-iframe" src="' + esc(src) + '" allowfullscreen allow="autoplay; fullscreen"></iframe>'
        : '<div class="sd-player-empty">No server is available for this episode yet.</div>';
      document.getElementById('sd-current-label').textContent =
        (post.isMovie ? 'Movie' : 'Episode ' + state.ep.n) + (state.server ? ' — ' + (state.server === 'ruby' ? 'Ruby' : 'Blakite') : '');
      var sv = document.getElementById('sd-servers');
      var list = serversFor(state.ep);
      sv.innerHTML = list.map(function (s) {
        return '<button class="sd-server' + (state.server === s.key ? ' active' : '') + '" data-server="' + s.key + '">' + s.name + '<small>' + (state.server === s.key ? 'AKTIF' : 'PILIH') + '</small></button>';
      }).join('') || '<span class="sd-muted">—</span>';
      sv.querySelectorAll('.sd-server').forEach(function (b) {
        b.addEventListener('click', function () { state.server = b.getAttribute('data-server'); paint(); });
      });
      var eg = document.getElementById('sd-episodes');
      eg.innerHTML = post.episodes.map(function (ep) {
        return '<button class="sd-ep' + (state.ep.n === ep.n ? ' active' : '') + '" data-ep="' + ep.n + '">' + ep.n + (ep.eid ? '<span class="sd-ep-dot"></span>' : '') + '</button>';
      }).join('') || '<span class="sd-muted">No episodes listed.</span>';
      eg.querySelectorAll('.sd-ep').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = parseInt(b.getAttribute('data-ep'), 10);
          post.episodes.forEach(function (e) { if (e.n === n) state.ep = e; });
          var avail = serversFor(state.ep);
          if (!avail.some(function (s) { return s.key === state.server; })) state.server = avail.length ? avail[0].key : null;
          paint();
        });
      });
    }
    // default server: Ruby first (same priority as the blog), else Blakite
    var initial = serversFor(state.ep);
    state.server = initial.length ? initial[0].key : null;
    paint();
    // TMDB match may add the Blakite server + enrichment
    matchTmdb(post).then(function (match) {
      if (match) {
        state.match = match;
        if (!state.server) { var av = serversFor(state.ep); state.server = av.length ? av[0].key : null; }
        paint();
        return getDetails(match);
      }
      return null;
    }).then(function (det) {
      if (!det) return;
      var meta = document.getElementById('sd-meta');
      if (meta) {
        var bits = [];
        if (det.year) bits.push(det.year);
        if (det.rating) bits.push('<span class="sd-rating">&#9733; ' + det.rating + '</span>');
        if (det.genres.length) bits.push(det.genres.slice(0, 3).join(', '));
        meta.innerHTML = bits.join(' &bull; ');
      }
      var ov = document.getElementById('sd-overview');
      if (ov && det.overview) ov.textContent = det.overview;
      var cast = document.getElementById('sd-cast');
      if (cast) cast.innerHTML = castHTML(det.cast);
    }).catch(function () {});
  }

  return {
    initHome: function () { ready(initHome); },
    initCatalogue: function () { ready(initCatalogue); },
    initDetails: function () { ready(initDetails); },
    initPlayer: function () { ready(initPlayer); },
    fetchAllPosts: fetchAllPosts,
    matchTmdb: matchTmdb,
    _test: { parseEntry: parseEntry, cleanTitle: cleanTitle, rubyUrl: rubyUrl, blakiteUrl: blakiteUrl }
  };
})();
