/* PROЖАРИМ — магазин (GitHub Pages front)
   Корзина: localStorage
   Доставка: Yandex Maps + GeoJSON зоны + point-in-polygon
   Отправка заказа: через API (Cloudflare Worker / Netlify Function)
*/

const ORDER_API_URL = "https://prozharim-oreder-api.polihov-alexey-a.workers.dev";

const els = {
  products: document.getElementById("products"),
  tabs: document.getElementById("categoryTabs"),
  search: document.getElementById("search"),
  hits: document.getElementById("hits"),

  openCart: document.getElementById("openCart"),
  cartDrawer: document.getElementById("cartDrawer"),
  closeCart: document.getElementById("closeCart"),
  closeCart2: document.getElementById("closeCart2"),
  cartItems: document.getElementById("cartItems"),
  cartCount: document.getElementById("cartCount"),
  cartSubtotal: document.getElementById("cartSubtotal"),
  goCheckout: document.getElementById("goCheckout"),

  checkoutModal: document.getElementById("checkoutModal"),
  closeCheckout: document.getElementById("closeCheckout"),
  closeCheckout2: document.getElementById("closeCheckout2"),
  checkoutForm: document.getElementById("checkoutForm"),

  pickupBlock: document.getElementById("pickupBlock"),
  deliveryBlock: document.getElementById("deliveryBlock"),

  sumProducts: document.getElementById("sumProducts"),
  sumDelivery: document.getElementById("sumDelivery"),
  sumTotal: document.getElementById("sumTotal"),
  sumCutlery: document.getElementById("sumCutlery"),
  sumNight: document.getElementById("sumNight"),
  nightMarkupRow: document.getElementById("nightMarkupRow"),

  toast: document.getElementById("toast"),
  mapInfo: document.getElementById("mapInfo"),
  phoneInput: document.getElementById("phoneInput") || document.querySelector('input[name="phone"]'),
  timeBlock: document.getElementById("timeBlock"),
  cutlerySelect: document.getElementById("cutlerySelect") || document.getElementById("cutleryInput") || document.querySelector('select[name="cutlery"]'),
  paymentSelect: document.getElementById("paymentSelect") || document.querySelector('select[name="payment"]'),
  cashChangeBlock: document.getElementById("cashChangeBlock")
};

const addressInput = document.getElementById("addressInput");
const suggestBox = document.getElementById("addressSuggest");

const STORAGE_KEY = "prozharim_local_v1";
const ORENBURG_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

let MENU = [];
let ZONES = null;
let ZONES_DAY = null;
let ZONES_NIGHT = null;

let state = {
  category: "Все",
  query: "",
  cart: loadCart(),
  mode: "delivery",
  delivery: {
    lat: null,
    lng: null,
    address: "",
    zone: null,
    restaurant: null,
    price: null,
    available: false
  },
  when: {
    type: "now",
    date: null
  },
  pricing: {
    tariff: "day",
    tariffLabel: "Дневной",
    nightMarkup: 0
  }
};

function rub(n) {
  return `${Math.round(Number(n) || 0)} ₽`;
}

function showToast(msg) {
  if (!els.toast) {
    alert(msg);
    return;
  }
  els.toast.textContent = msg;
  els.toast.classList.add("isOn");
  setTimeout(() => els.toast.classList.remove("isOn"), 2600);
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
  renderCartBadge();
}

function cartCount() {
  return Object.values(state.cart).reduce((a, b) => a + b, 0);
}

function cartSum() {
  let sum = 0;
  for (const [id, qty] of Object.entries(state.cart)) {
    const p = MENU.find(x => x.id === id);
    if (p) sum += Number(p.price || 0) * qty;
  }
  return Math.round(sum);
}

function openDrawer() {
  els.cartDrawer.classList.add("isOn");
  els.cartDrawer.setAttribute("aria-hidden", "false");
  renderCart();
}

function closeDrawer() {
  els.cartDrawer.classList.remove("isOn");
  els.cartDrawer.setAttribute("aria-hidden", "true");
}

function openCheckout() {
  if (cartCount() === 0) {
    showToast("Корзина пуста");
    return;
  }

  els.checkoutModal.classList.add("isOn");
  els.checkoutModal.setAttribute("aria-hidden", "false");
  renderTotals();

  if (state.mode === "delivery") {
    ensureMap().catch(() => {});
  }
}

function closeCheckout() {
  els.checkoutModal.classList.remove("isOn");
  els.checkoutModal.setAttribute("aria-hidden", "true");
}

function renderCartBadge() {
  els.cartCount.textContent = String(cartCount());
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function addToCart(id, sourceEl = null) {
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();

  if (sourceEl) {
    animateToCart(sourceEl);
  }

  showToast("Добавлено в корзину");
}

function decFromCart(id) {
  if (!state.cart[id]) return;
  state.cart[id] -= 1;
  if (state.cart[id] <= 0) delete state.cart[id];
  saveCart();
  renderCart();
  renderTotals();
}

function incFromCart(id) {
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();
  renderCart();
  renderTotals();
}

function renderCart() {
  els.cartItems.innerHTML = "";
  const ids = Object.keys(state.cart);

  if (ids.length === 0) {
    els.cartItems.innerHTML = `<div class="muted">Корзина пуста. Выберите блюда в каталоге.</div>`;
  } else {
    for (const id of ids) {
      const p = MENU.find(x => x.id === id);
      if (!p) continue;
      const qty = state.cart[id];

      const row = document.createElement("div");
      row.className = "cartItem";
      row.innerHTML = `
        <img src="${p.img}" alt="">
        <div>
          <div class="cartItem__name">${escapeHtml(p.name)}</div>
          <div class="cartItem__meta">${rub(p.price)} • ${escapeHtml(p.weight || "")}</div>
        </div>
        <div class="qty">
          <button type="button" data-act="dec">−</button>
          <span>${qty}</span>
          <button type="button" data-act="inc">+</button>
        </div>
      `;

      row.querySelector('[data-act="dec"]').addEventListener("click", () => decFromCart(id));
      row.querySelector('[data-act="inc"]').addEventListener("click", () => incFromCart(id));

      els.cartItems.appendChild(row);
    }
  }

  els.cartSubtotal.textContent = rub(cartSum());
}

function makeCard(p) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <img class="card__img" src="${p.img}" alt="${escapeHtml(p.name)}">
    <div class="card__body">
      <div class="card__cat">${escapeHtml(p.category)}</div>
      <div class="card__name">${escapeHtml(p.name)}</div>
      <div class="card__desc">${escapeHtml(p.desc || "")}</div>
      <div class="card__row">
        <div>
          <div class="price">${rub(p.price)}</div>
          <div class="meta">${escapeHtml(p.weight || "")}</div>
        </div>
        <button class="btn btn--primary" type="button">В корзину</button>
      </div>
    </div>
  `;

  const btn = el.querySelector("button");
  btn.addEventListener("click", () => addToCart(p.id, el.querySelector(".card__img")));

  return el;
}

function renderTabs() {
  const cats = ["Все", ...Array.from(new Set(MENU.map(x => x.category)))];
  els.tabs.innerHTML = "";

  for (const c of cats) {
    const b = document.createElement("button");
    b.className = "tab" + (c === state.category ? " isOn" : "");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", () => {
      state.category = c;
      renderTabs();
      renderProducts();
    });
    els.tabs.appendChild(b);
  }
}

function renderProducts() {
  const q = state.query.trim().toLowerCase();
  let list = MENU.slice();

  if (state.category !== "Все") {
    list = list.filter(x => x.category === state.category);
  }

  if (q) {
    list = list.filter(x =>
      (x.name || "").toLowerCase().includes(q) ||
      (x.desc || "").toLowerCase().includes(q) ||
      (x.category || "").toLowerCase().includes(q)
    );
  }

  els.products.innerHTML = "";
  for (const p of list) {
    els.products.appendChild(makeCard(p));
  }
}

function renderHits() {
  const hits = MENU.filter(x => x.hit).slice(0, 4);

  if (!hits.length) {
    els.hits.innerHTML = `<div class="muted">Добавь пометку "hit": true в menu.json</div>`;
    return;
  }

  els.hits.innerHTML = "";
  for (const p of hits) {
    const it = document.createElement("div");
    it.className = "cartItem";
    it.innerHTML = `
      <img src="${p.img}" alt="">
      <div>
        <div class="cartItem__name">${escapeHtml(p.name)}</div>
        <div class="cartItem__meta">${rub(p.price)} • ${escapeHtml(p.weight || "")}</div>
      </div>
      <div><button class="btn btn--primary" type="button">+</button></div>
    `;

    const btn = it.querySelector("button");
    btn.addEventListener("click", () => addToCart(p.id, it.querySelector("img")));

    els.hits.appendChild(it);
  }
}

/* ===== UI helpers ===== */

function animateToCart(sourceEl) {
  const cartEl = els.openCart;
  if (!sourceEl || !cartEl) return;

  const sourceRect = sourceEl.getBoundingClientRect();
  const cartRect = cartEl.getBoundingClientRect();

  const fly = document.createElement("div");
  fly.className = "flyToCart";
  fly.style.position = "fixed";
  fly.style.left = `${sourceRect.left}px`;
  fly.style.top = `${sourceRect.top}px`;
  fly.style.width = `${sourceRect.width}px`;
  fly.style.height = `${sourceRect.height}px`;
  fly.style.borderRadius = "16px";
  fly.style.backgroundImage = `url("${sourceEl.currentSrc || sourceEl.src}")`;
  fly.style.backgroundSize = "cover";
  fly.style.backgroundPosition = "center";
  fly.style.zIndex = "9999";
  fly.style.pointerEvents = "none";
  fly.style.transition = "transform .7s cubic-bezier(.2,.8,.2,1), opacity .7s ease, width .7s ease, height .7s ease";
  document.body.appendChild(fly);

  requestAnimationFrame(() => {
    const dx = cartRect.left - sourceRect.left + cartRect.width / 2 - sourceRect.width / 2;
    const dy = cartRect.top - sourceRect.top + cartRect.height / 2 - sourceRect.height / 2;
    fly.style.transform = `translate(${dx}px, ${dy}px) scale(.15)`;
    fly.style.opacity = "0.15";
    fly.style.width = "24px";
    fly.style.height = "24px";
  });

  setTimeout(() => {
    fly.remove();
  }, 750);
}


function getChangeFromValue(form = els.checkoutForm?.elements) {
  return (form?.changeFrom?.value || form?.cashChange?.value || "").trim();
}

function setupPaymentVisibility() {
  const form = els.checkoutForm?.elements;
  if (!form?.payment) return;

  const sync = () => {
    const isCash = form.payment.value === "cash";
    if (els.cashChangeBlock) {
      els.cashChangeBlock.hidden = !isCash;
      els.cashChangeBlock.style.display = isCash ? "block" : "none";
    }
  };

  form.payment.addEventListener("change", sync);
  sync();
}

/* ===== Phone mask ===== */

function setupPhoneMask() {
  const input = els.phoneInput;
  if (!input) return;

  input.setAttribute("inputmode", "numeric");
  input.setAttribute("autocomplete", "tel");
  input.setAttribute("maxlength", "12");
  if (!input.placeholder) input.placeholder = "+79999999999";

  const normalizePhone = (raw) => {
    let digits = String(raw || "").replace(/\D/g, "");

    if (digits.startsWith("8")) digits = "7" + digits.slice(1);
    if (digits.startsWith("9")) digits = "7" + digits;
    if (!digits.startsWith("7")) digits = "7" + digits;

    digits = digits.slice(0, 11);

    return "+" + digits;
  };

  const setToEnd = () => {
    try {
      const pos = input.value.length;
      input.setSelectionRange(pos, pos);
    } catch {}
  };

  const fixValue = () => {
    input.value = normalizePhone(input.value);
    if (input.value.length < 2) input.value = "+7";

    requestAnimationFrame(() => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      if (start < 2 || end < 2) setToEnd();
    });
  };

  if (!input.value || input.value === "+") {
    input.value = "+7";
  } else {
    input.value = normalizePhone(input.value);
  }

  input.addEventListener("focus", () => {
    if (!input.value || input.value.length < 2) input.value = "+7";
    setToEnd();
  });

  input.addEventListener("input", fixValue);

  input.addEventListener("click", () => {
    if ((input.selectionStart ?? 0) < 2) setToEnd();
  });

  input.addEventListener("keydown", (e) => {
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    if (
      (e.key === "Backspace" && start <= 2) ||
      (e.key === "Delete" && start < 2) ||
      (e.key === "ArrowLeft" && start <= 2) ||
      e.key === "Home"
    ) {
      e.preventDefault();
      setToEnd();
      return;
    }

    if (e.key.length === 1 && /\D/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      return;
    }

    if (start < 2 && end < 2) {
      requestAnimationFrame(setToEnd);
    }
  });

  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    input.value = normalizePhone(text);
    setToEnd();
  });

  input.addEventListener("blur", () => {
    if (!input.value || input.value === "+") input.value = "+7";
  });
}

/* ===== When selector ===== */

function setupWhenSelector() {
  const btns = document.querySelectorAll("[data-time]");
  const timeBlock = document.getElementById("timeBlock");
  const whenTypeInput = els.checkoutForm?.elements?.whenType;
  const whenDateInput = els.checkoutForm?.elements?.whenDate;

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("isOn"));
      btn.classList.add("isOn");

      const type = btn.dataset.time;
      state.when.type = type;

      if (whenTypeInput) whenTypeInput.value = type;

      if (timeBlock) {
        timeBlock.hidden = type !== "later";
        timeBlock.style.display = type === "later" ? "block" : "none";
      }

      updateZonesByEffectiveTime().then(() => renderTotals());
    });
  });

  if (whenDateInput) {
    whenDateInput.addEventListener("input", () => {
      state.when.date = whenDateInput.value || null;
      updateZonesByEffectiveTime().then(() => renderTotals());
    });

    whenDateInput.addEventListener("change", () => {
      state.when.date = whenDateInput.value || null;
      updateZonesByEffectiveTime().then(() => renderTotals());
    });
  }
}

/* ===== Cutlery ===== */

function getCutleryCount() {
  return Number(els.checkoutForm?.elements?.cutlery?.value || 1);
}

function getCutleryPaidCount() {
  return Math.max(0, getCutleryCount() - 5);
}

function getCutleryPrice() {
  return getCutleryPaidCount() * 6;
}

/* ===== Time / tariff ===== */

function toOrenburgDate(dateLike = null) {
  const base = dateLike ? new Date(dateLike) : new Date();
  const utc = base.getTime() + base.getTimezoneOffset() * 60000;
  return new Date(utc + ORENBURG_UTC_OFFSET_MS);
}

function getEffectiveOrderDate() {
  const form = els.checkoutForm?.elements;
  const whenType = form?.whenType?.value || "now";
  const whenDate = form?.whenDate?.value || "";

  if (whenType === "later" && whenDate) {
    const d = new Date(whenDate);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return new Date();
}

function getTariffInfo(date = getEffectiveOrderDate()) {
  const d = toOrenburgDate(date);
  const h = d.getHours();
  const m = d.getMinutes();
  const totalMin = h * 60 + m;

  const whenType = els.checkoutForm?.elements?.whenType?.value || "now";

  if (whenType === "later") {
    const isDay = totalMin >= (12 * 60 + 30) && totalMin <= (23 * 60 + 59);
    return {
      tariff: isDay ? "day" : "night",
      tariffLabel: isDay ? "Дневной" : "Ночной"
    };
  }

  const isDay = totalMin >= (11 * 60) && totalMin <= (22 * 60 + 59);
  return {
    tariff: isDay ? "day" : "night",
    tariffLabel: isDay ? "Дневной" : "Ночной"
  };
}

function isNightTariff(date = getEffectiveOrderDate()) {
  return getTariffInfo(date).tariff === "night";
}

function getNightMarkup() {
  const subtotal = cartSum();
  const cutleryPrice = getCutleryPrice();

  if (!isNightTariff(getEffectiveOrderDate())) return 0;

  return Math.round((subtotal + cutleryPrice) * 0.10);
}

async function updateZonesByEffectiveTime() {
  const tariffInfo = getTariffInfo(getEffectiveOrderDate());

  state.pricing.tariff = tariffInfo.tariff;
  state.pricing.tariffLabel = tariffInfo.tariffLabel;
  state.pricing.nightMarkup = getNightMarkup();

  if (tariffInfo.tariff === "night" && ZONES_NIGHT) {
    ZONES = ZONES_NIGHT;
  } else if (tariffInfo.tariff === "day" && ZONES_DAY) {
    ZONES = ZONES_DAY;
  }

  if (
    state.mode === "delivery" &&
    state.delivery.lat != null &&
    state.delivery.lng != null
  ) {
    await setDeliveryPoint(
      state.delivery.lat,
      state.delivery.lng,
      state.delivery.address || "",
      false
    );
  }
}

/* ===== Delivery: Yandex map + zones ===== */

let ymap = null;
let ymarker = null;

function ymapsReady() {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    (function wait() {
      if (window.ymaps && typeof window.ymaps.ready === "function") {
        window.ymaps.ready(() => resolve(window.ymaps));
        return;
      }

      if (Date.now() - start > 20000) {
        reject(new Error("Yandex Maps не загрузилась"));
        return;
      }

      setTimeout(wait, 50);
    })();
  });
}

async function ensureMap() {
  if (ymap) return;

  const ymaps = await ymapsReady();
  const center = [51.7682, 55.0968];

  ymap = new ymaps.Map("map", {
    center,
    zoom: 12,
    controls: ["zoomControl"]
  }, {
    suppressMapOpenBlock: true
  });

  ymap.events.add("click", async (e) => {
    const coords = e.get("coords");
    await setDeliveryPoint(coords[0], coords[1], null, true);
  });
}

async function reverseGeocode(lat, lng) {
  const ymaps = await ymapsReady();
  const res = await ymaps.geocode([lat, lng], { results: 1 });
  const first = res.geoObjects.get(0);
  if (!first) return "";
  return first.getAddressLine ? first.getAddressLine() : (first.get("text") || "");
}

function pointInPolygon(point, vs) {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];

    const intersect =
      ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

function findZone(lat, lng) {
  if (!ZONES) return null;
  const pt = [lng, lat];

  for (const f of ZONES.features || []) {
    if (!f.geometry) continue;

    if (f.geometry.type === "Polygon") {
      const ring = f.geometry.coordinates?.[0];
      if (ring && pointInPolygon(pt, ring)) return f;
    } else if (f.geometry.type === "MultiPolygon") {
      const polys = f.geometry.coordinates || [];
      for (const poly of polys) {
        const ring = poly?.[0];
        if (ring && pointInPolygon(pt, ring)) return f;
      }
    }
  }

  return null;
}

async function setDeliveryPoint(lat, lng, addressStr, doReverse = false) {
  state.delivery.lat = lat;
  state.delivery.lng = lng;

  const ymaps = await ymapsReady();

  if (!ymarker) {
    ymarker = new ymaps.Placemark([lat, lng], {}, { preset: "islands#redDotIcon" });
    ymap.geoObjects.add(ymarker);
  } else {
    ymarker.geometry.setCoordinates([lat, lng]);
  }

  const zone = findZone(lat, lng);

  if (!zone) {
    state.delivery.zone = null;
    state.delivery.restaurant = null;
    state.delivery.price = null;
    state.delivery.available = false;
  } else {
    state.delivery.zone = zone.properties?.zone ?? "—";
    state.delivery.restaurant = zone.properties?.restaurant ?? "—";
    const price = Number(zone.properties?.deliveryPrice ?? 0);
    state.delivery.price = Number.isFinite(price) ? price : 0;
    state.delivery.available = true;
  }

  if (addressStr) {
    state.delivery.address = addressStr;
    if (addressInput) addressInput.value = addressStr;
    if (els.checkoutForm?.elements?.address) {
      els.checkoutForm.elements.address.value = addressStr;
    }
  } else if (doReverse) {
    try {
      const a = await reverseGeocode(lat, lng);
      if (a) {
        state.delivery.address = a;
        if (addressInput) addressInput.value = a;
        if (els.checkoutForm?.elements?.address) {
          els.checkoutForm.elements.address.value = a;
        }
      }
    } catch {}
  }

  renderTotals();
}

/* ===== Totals ===== */

function renderTotals() {
  const subtotal = cartSum();
  const cutleryPrice = getCutleryPrice();
  const nightMarkup = getNightMarkup();

  state.pricing.tariff = getTariffInfo(getEffectiveOrderDate()).tariff;
  state.pricing.tariffLabel = getTariffInfo(getEffectiveOrderDate()).tariffLabel;
  state.pricing.nightMarkup = nightMarkup;

  if (els.sumProducts) {
    els.sumProducts.textContent = rub(subtotal);
  }

  if (els.sumCutlery) {
    els.sumCutlery.textContent = rub(cutleryPrice);
  }

  if (els.nightMarkupRow && els.sumNight) {
    if (nightMarkup > 0) {
      els.nightMarkupRow.hidden = false;
      els.nightMarkupRow.style.display = "flex";
      els.sumNight.textContent = rub(nightMarkup);
    } else {
      els.nightMarkupRow.hidden = true;
      els.nightMarkupRow.style.display = "none";
      els.sumNight.textContent = "0 ₽";
    }
  }

  if (state.mode === "delivery") {
    if (state.delivery.available && typeof state.delivery.price === "number") {
      if (els.sumDelivery) els.sumDelivery.textContent = rub(state.delivery.price);
      if (els.sumTotal) {
        els.sumTotal.textContent = rub(
          subtotal + cutleryPrice + nightMarkup + state.delivery.price
        );
      }
    } else {
      if (els.sumDelivery) els.sumDelivery.textContent = "Недоступно";
      if (els.sumTotal) {
        els.sumTotal.textContent = rub(subtotal + cutleryPrice + nightMarkup);
      }
    }
  } else {
    if (els.sumDelivery) els.sumDelivery.textContent = "0 ₽";
    if (els.sumTotal) {
      els.sumTotal.textContent = rub(subtotal + cutleryPrice + nightMarkup);
    }
  }
}

/* ===== Checkout mode ===== */

function setMode(mode) {
  state.mode = mode;
  els.checkoutForm.elements.mode.value = mode;

  const btns = els.checkoutForm.querySelectorAll(".seg__btn[data-mode]");
  btns.forEach(b => b.classList.toggle("isOn", b.dataset.mode === mode));

  if (mode === "pickup") {
    if (els.pickupBlock) {
      els.pickupBlock.hidden = false;
      els.pickupBlock.style.display = "block";
    }
    if (els.deliveryBlock) {
      els.deliveryBlock.hidden = true;
      els.deliveryBlock.style.display = "none";
    }
  } else {
    if (els.pickupBlock) {
      els.pickupBlock.hidden = true;
      els.pickupBlock.style.display = "none";
    }
    if (els.deliveryBlock) {
      els.deliveryBlock.hidden = false;
      els.deliveryBlock.style.display = "block";
    }
    ensureMap().catch(() => {});
  }

  renderTotals();
}

/* ===== Payload ===== */

function buildOrderPayload(form) {
  const items = Object.entries(state.cart).map(([id, qty]) => {
    const p = MENU.find(x => x.id === id);
    return {
      id,
      name: p?.name || id,
      price: Number(p?.price || 0),
      qty,
      sum: Number(p?.price || 0) * qty,
      weight: p?.weight || ""
    };
  });

  const subtotal = items.reduce((a, b) => a + b.sum, 0);

  let delivery = {
    type: "pickup",
    price: 0,
    address: form.pickupAddress?.value || "",
    zone: null,
    restaurant: form.pickupAddress?.value || ""
  };

  if (state.mode === "delivery") {
    delivery = {
      type: "delivery",
      available: !!state.delivery.available,
      price: typeof state.delivery.price === "number" ? state.delivery.price : null,
      address: (form.address?.value?.trim() || state.delivery.address || "").trim(),
      entrance: form.entrance?.value?.trim() || "",
      floor: form.floor?.value?.trim() || "",
      flat: form.flat?.value?.trim() || "",
      lat: state.delivery.lat,
      lng: state.delivery.lng,
      zone: state.delivery.zone,
      restaurant: state.delivery.restaurant
    };
  }

  const paymentMap = {
    cash: "Наличными",
    card: "Картой при получении",
    transfer: "Переводом курьеру"
  };

  const cutleryCount = getCutleryCount();
  const cutleryPaid = getCutleryPaidCount();
  const cutleryPrice = getCutleryPrice();
  const nightMarkup = getNightMarkup();

  const total = subtotal + cutleryPrice + nightMarkup + (delivery.price || 0);

  return {
    createdAt: new Date().toISOString(),
    when: {
      type: form.whenType?.value || "now",
      date: form.whenDate?.value || null
    },
    customer: {
      name: form.name.value.trim(),
      phone: form.phone.value.trim()
    },
    payment: form.payment.value,
    paymentLabel: paymentMap[form.payment.value] || form.payment.value,
    changeFrom: getChangeFromValue(form),
    comment: form.comment.value.trim(),
    items,
    subtotal,
    cutlery: {
      count: cutleryCount,
      paidCount: cutleryPaid,
      price: cutleryPrice
    },
    pricing: {
      tariff: getTariffInfo(getEffectiveOrderDate()).tariff,
      tariffLabel: getTariffInfo(getEffectiveOrderDate()).tariffLabel,
      nightMarkup
    },
    delivery,
    total,
    meta: {
      userAgent: navigator.userAgent
    }
  };
}

/* ===== Send order ===== */

async function sendOrder(payload) {
  const res = await fetch(ORDER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Order-Secret": "sytnay_dostavka_prozharim_secret_teatralnaya_liniya_kichigina_order_new"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data?.details?.description ||
      data?.details?.error_code ||
      data?.error ||
      "Ошибка отправки"
    );
  }

  return data;
}

/* ===== Suggestions ===== */

let suggestTimer = null;
let blurTimer = null;

function clearSuggest() {
  if (!suggestBox) return;
  suggestBox.innerHTML = "";
}

function renderSuggest(items) {
  if (!suggestBox) return;
  suggestBox.innerHTML = "";

  items.forEach(({ text, coords }) => {
    const div = document.createElement("div");
    div.className = "suggest__item";
    div.textContent = text;

    div.addEventListener("click", async () => {
      clearSuggest();

      addressInput.value = text;
      els.checkoutForm.elements.address.value = text;

      await ensureMap().catch(() => {});
      if (ymap) ymap.setCenter(coords, 16, { duration: 250 });
      await setDeliveryPoint(coords[0], coords[1], text, false);
    });

    suggestBox.appendChild(div);
  });
}

async function suggestAddress(q) {
  const ymaps = await ymapsReady();
  const res = await ymaps.geocode(q, { results: 6 });
  const out = [];

  res.geoObjects.each(obj => {
    const text = obj.getAddressLine ? obj.getAddressLine() : (obj.get("text") || "");
    const coords = obj.geometry.getCoordinates();
    if (text && coords) out.push({ text, coords });
  });

  return out;
}

async function commitAddressFromInput() {
  if (state.mode !== "delivery") return;

  const q = (addressInput?.value || "").trim();
  if (q.length < 5) return;

  try {
    const ymaps = await ymapsReady();
    const res = await ymaps.geocode(q, { results: 1 });
    const first = res.geoObjects.get(0);

    if (!first) {
      state.delivery.available = false;
      state.delivery.price = null;
      renderTotals();
      return;
    }

    const coords = first.geometry.getCoordinates();
    const text = first.getAddressLine ? first.getAddressLine() : (first.get("text") || q);

    await ensureMap().catch(() => {});
    if (ymap) ymap.setCenter(coords, 16, { duration: 250 });
    await setDeliveryPoint(coords[0], coords[1], text, false);
  } catch {
    state.delivery.available = false;
    state.delivery.price = null;
    renderTotals();
  }
}

/* ===== Success ===== */

function showCheckoutSuccess() {
  els.checkoutForm.innerHTML = `
    <div style="display:grid; place-items:center; gap:14px; padding:26px 10px; text-align:center;">
      <div style="
        width:72px;height:72px;border-radius:999px;
        display:grid;place-items:center;
        border:1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.04);
        box-shadow: 0 18px 55px rgba(0,0,0,.45);
        font-size:34px;
      ">✅</div>
      <div style="font-weight:950; font-size:18px;">Заказ оформлен!</div>
      <div style="color:rgba(243,243,244,.72); max-width:52ch;">
        Ожидайте звонка от оператора для подтверждения заказа.
      </div>
      <button class="btn btn--primary w100" type="button" id="closeSuccessBtn">Закрыть</button>
    </div>
  `;

  const btn = document.getElementById("closeSuccessBtn");
  if (btn) btn.addEventListener("click", closeCheckout);
}

/* ===== Init ===== */

async function init() {
  els.openCart.addEventListener("click", openDrawer);
  els.closeCart.addEventListener("click", closeDrawer);
  els.closeCart2.addEventListener("click", closeDrawer);
  els.goCheckout.addEventListener("click", () => {
    closeDrawer();
    openCheckout();
  });

  els.closeCheckout.addEventListener("click", closeCheckout);
  els.closeCheckout2.addEventListener("click", closeCheckout);

  els.search.addEventListener("input", (e) => {
    state.query = e.target.value || "";
    renderProducts();
  });

  setupPhoneMask();
  setupWhenSelector();
  setupPaymentVisibility();

  const segBtns = els.checkoutForm.querySelectorAll(".seg__btn[data-mode]");
  segBtns.forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  if (els.cutlerySelect) {
    els.cutlerySelect.addEventListener("change", renderTotals);
  }

  if (addressInput && suggestBox) {
    addressInput.addEventListener("input", () => {
      const q = addressInput.value.trim();
      clearTimeout(suggestTimer);

      if (q.length < 3) {
        clearSuggest();
        return;
      }

      suggestTimer = setTimeout(async () => {
        try {
          const items = await suggestAddress(q);
          renderSuggest(items);
        } catch {
          clearSuggest();
        }
      }, 250);
    });

    addressInput.addEventListener("blur", () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => commitAddressFromInput(), 220);
    });

    addressInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitAddressFromInput();
        clearSuggest();
      }
    });

    document.addEventListener("click", (e) => {
      if (e.target === addressInput) return;
      if (suggestBox.contains(e.target)) return;
      clearSuggest();
    });
  }

  els.checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (cartCount() === 0) return showToast("Корзина пуста");

    const phone = (els.checkoutForm.elements.phone?.value || "").trim();
    if (!/^\+7\d{10}$/.test(phone)) {
      return showToast("Введите телефон в формате +79999999999");
    }

    const whenType = els.checkoutForm.elements.whenType?.value || "now";
    const whenDate = els.checkoutForm.elements.whenDate?.value || "";

    if (whenType === "later") {
      if (!whenDate) return showToast("Укажите дату и время");
      const selected = new Date(whenDate);
      if (Number.isNaN(selected.getTime())) return showToast("Некорректная дата и время");
      if (selected.getTime() < Date.now()) return showToast("Укажите будущую дату и время");
    }

    if (els.checkoutForm.elements.payment?.value === "cash") {
      const changeFrom = getChangeFromValue(els.checkoutForm.elements);
      if (changeFrom) {
        const changeNumber = Number(changeFrom.replace(/[^\d.]/g, ""));
        const currentTotal = parseInt((els.sumTotal?.textContent || "0").replace(/[^\d]/g, ""), 10) || 0;
        if (!Number.isFinite(changeNumber) || changeNumber < currentTotal) {
          return showToast("Сдача должна быть не меньше суммы заказа");
        }
      }
    }

    if (state.mode === "delivery") {
      const addr = (els.checkoutForm.elements.address?.value || "").trim();
      if (!addr) return showToast("Укажите адрес доставки");
      if (!state.delivery.available || typeof state.delivery.price !== "number") {
        return showToast("Доставка по этому адресу недоступна");
      }
    }

    const payload = buildOrderPayload(els.checkoutForm.elements);

    const btn = document.getElementById("submitOrder");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Отправляем…";
    }

    try {
      await sendOrder(payload);

      state.cart = {};
      saveCart();
      renderCart();
      renderTotals();

      showCheckoutSuccess();
    } catch (err) {
      showToast(String(err.message || err));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Отправить заказ";
      }
    }
  });

  MENU = await fetch("data/menu.json").then(r => r.json());
  ZONES_DAY = await fetch("data/zones_day.geojson").then(r => r.json()).catch(() => null);
  ZONES_NIGHT = await fetch("data/zones_night.geojson").then(r => r.json()).catch(() => null);
  ZONES = ZONES_DAY || ZONES_NIGHT || await fetch("data/zones.geojson").then(r => r.json()).catch(() => null);

  await updateZonesByEffectiveTime();

  renderTabs();
  renderProducts();
  renderHits();
  renderCartBadge();
  renderTotals();

  setMode("delivery");
}

document.addEventListener("DOMContentLoaded", init);
