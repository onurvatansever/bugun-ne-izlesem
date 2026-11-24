(function (global) {
  "use strict";

  const utils =
    (global.NeIzlesem && global.NeIzlesem.utils) ||
    (typeof require === "function" ? require("./utils.js") : null);

  const ENDPOINTS = {
    gamePages: [
      "https://www.nexarda.com/api/v3/search?type=games&q=&currency=USD&page=2",
      "https://www.nexarda.com/api/v3/search?type=games&q=a&currency=USD&page=1"
    ],
    show: "https://api.tvmaze.com/shows?page=1",
    anime: "https://graphql.anilist.co"
  };

  const ANILIST_QUERY = `
    query {
      Page(page: 1, perPage: 50) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          idMal
          title {
            romaji
            english
          }
          averageScore
          episodes
          seasonYear
          genres
          description(asHtml: false)
          coverImage {
            extraLarge
            large
          }
          siteUrl
        }
      }
    }
  `;

  function normalizeNexardaGame(entry) {
    if (!entry || !entry.game_info || !entry.game_info.id) return null;

    const info = entry.game_info;
    if (info.upcoming || info.delisted || info.cancelled) return null;

    const lowestPrice = typeof info.lowest_price === "number" ? info.lowest_price : -1;
    if (lowestPrice < 0) return null;

    const discount =
      typeof info.highest_discount === "number" && info.highest_discount > 0
        ? Math.round(info.highest_discount)
        : 0;

    const isFeatured = Boolean(info.spotlight);
    const title = String(info.name || entry.title || "İsimsiz Oyun").trim();
    const image = utils.ensureHttps(entry.image || "");

    const releaseYear =
      typeof info.release_date === "number" && info.release_date > 0
        ? new Date(info.release_date * 1000).getUTCFullYear()
        : null;

    const platforms = Array.isArray(info.platforms)
      ? info.platforms
          .slice(0, 2)
          .map(function (p) {
            return p && p.name ? String(p.name).trim() : "";
          })
          .filter(Boolean)
      : [];

    const tags = [];
    if (discount > 0) {
      tags.push({ type: "discount", label: "-" + discount + "%" });
    }

    if (lowestPrice === 0) {
      tags.push({ type: "price", salePrice: "Ücretsiz", normalPrice: "" });
    } else {
      const approxNormal =
        discount > 0 && discount < 99
          ? lowestPrice / (1 - discount / 100)
          : null;
      tags.push({
        type: "price",
        salePrice: utils.formatUsd(lowestPrice),
        normalPrice:
          approxNormal && approxNormal > lowestPrice + 0.05
            ? utils.formatUsd(approxNormal)
            : ""
      });
    }

    platforms.forEach(function (plat) {
      tags.push({ type: "tag", label: plat });
    });

    if (releaseYear && releaseYear >= 1980 && releaseYear <= 2030) {
      tags.push({ type: "tag", label: String(releaseYear) });
    }

    let scoreLabel = "Fırsat";
    let scoreTier = "mid";
    if (isFeatured) {
      scoreLabel = "Öne Çıkan";
      scoreTier = "high";
    } else if (discount >= 25) {
      scoreLabel = "%" + discount + " İndirim";
      scoreTier = "high";
    } else if (lowestPrice === 0) {
      scoreLabel = "Ücretsiz";
      scoreTier = "high";
    } else if (discount > 0) {
      scoreLabel = "%" + discount + " İndirim";
      scoreTier = "mid";
    } else if (releaseYear) {
      scoreLabel = String(releaseYear);
      scoreTier = "na";
    }

    const cleanedDesc = utils.stripHtml(info.short_desc || "");
    const fallbackDesc =
      lowestPrice === 0
        ? "Şu an ücretsiz olarak oynanabilen popüler oyunlardan biri."
        : "NEXARDA üzerinde " + utils.formatUsd(lowestPrice) + " başlangıç fiyatıyla listeleniyor.";

    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    const detailUrl = slug.startsWith("/")
      ? "https://www.nexarda.com" + slug
      : utils.sanitizeExternalUrl(slug);

    return {
      uid: "game:" + info.id,
      category: "game",
      title: title,
      image: image || utils.PLACEHOLDER_SVG,
      fallbackImage: utils.PLACEHOLDER_SVG,
      score: null,
      isFeatured: isFeatured,
      scoreLabel: scoreLabel,
      scoreTier: scoreTier,
      tags: tags,
      priceInfo: {
        salePrice: lowestPrice,
        normalPrice:
          discount > 0 && discount < 99
            ? Number((lowestPrice / (1 - discount / 100)).toFixed(2))
            : lowestPrice,
        savings: discount
      },
      summary: cleanedDesc || fallbackDesc,
      url: detailUrl,
      sourceLabel: "NEXARDA'da Gör"
    };
  }

  function normalizeShow(show) {
    if (!show || !show.id || !show.name) return null;

    const avg = show.rating && typeof show.rating.average === "number" ? show.rating.average : null;
    const score = avg !== null && Number.isFinite(avg) ? Number(avg.toFixed(1)) : null;

    const originalImg = utils.ensureHttps(show.image && show.image.original);
    const mediumImg = utils.ensureHttps(show.image && show.image.medium);
    const cleanedSummary = utils.stripHtml(show.summary);

    const genres = Array.isArray(show.genres)
      ? show.genres.slice(0, 3).map(utils.translateGenre).filter(Boolean)
      : [];

    const tags = genres.map(function (g) {
      return { type: "tag", label: g };
    });

    if (show.premiered && typeof show.premiered === "string") {
      const year = show.premiered.slice(0, 4);
      if (/^\d{4}$/.test(year)) {
        tags.push({ type: "tag", label: year });
      }
    }

    const runtime = show.averageRuntime || show.runtime;
    if (runtime) {
      tags.push({ type: "tag", label: runtime + " dk" });
    }

    if (tags.length === 0) {
      tags.push({ type: "tag", label: "Dizi" });
    }

    const officialUrl = utils.sanitizeExternalUrl(show.officialSite || show.url);
    const hasOfficial = Boolean(show.officialSite && /^https?:\/\//i.test(show.officialSite));

    return {
      uid: "show:" + show.id,
      category: "show",
      title: String(show.name).trim(),
      image: originalImg || mediumImg || utils.PLACEHOLDER_SVG,
      fallbackImage: mediumImg || utils.PLACEHOLDER_SVG,
      score: score,
      scoreLabel: score !== null ? score.toFixed(1) + " / 10" : "Puan Yok",
      scoreTier: score === null ? "na" : score >= 8.0 ? "high" : "mid",
      tags: tags,
      priceInfo: null,
      summary: cleanedSummary || "Bu dizi için henüz özet bilgisi eklenmemiş.",
      url: officialUrl,
      sourceLabel: hasOfficial ? "Resmi Sayfaya Git" : "TVMaze'de Gör"
    };
  }

  function normalizeAniListAnime(anime) {
    if (!anime || !anime.id) return null;

    const titleObj = anime.title || {};
    const title = String(titleObj.english || titleObj.romaji || "İsimsiz Anime").trim();

    const avg100 =
      typeof anime.averageScore === "number" && Number.isFinite(anime.averageScore)
        ? anime.averageScore
        : null;
    const score = avg100 !== null ? Number((avg100 / 10).toFixed(1)) : null;

    const extraLarge = utils.ensureHttps(anime.coverImage && anime.coverImage.extraLarge);
    const large = utils.ensureHttps(anime.coverImage && anime.coverImage.large);

    const genres = Array.isArray(anime.genres)
      ? anime.genres.slice(0, 3).map(utils.translateGenre).filter(Boolean)
      : [];

    const tags = genres.map(function (g) {
      return { type: "tag", label: g };
    });

    if (typeof anime.episodes === "number" && anime.episodes > 0) {
      tags.push({ type: "tag", label: anime.episodes + " Bölüm" });
    } else {
      tags.push({ type: "tag", label: "Devam Ediyor" });
    }

    if (anime.seasonYear) {
      tags.push({ type: "tag", label: String(anime.seasonYear) });
    }

    const cleanedDesc = utils
      .stripHtml(anime.description || "")
      .replace(/\(Source:[^)]+\)\s*$/i, "")
      .trim();

    const externalUrl = anime.idMal
      ? "https://myanimelist.net/anime/" + encodeURIComponent(anime.idMal)
      : utils.sanitizeExternalUrl(anime.siteUrl);

    return {
      uid: "anime:" + anime.id,
      category: "anime",
      title: title,
      image: extraLarge || large || utils.PLACEHOLDER_SVG,
      fallbackImage: large || utils.PLACEHOLDER_SVG,
      score: score,
      scoreLabel: score !== null ? score.toFixed(1) + " / 10" : "Puan Yok",
      scoreTier: score === null ? "na" : score >= 8.0 ? "high" : "mid",
      tags: tags,
      priceInfo: null,
      summary: cleanedDesc || "Bu anime için henüz özet bilgisi eklenmemiş.",
      url: externalUrl,
      sourceLabel: anime.idMal ? "MyAnimeList'te Gör" : "AniList'te Gör"
    };
  }

  async function fetchJsonWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs || 15000);

    try {
      const fetchOpts = Object.assign(
        { headers: { Accept: "application/json" } },
        options || {},
        { signal: controller.signal }
      );
      const response = await fetch(url, fetchOpts);

      if (response.status === 429) {
        throw new Error("API istek sınırına ulaşıldı. Birkaç saniye bekleyip tekrar deneyin.");
      }
      if (!response.ok) {
        throw new Error("Sunucu beklenmeyen bir yanıt döndürdü (HTTP " + response.status + ").");
      }
      return await response.json();
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("Sunucu yanıt vermekte gecikti (zaman aşımı). Lütfen tekrar deneyin.");
      }
      if (error instanceof TypeError) {
        throw new Error("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchCategoryItems(category) {
    if (category === "game") {
      const settled = await Promise.allSettled(
        ENDPOINTS.gamePages.map(function (url) {
          return fetchJsonWithTimeout(url, null, 15000);
        })
      );

      const seenIds = new Set();
      const normalized = [];
      let lastError = null;

      settled.forEach(function (res) {
        if (res.status === "rejected") {
          lastError = res.reason;
          return;
        }
        const items = res.value && res.value.results && res.value.results.items;
        if (!Array.isArray(items)) return;

        items.forEach(function (raw) {
          const item = normalizeNexardaGame(raw);
          if (item && !seenIds.has(item.uid)) {
            seenIds.add(item.uid);
            normalized.push(item);
          }
        });
      });

      if (normalized.length === 0) {
        throw lastError || new Error("Oyun verileri alınamadı. Lütfen tekrar deneyin.");
      }
      return utils.shuffleArray(normalized);
    }

    if (category === "show") {
      const payload = await fetchJsonWithTimeout(ENDPOINTS.show, null, 15000);
      if (!Array.isArray(payload)) {
        throw new Error("Dizi verileri beklenen formatta alınamadı.");
      }
      const normalized = payload.map(normalizeShow).filter(Boolean);
      return utils.shuffleArray(normalized);
    }

    if (category === "anime") {
      const payload = await fetchJsonWithTimeout(
        ENDPOINTS.anime,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ query: ANILIST_QUERY })
        },
        15000
      );

      const list =
        payload &&
        payload.data &&
        payload.data.Page &&
        Array.isArray(payload.data.Page.media)
          ? payload.data.Page.media
          : null;

      if (!list) {
        throw new Error("Anime verileri beklenen formatta alınamadı.");
      }
      const normalized = list.map(normalizeAniListAnime).filter(Boolean);
      return utils.shuffleArray(normalized);
    }

    throw new Error("Geçersiz kategori seçimi.");
  }

  const exported = {
    ENDPOINTS: ENDPOINTS,
    normalizeNexardaGame: normalizeNexardaGame,
    normalizeShow: normalizeShow,
    normalizeAniListAnime: normalizeAniListAnime,
    fetchCategoryItems: fetchCategoryItems
  };

  global.NeIzlesem = global.NeIzlesem || {};
  global.NeIzlesem.api = exported;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
})(typeof window !== "undefined" ? window : globalThis);
