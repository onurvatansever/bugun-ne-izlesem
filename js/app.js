(function (global) {
  "use strict";

  const { utils, storage, api } = global.NeIzlesem;

  const LOADING_MESSAGES = {
    game: "NEXARDA üzerinden güncel oyunlar ve indirimler yükleniyor...",
    show: "TVMaze üzerinden popüler diziler yükleniyor...",
    anime: "AniList üzerinden popüler animeler yükleniyor..."
  };

  const state = {
    category: "game",
    filters: {
      highRated: false,
      underTen: false
    },
    pools: {
      game: null,
      show: null,
      anime: null
    },
    seen: {
      game: new Set(),
      show: new Set(),
      anime: new Set()
    },
    currentItem: null,
    isLoading: false,
    isAnimating: false,
    drawerOpen: false,
    drawerFilter: "all",
    savedItems: [],
    requestToken: 0,
    clearConfirmTimer: null,
    clearConfirmArmed: false
  };

  const el = {
    body: document.body,
    tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
    filterHighRated: document.getElementById("filterHighRated"),
    filterUnderTen: document.getElementById("filterUnderTen"),
    poolMeta: document.getElementById("poolMeta"),

    loadingState: document.getElementById("loadingState"),
    loadingCaption: document.getElementById("loadingCaption"),
    errorState: document.getElementById("errorState"),
    errorTitle: document.getElementById("errorTitle"),
    errorMessage: document.getElementById("errorMessage"),
    retryBtn: document.getElementById("retryBtn"),

    emptyState: document.getElementById("emptyState"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyMessage: document.getElementById("emptyMessage"),
    resetPoolBtn: document.getElementById("resetPoolBtn"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),

    cardStack: document.getElementById("cardStack"),
    activeCard: document.getElementById("activeCard"),
    stampPass: document.getElementById("stampPass"),
    stampSave: document.getElementById("stampSave"),
    cardImage: document.getElementById("cardImage"),
    cardCategoryBadge: document.getElementById("cardCategoryBadge"),
    cardScoreBadge: document.getElementById("cardScoreBadge"),
    cardScoreValue: document.getElementById("cardScoreValue"),
    cardDetailLink: document.getElementById("cardDetailLink"),
    cardDetailLabel: document.getElementById("cardDetailLabel"),
    cardTitle: document.getElementById("cardTitle"),
    cardTags: document.getElementById("cardTags"),
    cardSummary: document.getElementById("cardSummary"),

    passBtn: document.getElementById("passBtn"),
    saveBtn: document.getElementById("saveBtn"),

    openDrawerBtn: document.getElementById("openDrawerBtn"),
    savedCount: document.getElementById("savedCount"),
    drawerBackdrop: document.getElementById("drawerBackdrop"),
    savedDrawer: document.getElementById("savedDrawer"),
    closeDrawerBtn: document.getElementById("closeDrawerBtn"),
    drawerFilterBtns: Array.from(document.querySelectorAll(".drawer-filter-btn")),
    drawerList: document.getElementById("drawerList"),
    drawerFooter: document.getElementById("drawerFooter"),
    clearAllSavedBtn: document.getElementById("clearAllSavedBtn"),
    toastContainer: document.getElementById("toastContainer")
  };

  /* ========================
     Toast Bildirimleri
     ======================== */
  function showToast(message, variant) {
    const toast = document.createElement("div");
    toast.className = "toast" + (variant ? " toast-" + variant : "");
    toast.textContent = message;
    el.toastContainer.appendChild(toast);

    setTimeout(function () {
      toast.style.transition = "opacity 220ms ease, transform 220ms ease";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(function () {
        toast.remove();
      }, 240);
    }, 2200);
  }

  /* ========================
     Görünüm Durumu Yönetimi
     ======================== */
  function setStageView(view) {
    el.loadingState.classList.toggle("hidden", view !== "loading");
    el.errorState.classList.toggle("hidden", view !== "error");
    el.emptyState.classList.toggle("hidden", view !== "empty");
    el.cardStack.classList.toggle("hidden", view !== "card");

    const buttonsEnabled = view === "card" && !state.isAnimating;
    el.passBtn.disabled = !buttonsEnabled;
    el.saveBtn.disabled = !buttonsEnabled;
  }

  function updateCategoryUI() {
    el.body.setAttribute("data-category", state.category);

    el.tabButtons.forEach(function (btn) {
      const active = btn.dataset.category === state.category;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    // 10$ altı filtresi yalnızca Oyun sekmesinde görünür
    el.filterUnderTen.classList.toggle("hidden", state.category !== "game");
    const highRatedLabel = el.filterHighRated.querySelector("span:last-child");
    if (highRatedLabel) {
      highRatedLabel.textContent =
        state.category === "game"
          ? "Öne Çıkanlar & Yüksek İndirim (%25+)"
          : "Sadece Yüksek Puanlılar (8.0+)";
    }
    el.filterHighRated.setAttribute("aria-pressed", state.filters.highRated ? "true" : "false");
    el.filterUnderTen.setAttribute("aria-pressed", state.filters.underTen ? "true" : "false");
  }

  function updatePoolMeta(filteredTotal, remainingCount) {
    if (state.isLoading) {
      el.poolMeta.textContent = "";
      return;
    }
    if (filteredTotal === 0) {
      el.poolMeta.textContent = "Seçili filtrelere uyan öneri bulunamadı";
      return;
    }
    if (remainingCount === 0) {
      el.poolMeta.textContent = filteredTotal + " önerinin tamamı incelendi";
      return;
    }
    el.poolMeta.textContent =
      "Havuzda " + remainingCount + " / " + filteredTotal + " görülmemiş öneri var";
  }

  /* ========================
     Kart Render Etme
     ======================== */
  function renderCard(item, animateEnter) {
    state.currentItem = item;

    // Görsel fallback zinciri
    el.cardImage.dataset.fallbackStage = "0";
    el.cardImage.alt = item.title + " kapak görseli";
    el.cardImage.onerror = function () {
      const stage = el.cardImage.dataset.fallbackStage;
      if (stage === "0" && item.fallbackImage && item.fallbackImage !== item.image) {
        el.cardImage.dataset.fallbackStage = "1";
        el.cardImage.src = item.fallbackImage;
      } else if (stage !== "2") {
        el.cardImage.dataset.fallbackStage = "2";
        el.cardImage.src = utils.PLACEHOLDER_SVG;
      }
    };
    el.cardImage.src = item.image || utils.PLACEHOLDER_SVG;

    el.cardCategoryBadge.textContent = utils.getCategoryLabel(item.category);
    el.cardScoreValue.textContent = item.scoreLabel;

    el.cardScoreBadge.classList.remove("score-high", "score-mid", "score-na");
    el.cardScoreBadge.classList.add("score-" + (item.scoreTier || "na"));

    el.cardDetailLink.href = item.url || "#";
    el.cardDetailLabel.textContent = "Detaya Git";
    el.cardDetailLink.title = item.sourceLabel || "Detaya Git";

    el.cardTitle.textContent = item.title;
    el.cardSummary.textContent = item.summary;

    // Etiketler ve fiyat rozetleri (DOM API ile güvenli oluşturma)
    el.cardTags.textContent = "";
    (item.tags || []).forEach(function (tag) {
      const span = document.createElement("span");
      if (tag.type === "discount") {
        span.className = "tag-pill discount-pill";
        span.textContent = tag.label;
      } else if (tag.type === "price") {
        span.className = "tag-pill price-pill";
        if (tag.normalPrice) {
          const oldSpan = document.createElement("span");
          oldSpan.className = "old-price";
          oldSpan.textContent = tag.normalPrice;
          span.appendChild(oldSpan);
        }
        span.appendChild(document.createTextNode(tag.salePrice));
      } else {
        span.className = "tag-pill";
        span.textContent = tag.label;
      }
      el.cardTags.appendChild(span);
    });

    // Kart dönüşüm ve damgalarını sıfırla
    el.activeCard.style.transform = "";
    el.activeCard.classList.remove("swipe-left", "swipe-right", "dragging", "card-enter");
    el.stampPass.style.opacity = "0";
    el.stampSave.style.opacity = "0";

    setStageView("card");

    if (animateEnter) {
      // Reflow ile giriş animasyonunu yeniden tetikle
      void el.activeCard.offsetWidth;
      el.activeCard.classList.add("card-enter");
    }
  }

  function showNextCard(animateEnter) {
    const pool = state.pools[state.category];
    if (!Array.isArray(pool)) return;

    const filtered = utils.filterItems(pool, state.category, state.filters);
    const seen = state.seen[state.category];

    const remaining = filtered.filter(function (item) {
      return !seen.has(item.uid);
    });

    updatePoolMeta(filtered.length, remaining.length);

    if (filtered.length === 0) {
      state.currentItem = null;
      const hasActiveFilters =
        state.filters.highRated || (state.category === "game" && state.filters.underTen);
      el.emptyTitle.textContent = "Filtrelere Uygun Öneri Bulunamadı";
      el.emptyMessage.textContent =
        "Seçtiğin hızlı filtreler bu kategorideki tüm sonuçları eledi. Filtreleri gevşeterek yeni öneriler görebilirsin.";
      el.resetPoolBtn.classList.add("hidden");
      el.clearFiltersBtn.classList.toggle("hidden", !hasActiveFilters);
      setStageView("empty");
      return;
    }

    const nextItem = utils.pickNextItem(filtered, seen);
    if (!nextItem) {
      state.currentItem = null;
      el.emptyTitle.textContent = "Tüm Önerileri Gördün!";
      el.emptyMessage.textContent =
        "Bu kategorideki filtrelenmiş tüm önerilere göz attın. Havuzu sıfırlayıp yeniden karıştırarak keşfe devam edebilirsin.";
      el.resetPoolBtn.classList.remove("hidden");
      el.clearFiltersBtn.classList.add("hidden");
      setStageView("empty");
      return;
    }

    renderCard(nextItem, animateEnter);
  }

  /* ========================
     Veri Yükleme (API)
     ======================== */
  async function loadCategory(category, forceReload) {
    state.category = category;
    updateCategoryUI();

    if (!forceReload && Array.isArray(state.pools[category]) && state.pools[category].length > 0) {
      state.isLoading = false;
      showNextCard(true);
      return;
    }

    const token = ++state.requestToken;
    state.isLoading = true;
    state.currentItem = null;
    el.loadingCaption.textContent = LOADING_MESSAGES[category] || "Öneriler yükleniyor...";
    updatePoolMeta(0, 0);
    setStageView("loading");

    try {
      const items = await api.fetchCategoryItems(category);
      state.pools[category] = items;

      // Kullanıcı bu sırada başka bir sekmeye geçtiyse aktif ekranı bozma
      if (token !== state.requestToken || state.category !== category) {
        return;
      }

      state.isLoading = false;
      if (items.length === 0) {
        throw new Error("Bu kategori için API'den hiç öneri dönmedi.");
      }
      showNextCard(true);
    } catch (error) {
      if (token !== state.requestToken || state.category !== category) {
        return;
      }
      state.isLoading = false;
      state.currentItem = null;
      el.poolMeta.textContent = "";
      el.errorTitle.textContent = utils.getCategoryLabel(category) + " Verileri Alınamadı";
      el.errorMessage.textContent =
        (error && error.message) ||
        "Sunucuya şu an ulaşılamıyor. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.";
      setStageView("error");
    }
  }

  /* ========================
     Pas Geç & Kaydet Aksiyonları
     ======================== */
  function triggerSwipeAction(direction) {
    if (state.isAnimating || state.isLoading || !state.currentItem || state.drawerOpen) {
      return;
    }

    const item = state.currentItem;
    state.isAnimating = true;
    el.passBtn.disabled = true;
    el.saveBtn.disabled = true;

    state.seen[state.category].add(item.uid);

    if (direction === "save") {
      const result = storage.saveItem(item);
      state.savedItems = result.items;
      renderSavedCount(true);
      renderDrawerList();
      showToast(
        result.added ? "Listeme kaydedildi: " + item.title : "Zaten listende kayıtlı",
        result.added ? "save" : "info"
      );
      el.stampSave.style.opacity = "1";
      el.stampPass.style.opacity = "0";
      el.activeCard.classList.remove("dragging");
      el.activeCard.classList.add("swipe-right");
    } else {
      el.stampPass.style.opacity = "1";
      el.stampSave.style.opacity = "0";
      el.activeCard.classList.remove("dragging");
      el.activeCard.classList.add("swipe-left");
    }

    setTimeout(function () {
      state.isAnimating = false;
      showNextCard(true);
    }, 320);
  }

  /* ========================
     Fare / Dokunmatik Sürükleme
     ======================== */
  function setupCardDrag() {
    let dragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let currentX = 0;

    el.activeCard.addEventListener("pointerdown", function (event) {
      if (state.isAnimating || !state.currentItem || state.drawerOpen) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      if (event.target.closest("a, button")) return;

      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      currentX = 0;

      el.activeCard.classList.add("dragging");
      el.activeCard.setPointerCapture(pointerId);
    });

    el.activeCard.addEventListener("pointermove", function (event) {
      if (!dragging || event.pointerId !== pointerId) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      currentX = dx;

      const rotate = Math.max(-18, Math.min(18, dx * 0.045));
      el.activeCard.style.transform =
        "translate3d(" + dx + "px, " + dy * 0.16 + "px, 0) rotate(" + rotate + "deg)";

      const ratio = Math.min(1, Math.abs(dx) / 95);
      if (dx > 12) {
        el.stampSave.style.opacity = String(ratio);
        el.stampPass.style.opacity = "0";
      } else if (dx < -12) {
        el.stampPass.style.opacity = String(ratio);
        el.stampSave.style.opacity = "0";
      } else {
        el.stampSave.style.opacity = "0";
        el.stampPass.style.opacity = "0";
      }
    });

    function finishDrag(event) {
      if (!dragging || (event && event.pointerId !== pointerId)) return;
      dragging = false;

      if (pointerId !== null && el.activeCard.hasPointerCapture(pointerId)) {
        el.activeCard.releasePointerCapture(pointerId);
      }
      pointerId = null;
      el.activeCard.classList.remove("dragging");

      if (currentX > 95) {
        triggerSwipeAction("save");
      } else if (currentX < -95) {
        triggerSwipeAction("pass");
      } else {
        el.activeCard.style.transform = "";
        el.stampSave.style.opacity = "0";
        el.stampPass.style.opacity = "0";
      }
      currentX = 0;
    }

    el.activeCard.addEventListener("pointerup", finishDrag);
    el.activeCard.addEventListener("pointercancel", finishDrag);
  }

  /* ========================
     Kaydedilenler Çekmecesi
     ======================== */
  function renderSavedCount(withBump) {
    el.savedCount.textContent = String(state.savedItems.length);
    if (withBump) {
      el.openDrawerBtn.classList.remove("bump");
      void el.openDrawerBtn.offsetWidth;
      el.openDrawerBtn.classList.add("bump");
    }
  }

  function resetClearConfirm() {
    state.clearConfirmArmed = false;
    if (state.clearConfirmTimer) {
      clearTimeout(state.clearConfirmTimer);
      state.clearConfirmTimer = null;
    }
    el.clearAllSavedBtn.textContent = "Listeyi Temizle";
  }

  function renderDrawerList() {
    const items =
      state.drawerFilter === "all"
        ? state.savedItems
        : state.savedItems.filter(function (item) {
            return item.category === state.drawerFilter;
          });

    el.drawerFooter.classList.toggle("hidden", state.savedItems.length === 0);
    el.drawerList.textContent = "";

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "drawer-empty";
      const strong = document.createElement("strong");
      strong.textContent =
        state.savedItems.length === 0
          ? "Listen henüz boş"
          : "Bu kategoride kayıtlı öneri yok";
      const p = document.createElement("p");
      p.textContent =
        state.savedItems.length === 0
          ? "Beğendiğin önerileri sağa kaydırarak veya Kaydet butonuna basarak buraya ekleyebilirsin."
          : "Diğer kategorilere göz atabilir ya da keşfe devam edebilirsin.";
      empty.appendChild(strong);
      empty.appendChild(p);
      el.drawerList.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      const card = document.createElement("div");
      card.className = "saved-item-card";

      const img = document.createElement("img");
      img.className = "saved-thumb";
      img.alt = item.title;
      img.loading = "lazy";
      img.src = item.image || item.fallbackImage || utils.PLACEHOLDER_SVG;
      img.onerror = function () {
        if (img.src !== utils.PLACEHOLDER_SVG) {
          img.src =
            item.fallbackImage && img.src !== item.fallbackImage
              ? item.fallbackImage
              : utils.PLACEHOLDER_SVG;
        }
      };

      const info = document.createElement("div");
      info.className = "saved-info";

      const metaTop = document.createElement("div");
      metaTop.className = "saved-meta-top";

      const catBadge = document.createElement("span");
      catBadge.className = "mini-badge cat-" + item.category;
      catBadge.textContent = utils.getCategoryLabel(item.category);
      metaTop.appendChild(catBadge);

      if (item.scoreLabel) {
        const scoreSpan = document.createElement("span");
        scoreSpan.className = "mini-score";
        scoreSpan.textContent = "★ " + item.scoreLabel;
        metaTop.appendChild(scoreSpan);
      }

      if (item.priceInfo && typeof item.priceInfo.salePrice === "number") {
        const priceSpan = document.createElement("span");
        priceSpan.className = "mini-badge";
        priceSpan.textContent = utils.formatUsd(item.priceInfo.salePrice);
        metaTop.appendChild(priceSpan);
      }

      const title = document.createElement("h3");
      title.className = "saved-title";
      title.textContent = item.title;

      const actions = document.createElement("div");
      actions.className = "saved-actions";

      const link = document.createElement("a");
      link.className = "saved-link-btn";
      link.href = utils.sanitizeExternalUrl(item.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Detaya Git ↗";

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "saved-delete-btn";
      delBtn.textContent = "Sil";
      delBtn.addEventListener("click", function () {
        state.savedItems = storage.removeItem(item.uid);
        renderSavedCount(false);
        renderDrawerList();
        showToast("Listeden kaldırıldı", "info");
      });

      actions.appendChild(link);
      actions.appendChild(delBtn);

      info.appendChild(metaTop);
      info.appendChild(title);
      info.appendChild(actions);

      card.appendChild(img);
      card.appendChild(info);
      el.drawerList.appendChild(card);
    });
  }

  function openDrawer() {
    state.drawerOpen = true;
    resetClearConfirm();
    renderDrawerList();
    el.drawerBackdrop.classList.remove("hidden");
    requestAnimationFrame(function () {
      el.drawerBackdrop.classList.add("open");
      el.savedDrawer.classList.add("open");
    });
    el.savedDrawer.setAttribute("aria-hidden", "false");
    el.closeDrawerBtn.focus();
  }

  function closeDrawer() {
    if (!state.drawerOpen) return;
    state.drawerOpen = false;
    resetClearConfirm();
    el.drawerBackdrop.classList.remove("open");
    el.savedDrawer.classList.remove("open");
    el.savedDrawer.setAttribute("aria-hidden", "true");
    setTimeout(function () {
      if (!state.drawerOpen) {
        el.drawerBackdrop.classList.add("hidden");
      }
    }, 280);
  }

  /* ========================
     Olay Dinleyicileri
     ======================== */
  function bindEvents() {
    // Kategori sekmeleri
    el.tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const nextCat = btn.dataset.category;
        if (!nextCat || nextCat === state.category) return;
        loadCategory(nextCat, false);
      });
    });

    // Hızlı filtreler
    el.filterHighRated.addEventListener("click", function () {
      state.filters.highRated = !state.filters.highRated;
      updateCategoryUI();
      if (!state.isLoading && Array.isArray(state.pools[state.category])) {
        if (
          !state.currentItem ||
          !utils.matchesFilters(state.currentItem, state.category, state.filters)
        ) {
          showNextCard(true);
        } else {
          const filtered = utils.filterItems(
            state.pools[state.category],
            state.category,
            state.filters
          );
          const remaining = filtered.filter(function (i) {
            return !state.seen[state.category].has(i.uid);
          });
          updatePoolMeta(filtered.length, remaining.length);
        }
      }
    });

    el.filterUnderTen.addEventListener("click", function () {
      state.filters.underTen = !state.filters.underTen;
      updateCategoryUI();
      if (!state.isLoading && state.category === "game" && Array.isArray(state.pools.game)) {
        if (
          !state.currentItem ||
          !utils.matchesFilters(state.currentItem, "game", state.filters)
        ) {
          showNextCard(true);
        } else {
          const filtered = utils.filterItems(state.pools.game, "game", state.filters);
          const remaining = filtered.filter(function (i) {
            return !state.seen.game.has(i.uid);
          });
          updatePoolMeta(filtered.length, remaining.length);
        }
      }
    });

    // Kart aksiyon butonları
    el.passBtn.addEventListener("click", function () {
      triggerSwipeAction("pass");
    });

    el.saveBtn.addEventListener("click", function () {
      triggerSwipeAction("save");
    });

    // Hata & Boş durum butonları
    el.retryBtn.addEventListener("click", function () {
      loadCategory(state.category, true);
    });

    el.resetPoolBtn.addEventListener("click", function () {
      state.seen[state.category].clear();
      if (Array.isArray(state.pools[state.category])) {
        state.pools[state.category] = utils.shuffleArray(state.pools[state.category]);
      }
      showNextCard(true);
      showToast("Öneri havuzu sıfırlandı", "info");
    });

    el.clearFiltersBtn.addEventListener("click", function () {
      state.filters.highRated = false;
      state.filters.underTen = false;
      updateCategoryUI();
      showNextCard(true);
    });

    // Çekmece kontrolleri
    el.openDrawerBtn.addEventListener("click", openDrawer);
    el.closeDrawerBtn.addEventListener("click", closeDrawer);
    el.drawerBackdrop.addEventListener("click", closeDrawer);

    el.drawerFilterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.drawerFilter = btn.dataset.filter || "all";
        el.drawerFilterBtns.forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        renderDrawerList();
      });
    });

    el.clearAllSavedBtn.addEventListener("click", function () {
      if (!state.clearConfirmArmed) {
        state.clearConfirmArmed = true;
        el.clearAllSavedBtn.textContent = "Emin misin? Tekrar Tıkla";
        state.clearConfirmTimer = setTimeout(resetClearConfirm, 3000);
        return;
      }
      resetClearConfirm();
      state.savedItems = storage.clearSavedItems();
      renderSavedCount(false);
      renderDrawerList();
      showToast("Liste tamamen temizlendi", "info");
    });

    // Klavye kısayolları
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.drawerOpen) {
        closeDrawer();
        return;
      }

      if (state.drawerOpen || state.isLoading || state.isAnimating || !state.currentItem) {
        return;
      }

      const activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        triggerSwipeAction("pass");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        triggerSwipeAction("save");
      }
    });

    setupCardDrag();
  }

  /* ========================
     Başlatma
     ======================== */
  function init() {
    state.savedItems = storage.getSavedItems();
    renderSavedCount(false);
    bindEvents();
    loadCategory("game", false);
  }

  init();
})(window);
