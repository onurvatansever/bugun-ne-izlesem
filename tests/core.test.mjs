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

test("normalizeGame maps CheapShark deal fields and builds high-res Steam cover", () => {
  const game = api.normalizeGame({
    dealID: "abc123",
    title: "Hollow Knight",
    salePrice: "7.49",
    normalPrice: "14.99",
    savings: "50.03",
    metacriticScore: "87",
    steamAppID: "367520",
    steamRatingText: "Overwhelmingly Positive",
    steamRatingPercent: "97",
    steamRatingCount: "250000",
    thumb: "https://cdn.example.com/thumb.jpg"
  });

  assert.equal(game.uid, "game:abc123");
  assert.equal(game.score, 87);
  assert.equal(game.scoreTier, "high");
  assert.equal(game.priceInfo.salePrice, 7.49);
  assert.equal(game.priceInfo.savings, 50);
  assert.match(game.image, /367520\/header\.jpg$/);
  assert.equal(game.url, "https://www.cheapshark.com/redirect?dealID=abc123");
  assert.match(game.summary, /%50 indirimle/);
  assert.match(game.summary, /Son Derece Olumlu/);
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

test("normalizeAnime maps Jikan v4 fields and strips MAL rewrite footer", () => {
  const anime = api.normalizeAnime({
    mal_id: 5114,
    title: "Fullmetal Alchemist: Brotherhood",
    score: 9.1,
    episodes: 64,
    year: 2009,
    genres: [{ name: "Action" }, { name: "Adventure" }],
    images: {
      webp: { large_image_url: "https://cdn.myanimelist.net/images/anime/fma.webp" }
    },
    synopsis: "Two brothers search for a Philosopher's Stone. [Written by MAL Rewrite]",
    url: "https://myanimelist.net/anime/5114"
  });

  assert.equal(anime.uid, "anime:5114");
  assert.equal(anime.score, 9.1);
  assert.equal(anime.summary, "Two brothers search for a Philosopher's Stone.");
  assert.ok(anime.tags.some((t) => t.label === "64 Bölüm"));
  assert.ok(anime.tags.some((t) => t.label === "Aksiyon"));
});

test("filterItems enforces 80+/8.0+ and under $10 game filters accurately", () => {
  const games = [
    { uid: "g1", score: 85, priceInfo: { salePrice: 4.99 } },
    { uid: "g2", score: 85, priceInfo: { salePrice: 19.99 } },
    { uid: "g3", score: 72, priceInfo: { salePrice: 3.99 } },
    { uid: "g4", score: null, priceInfo: { salePrice: 2.99 } }
  ];

  const highOnly = utils.filterItems(games, "game", { highRated: true, underTen: false });
  assert.deepEqual(highOnly.map((g) => g.uid), ["g1", "g2"]);

  const underTenOnly = utils.filterItems(games, "game", { highRated: false, underTen: true });
  assert.deepEqual(underTenOnly.map((g) => g.uid), ["g1", "g3", "g4"]);

  const both = utils.filterItems(games, "game", { highRated: true, underTen: true });
  assert.deepEqual(both.map((g) => g.uid), ["g1"]);

  const shows = [
    { uid: "s1", score: 8.4 },
    { uid: "s2", score: 7.9 },
    { uid: "s3", score: null }
  ];
  const highShows = utils.filterItems(shows, "show", { highRated: true, underTen: true });
  assert.deepEqual(highShows.map((s) => s.uid), ["s1"]);
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
    uid: "game:1",
    category: "game",
    title: "Hades",
    image: "https://example.com/hades.jpg",
    score: 93,
    scoreLabel: "Metacritic 93",
    url: "https://www.cheapshark.com/redirect?dealID=1"
  };

  const first = storage.saveItem(sample, mem);
  assert.equal(first.added, true);
  assert.equal(first.items.length, 1);

  const dup = storage.saveItem(sample, mem);
  assert.equal(dup.added, false);
  assert.equal(dup.items.length, 1);

  const afterRemove = storage.removeItem("game:1", mem);
  assert.equal(afterRemove.length, 0);

  storage.saveItem(sample, mem);
  const afterClear = storage.clearSavedItems(mem);
  assert.equal(afterClear.length, 0);
});
