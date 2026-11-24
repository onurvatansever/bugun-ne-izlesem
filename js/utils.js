(function (global) {
  "use strict";

  const HTML_ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "…",
    "&rsquo;": "’",
    "&lsquo;": "‘",
    "&rdquo;": "”",
    "&ldquo;": "“"
  };

  const GENRE_MAP = {
    Action: "Aksiyon",
    Adventure: "Macera",
    Animation: "Animasyon",
    Anime: "Anime",
    "Award Winning": "Ödüllü",
    Children: "Çocuk",
    Comedy: "Komedi",
    Crime: "Suç",
    Documentary: "Belgesel",
    Drama: "Dram",
    Espionage: "Casusluk",
    Family: "Aile",
    Fantasy: "Fantastik",
    Food: "Yemek",
    Gourmet: "Gurme",
    Historical: "Tarih",
    History: "Tarih",
    Horror: "Korku",
    Legal: "Hukuk",
    Medical: "Medikal",
    Music: "Müzik",
    Mystery: "Gizem",
    Nature: "Doğa",
    Romance: "Romantik",
    "Sci-Fi": "Bilim Kurgu",
    "Science-Fiction": "Bilim Kurgu",
    "Slice of Life": "Günlük Yaşam",
    Sports: "Spor",
    Supernatural: "Doğaüstü",
    Suspense: "Gerilim",
    Thriller: "Gerilim",
    Travel: "Gezi",
    War: "Savaş",
    Western: "Vahşi Batı"
  };

  const STEAM_RATING_MAP = {
    "Overwhelmingly Positive": "Son Derece Olumlu",
    "Very Positive": "Çok Olumlu",
    "Mostly Positive": "Çoğunlukla Olumlu",
    Positive: "Olumlu",
    Mixed: "Karışık",
    "Mostly Negative": "Çoğunlukla Olumsuz",
    Negative: "Olumsuz",
    "Very Negative": "Çok Olumsuz",
    "Overwhelmingly Negative": "Son Derece Olumsuz"
  };

  const PLACEHOLDER_SVG =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#171d36"/>
            <stop offset="100%" stop-color="#0a0d1a"/>
          </linearGradient>
        </defs>
        <rect width="600" height="420" fill="url(#bg)"/>
        <circle cx="300" cy="185" r="46" fill="none" stroke="#475569" stroke-width="5"/>
        <polygon points="288,165 324,185 288,205" fill="#64748b"/>
        <text x="300" y="275" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="20" font-weight="600">Görsel Bulunamadı</text>
      </svg>`
    );

  function stripHtml(raw) {
    if (!raw || typeof raw !== "string") return "";
    let text = raw.replace(/<[^>]*>/g, " ");
    text = text.replace(/&[a-zA-Z0-9#]+;/g, function (entity) {
      if (Object.prototype.hasOwnProperty.call(HTML_ENTITIES, entity)) {
        return HTML_ENTITIES[entity];
      }
      if (entity.startsWith("&#x") || entity.startsWith("&#X")) {
        const code = parseInt(entity.slice(3, -1), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : "";
      }
      if (entity.startsWith("&#")) {
        const code = parseInt(entity.slice(2, -1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : "";
      }
      return entity;
    });
    return text.replace(/\s+/g, " ").trim();
  }

  function ensureHttps(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("http://")) return "https://" + trimmed.slice(7);
    return "";
  }

  function sanitizeExternalUrl(url) {
    if (!url || typeof url !== "string") return "#";
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return "#";
  }

  function translateGenre(genre) {
    if (!genre || typeof genre !== "string") return "";
    return GENRE_MAP[genre.trim()] || genre.trim();
  }

  function translateSteamRating(ratingText) {
    if (!ratingText || typeof ratingText !== "string") return "";
    return STEAM_RATING_MAP[ratingText.trim()] || ratingText.trim();
  }

  function shuffleArray(items) {
    const arr = Array.isArray(items) ? items.slice() : [];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function matchesFilters(item, category, filters) {
    if (!item) return false;
    const opts = filters || {};

    if (opts.highRated) {
      if (category === "game") {
        const hasHighScore = typeof item.score === "number" && Number.isFinite(item.score) && item.score >= 80;
        const hasBigDiscount = Boolean(item.priceInfo && item.priceInfo.savings >= 25);
        const isFeatured = Boolean(item.isFeatured);
        if (!hasHighScore && !hasBigDiscount && !isFeatured) {
          return false;
        }
      } else {
        if (typeof item.score !== "number" || !Number.isFinite(item.score)) {
          return false;
        }
        if (item.score < 8.0) return false;
      }
    }

    if (category === "game" && opts.underTen) {
      const salePrice = item.priceInfo && typeof item.priceInfo.salePrice === "number"
        ? item.priceInfo.salePrice
        : Infinity;
      if (!(salePrice >= 0 && salePrice < 10)) return false;
    }

    return true;
  }

  function filterItems(items, category, filters) {
    if (!Array.isArray(items)) return [];
    return items.filter(function (item) {
      return matchesFilters(item, category, filters);
    });
  }

  function pickNextItem(items, seenIds) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const seen = seenIds instanceof Set ? seenIds : new Set(seenIds || []);
    for (let i = 0; i < items.length; i += 1) {
      if (!seen.has(items[i].uid)) {
        return items[i];
      }
    }
    return null;
  }

  function getCategoryLabel(category) {
    switch (category) {
      case "game":
        return "Oyun";
      case "show":
        return "Dizi";
      case "anime":
        return "Anime";
      default:
        return "Öneri";
    }
  }

  function formatUsd(amount) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
    return "$" + amount.toFixed(2);
  }

  const exported = {
    PLACEHOLDER_SVG: PLACEHOLDER_SVG,
    stripHtml: stripHtml,
    ensureHttps: ensureHttps,
    sanitizeExternalUrl: sanitizeExternalUrl,
    translateGenre: translateGenre,
    translateSteamRating: translateSteamRating,
    shuffleArray: shuffleArray,
    matchesFilters: matchesFilters,
    filterItems: filterItems,
    pickNextItem: pickNextItem,
    getCategoryLabel: getCategoryLabel,
    formatUsd: formatUsd
  };

  global.NeIzlesem = global.NeIzlesem || {};
  global.NeIzlesem.utils = exported;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
})(typeof window !== "undefined" ? window : globalThis);
