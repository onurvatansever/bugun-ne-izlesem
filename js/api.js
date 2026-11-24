(function (global) {
  "use strict";

  const utils =
    (global.NeIzlesem && global.NeIzlesem.utils) ||
    (typeof require === "function" ? require("./utils.js") : null);

  const ENDPOINTS = {
    game: "https://www.cheapshark.com/api/1.0/deals?storeID=1&pageSize=60",
    show: "https://api.tvmaze.com/shows?page=1",
    anime: "https://api.jikan.moe/v4/top/anime?limit=25"
  };

  function normalizeGame(deal) {
    if (!deal || !deal.dealID || !deal.title) return null;

    const salePrice = Number.parseFloat(deal.salePrice);
    const normalPrice = Number.parseFloat(deal.normalPrice);
    const savings = Math.round(Number.parseFloat(deal.savings) || 0);
    const metacriticRaw = Number.parseInt(deal.metacriticScore, 10);
    const score = Number.isFinite(metacriticRaw) && metacriticRaw > 0 ? metacriticRaw : null;

    const steamAppID = deal.steamAppID ? String(deal.steamAppID).trim() : "";
    const thumbUrl = utils.ensureHttps(deal.thumb || "");
    const highResCover = steamAppID
      ? "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/" +
        encodeURIComponent(steamAppID) +
        "/header.jpg"
      : thumbUrl;

    const ratingTr = utils.translateSteamRating(deal.steamRatingText);
    const ratingPercent = Number.parseInt(deal.steamRatingPercent, 10);
    const reviewCount = Number.parseInt(deal.steamRatingCount, 10);

    const summaryParts = [];
    if (savings > 0 && Number.isFinite(normalPrice) && Number.isFinite(salePrice)) {
      summaryParts.push(
        "Steam'de %" +
          savings +
          " indirimle " +
          utils.formatUsd(normalPrice) +
          " yerine " +
          utils.formatUsd(salePrice) +
          " fiyatıyla öne çıkıyor."
      );
    } else if (Number.isFinite(salePrice)) {
      summaryParts.push("Steam mağazasında " + utils.formatUsd(salePrice) + " fiyatıyla listeleniyor.");
    }

    if (ratingTr) {
      let reviewSentence = "Steam kullanıcı değerlendirmesi: " + ratingTr;
      if (Number.isFinite(ratingPercent) && ratingPercent > 0) {
        reviewSentence += " (%" + ratingPercent + " olumlu";
        if (Number.isFinite(reviewCount) && reviewCount > 0) {
          reviewSentence += ", " + reviewCount.toLocaleString("tr-TR") + " inceleme";
        }
        reviewSentence += ")";
      }
      summaryParts.push(reviewSentence + ".");
    }

    if (score !== null) {
      summaryParts.push("Metacritic eleştirmen puanı " + score + "/100.");
    }

    const tags = [];
    if (savings > 0) {
      tags.push({ type: "discount", label: "-" + savings + "%" });
    }
    if (Number.isFinite(salePrice)) {
      tags.push({
        type: "price",
        salePrice: utils.formatUsd(salePrice),
        normalPrice:
          Number.isFinite(normalPrice) && normalPrice > salePrice
            ? utils.formatUsd(normalPrice)
            : ""
      });
    }
    if (ratingTr) {
      tags.push({ type: "tag", label: "Steam: " + ratingTr });
    }

    return {
      uid: "game:" + deal.dealID,
      category: "game",
      title: String(deal.title).trim(),
      image: highResCover || utils.PLACEHOLDER_SVG,
      fallbackImage: thumbUrl || utils.PLACEHOLDER_SVG,
      score: score,
      scoreLabel: score !== null ? "Metacritic " + score : "Metacritic Yok",
      scoreTier: score === null ? "na" : score >= 80 ? "high" : "mid",
      tags: tags,
      priceInfo: Number.isFinite(salePrice)
        ? {
            salePrice: salePrice,
            normalPrice: Number.isFinite(normalPrice) ? normalPrice : salePrice,
            savings: savings
          }
        : null,
      summary: summaryParts.join(" "),
      url: "https://www.cheapshark.com/redirect?dealID=" + encodeURIComponent(deal.dealID),
      sourceLabel: "Steam Fırsatına Git"
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

  function normalizeAnime(anime) {
    if (!anime || !anime.mal_id) return null;

    const title = String(anime.title || anime.title_english || "İsimsiz Anime").trim();
    const score =
      typeof anime.score === "number" && Number.isFinite(anime.score)
        ? Number(anime.score.toFixed(2))
        : null;

    const webpLarge = utils.ensureHttps(
      anime.images && anime.images.webp && anime.images.webp.large_image_url
    );
    const jpgLarge = utils.ensureHttps(
      anime.images && anime.images.jpg && anime.images.jpg.large_image_url
    );
    const jpgSmall = utils.ensureHttps(
      anime.images && anime.images.jpg && anime.images.jpg.image_url
    );

    const genres = Array.isArray(anime.genres)
      ? anime.genres
          .slice(0, 3)
          .map(function (g) {
            return utils.translateGenre(g && g.name);
          })
          .filter(Boolean)
      : [];

    const tags = genres.map(function (g) {
      return { type: "tag", label: g };
    });

    if (typeof anime.episodes === "number" && anime.episodes > 0) {
      tags.push({ type: "tag", label: anime.episodes + " Bölüm" });
    } else {
      tags.push({ type: "tag", label: "Bölüm Belirsiz" });
    }

    if (anime.year) {
      tags.push({ type: "tag", label: String(anime.year) });
    }

    const rawSynopsis = typeof anime.synopsis === "string"
      ? anime.synopsis.replace(/\[Written by MAL Rewrite\]/gi, "").trim()
      : "";

    return {
      uid: "anime:" + anime.mal_id,
      category: "anime",
      title: title,
      image: webpLarge || jpgLarge || jpgSmall || utils.PLACEHOLDER_SVG,
      fallbackImage: jpgSmall || utils.PLACEHOLDER_SVG,
      score: score,
      scoreLabel: score !== null ? "MAL " + score.toFixed(1) : "Puan Yok",
      scoreTier: score === null ? "na" : score >= 8.0 ? "high" : "mid",
      tags: tags,
      priceInfo: null,
      summary: rawSynopsis || "Bu anime için henüz özet bilgisi eklenmemiş.",
      url: utils.sanitizeExternalUrl(anime.url),
      sourceLabel: "MyAnimeList'te Gör"
    };
  }

  async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs || 12000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });

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
    const endpoint = ENDPOINTS[category];
    if (!endpoint) {
      throw new Error("Geçersiz kategori seçimi.");
    }

    const payload = await fetchJsonWithTimeout(endpoint, 15000);

    if (category === "game") {
      if (!Array.isArray(payload)) {
        throw new Error("Oyun verileri beklenen formatta alınamadı.");
      }
      const seenTitles = new Set();
      const normalized = [];
      for (let i = 0; i < payload.length; i += 1) {
        const item = normalizeGame(payload[i]);
        if (item && !seenTitles.has(item.title.toLowerCase())) {
          seenTitles.add(item.title.toLowerCase());
          normalized.push(item);
        }
      }
      return utils.shuffleArray(normalized);
    }

    if (category === "show") {
      if (!Array.isArray(payload)) {
        throw new Error("Dizi verileri beklenen formatta alınamadı.");
      }
      const normalized = payload.map(normalizeShow).filter(Boolean);
      return utils.shuffleArray(normalized);
    }

    if (category === "anime") {
      const list = payload && Array.isArray(payload.data) ? payload.data : null;
      if (!list) {
        throw new Error("Anime verileri beklenen formatta alınamadı.");
      }
      const normalized = list.map(normalizeAnime).filter(Boolean);
      return utils.shuffleArray(normalized);
    }

    return [];
  }

  const exported = {
    ENDPOINTS: ENDPOINTS,
    normalizeGame: normalizeGame,
    normalizeShow: normalizeShow,
    normalizeAnime: normalizeAnime,
    fetchCategoryItems: fetchCategoryItems
  };

  global.NeIzlesem = global.NeIzlesem || {};
  global.NeIzlesem.api = exported;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
})(typeof window !== "undefined" ? window : globalThis);
