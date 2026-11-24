import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const utils = require("../js/utils.js");
const storage = require("../js/storage.js");
const api = require("../js/api.js");

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    }
  };
}

test("stripHtml removes HTML tags and decodes entities safely", () => {
  const raw = "<p><b>Breaking Bad</b> &amp; <i>Better Call Saul</i> &mdash; 100&#37; klasik.</p>";
  assert.equal(utils.stripHtml(raw), "Breaking Bad & Better Call Saul — 100% klasik.");
  assert.equal(utils.stripHtml(null), "");
});

test("ensureHttps upgrades http image URLs and rejects invalid protocols", () => {
  assert.equal(utils.ensureHttps("http://static.tvmaze.com/a.jpg"), "https://static.tvmaze.com/a.jpg");
  assert.equal(utils.ensureHttps("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(utils.ensureHttps("javascript:alert(1)"), "");
  assert.equal(utils.sanitizeExternalUrl("javascript:alert(1)"), "#");
});

test("normalizeNexardaGame maps NEXARDA v3 fields and skips upcoming/unpriced games", () => {
  const upcoming = api.normalizeNexardaGame({
    game_info: { id: 1, name: "Future Game", upcoming: true, lowest_price: -1 }
  });
  assert.equal(upcoming, null);

  const game = api.normalizeNexardaGame({
    title: "Gravebound (2026)",
    slug: "/games/gravebound-(123)",
    image: "https://imgcdn1.nexarda.com/cover.webp",
    game_info: {
      id: 123,
      name: "Gravebound",
      short_desc: "Dark roguelite dungeon crawler with tactical combat.",
      release_date: 1794355200,
      upcoming: false,
      delisted: false,
      cancelled: false,
      spotlight: true,
      lowest_price: 7.49,
      highest_discount: 50,
      platforms: [{ name: "Steam" }]
    }
  });

  assert.equal(game.uid, "game:123");
  assert.equal(game.title, "Gravebound");
  assert.equal(game.isFeatured, true);
  assert.equal(game.scoreLabel, "Öne Çıkan");
  assert.equal(game.priceInfo.salePrice, 7.49);
  assert.equal(game.priceInfo.savings, 50);
  assert.equal(game.url, "https://www.nexarda.com/games/gravebound-(123)");
  assert.ok(game.tags.some((t) => t.type === "discount" && t.label === "-50%"));
  assert.ok(game.tags.some((t) => t.type === "price" && t.salePrice === "$7.49"));
});

test("normalizeShow cleans HTML summary, handles null rating, and translates genres", () => {
  const show = api.normalizeShow({
    id: 42,
    name: "Dark",
    genres: ["Science-Fiction", "Thriller", "Mystery"],
    rating: { average: 8.8 },
    premiered: "2017-12-01",
    averageRuntime: 55,
    image: {
      original: "http://static.tvmaze.com/uploads/original.jpg",
      medium: "http://static.tvmaze.com/uploads/medium.jpg"
    },
    summary: "<p>A missing child sets <b>four families</b> on a frantic hunt.</p>",
    officialSite: "https://www.netflix.com/title/80100172",
    url: "https://www.tvmaze.com/shows/42/dark"
  });

  assert.equal(show.uid, "show:42");
  assert.equal(show.score, 8.8);
  assert.equal(show.image, "https://static.tvmaze.com/uploads/original.jpg");
  assert.equal(show.summary, "A missing child sets four families on a frantic hunt.");
  assert.equal(show.tags[0].label, "Bilim Kurgu");
  assert.equal(show.url, "https://www.netflix.com/title/80100172");
});

test("normalizeAniListAnime maps AniList GraphQL fields, strips HTML and source footer", () => {
  const anime = api.normalizeAniListAnime({
    id: 16498,
    idMal: 16498,
    title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan" },
    averageScore: 85,
    episodes: 25,
    seasonYear: 2013,
    genres: ["Action", "Drama"],
    description: "Humanity fights giant titans.<br><br>(Source: MangaHelpers)",
    coverImage: {
      extraLarge: "https://s4.anilist.co/large.jpg",
      large: "https://s4.anilist.co/med.jpg"
    },
    siteUrl: "https://anilist.co/anime/16498"
  });

  assert.equal(anime.uid, "anime:16498");
  assert.equal(anime.title, "Attack on Titan");
  assert.equal(anime.score, 8.5);
  assert.equal(anime.scoreLabel, "8.5 / 10");
  assert.equal(anime.summary, "Humanity fights giant titans.");
  assert.equal(anime.url, "https://myanimelist.net/anime/16498");
  assert.ok(anime.tags.some((t) => t.label === "25 Bölüm"));
  assert.ok(anime.tags.some((t) => t.label === "Aksiyon"));
});

test("filterItems enforces featured/big-discount, 8.0+, and under $10 filters accurately", () => {
  const games = [
    { uid: "g1", score: null, isFeatured: true, priceInfo: { salePrice: 4.99, savings: 10 } },
    { uid: "g2", score: null, isFeatured: false, priceInfo: { salePrice: 19.99, savings: 40 } },
    { uid: "g3", score: null, isFeatured: false, priceInfo: { salePrice: 3.99, savings: 10 } },
    { uid: "g4", score: null, isFeatured: false, priceInfo: { salePrice: 14.99, savings: 0 } }
  ];

  const featuredOrDiscount = utils.filterItems(games, "game", { highRated: true, underTen: false });
  assert.deepEqual(featuredOrDiscount.map((g) => g.uid), ["g1", "g2"]);

  const underTenOnly = utils.filterItems(games, "game", { highRated: false, underTen: true });
  assert.deepEqual(underTenOnly.map((g) => g.uid), ["g1", "g3"]);

  const both = utils.filterItems(games, "game", { highRated: true, underTen: true });
  assert.deepEqual(both.map((g) => g.uid), ["g1"]);

  const animes = [
    { uid: "a1", score: 8.6 },
    { uid: "a2", score: 7.7 },
    { uid: "a3", score: null }
  ];
  const highAnimes = utils.filterItems(animes, "anime", { highRated: true, underTen: true });
  assert.deepEqual(highAnimes.map((a) => a.uid), ["a1"]);
});

test("pickNextItem skips previously seen items and returns null when exhausted", () => {
  const pool = [{ uid: "a" }, { uid: "b" }, { uid: "c" }];
  const seen = new Set(["a", "c"]);
  assert.equal(utils.pickNextItem(pool, seen)?.uid, "b");
  seen.add("b");
  assert.equal(utils.pickNextItem(pool, seen), null);
});

test("storage persists, deduplicates, removes, and clears saved items", () => {
  const mem = createMemoryStorage();
  const sample = {
    uid: "game:123",
    category: "game",
    title: "Gravebound",
    image: "https://example.com/gravebound.jpg",
    score: null,
    scoreLabel: "Öne Çıkan",
    url: "https://www.nexarda.com/games/gravebound-(123)"
  };

  const first = storage.saveItem(sample, mem);
  assert.equal(first.added, true);
  assert.equal(first.items.length, 1);

  const dup = storage.saveItem(sample, mem);
  assert.equal(dup.added, false);
  assert.equal(dup.items.length, 1);

  const afterRemove = storage.removeItem("game:123", mem);
  assert.equal(afterRemove.length, 0);

  storage.saveItem(sample, mem);
  const afterClear = storage.clearSavedItems(mem);
  assert.equal(afterClear.length, 0);
});
