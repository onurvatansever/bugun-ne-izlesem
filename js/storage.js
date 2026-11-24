(function (global) {
  "use strict";

  const STORAGE_KEY = "bugun_ne_izlesem_saved_v1";

  function getBackend(customStorage) {
    if (customStorage) return customStorage;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function getSavedItems(customStorage) {
    const store = getBackend(customStorage);
    if (!store) return [];
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function persist(items, customStorage) {
    const store = getBackend(customStorage);
    if (!store) return false;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (_) {
      return false;
    }
  }

  function saveItem(item, customStorage) {
    if (!item || !item.uid) {
      return { added: false, items: getSavedItems(customStorage) };
    }
    const items = getSavedItems(customStorage);
    const exists = items.some(function (entry) {
      return entry.uid === item.uid;
    });
    if (exists) {
      return { added: false, items: items };
    }

    const record = {
      uid: item.uid,
      category: item.category,
      title: item.title,
      image: item.image,
      fallbackImage: item.fallbackImage || "",
      score: item.score,
      scoreLabel: item.scoreLabel || "",
      priceInfo: item.priceInfo || null,
      url: item.url,
      sourceLabel: item.sourceLabel || "Detaya Git",
      savedAt: Date.now()
    };

    const next = [record].concat(items);
    persist(next, customStorage);
    return { added: true, items: next };
  }

  function removeItem(uid, customStorage) {
    const items = getSavedItems(customStorage);
    const next = items.filter(function (entry) {
      return entry.uid !== uid;
    });
    persist(next, customStorage);
    return next;
  }

  function clearSavedItems(customStorage) {
    persist([], customStorage);
    return [];
  }

  const exported = {
    STORAGE_KEY: STORAGE_KEY,
    getSavedItems: getSavedItems,
    saveItem: saveItem,
    removeItem: removeItem,
    clearSavedItems: clearSavedItems
  };

  global.NeIzlesem = global.NeIzlesem || {};
  global.NeIzlesem.storage = exported;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
})(typeof window !== "undefined" ? window : globalThis);
