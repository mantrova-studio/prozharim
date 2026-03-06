/* PROЖАРИМ — магазин (GitHub Pages front)
   Корзина: localStorage
   Доставка: Yandex Maps + GeoJSON зоны + point-in-polygon
   Отправка заказа: через API (Cloudflare Worker / Netlify Function)
*/

const ORDER_API_URL = "https://prozharim-oreder-api.polihov-alexey-a.workers.dev"; // <-- заменишь

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
  toast: document.getElementById("toast"),

  mapInfo: document.getElementById("mapInfo"),
};

const addressInput = document.getElementById("addressInput");
const suggestBox   = document.getElementById("addressSuggest");

const STORAGE_KEY = "prozharim_local_v1";

let MENU = [];
let ZONES = null;

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
    price: null,       // number | null
    available: false,  // true если в зоне
  }
};

function rub(n){ return `${Math.round(n)} ₽`; }

function showToast(msg){
  if (!els.toast) { alert(msg); return; }
  els.toast.textContent = msg;
  els.toast.classList.add("isOn");
  setTimeout(()=>els.toast.classList.remove("isOn"), 2600);
}

function loadCart(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function saveCart(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
  renderCartBadge();
}
function cartCount(){
  return Object.values(state.cart).reduce((a,b)=>a+b,0);
}
function cartSum(){
  let sum = 0;
  for (const [id, qty] of Object.entries(state.cart)){
    const p = MENU.find(x=>x.id===id);
    if (p) sum += p.price * qty;
  }
  return sum;
}

function openDrawer(){
  els.cartDrawer.classList.add("isOn");
  els.cartDrawer.setAttribute("aria-hidden","false");
  renderCart();
}
function closeDrawer(){
  els.cartDrawer.classList.remove("isOn");
  els.cartDrawer.setAttribute("aria-hidden","true");
}
function openCheckout(){
  if (cartCount() === 0){
    showToast("Корзина пуста");
    return;
  }
  els.checkoutModal.classList.add("isOn");
  els.checkoutModal.setAttribute("aria-hidden","false");
  renderTotals();
  if (state.mode === "delivery") ensureMap().catch(()=>{});
}
function closeCheckout(){
  els.checkoutModal.classList.remove("isOn");
  els.checkoutModal.setAttribute("aria-hidden","true");
}

function renderCartBadge(){
  els.cartCount.textContent = String(cartCount());
}

function addToCart(id){
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();
  showToast("Добавлено в корзину");
}
function decFromCart(id){
  if (!state.cart[id]) return;
  state.cart[id] -= 1;
  if (state.cart[id] <= 0) delete state.cart[id];
  saveCart();
  renderCart();
  renderTotals();
}
function incFromCart(id){
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();
  renderCart();
  renderTotals();
}

function renderCart(){
  els.cartItems.innerHTML = "";
  const ids = Object.keys(state.cart);
  if (ids.length === 0){
    els.cartItems.innerHTML = `<div class="muted">Корзина пуста. Выберите блюда в каталоге.</div>`;
  } else {
    for (const id of ids){
      const p = MENU.find(x=>x.id===id);
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
      row.querySelector('[data-act="dec"]').addEventListener("click", ()=>decFromCart(id));
      row.querySelector('[data-act="inc"]').addEventListener("click", ()=>incFromCart(id));

      els.cartItems.appendChild(row);
    }
  }
  els.cartSubtotal.textContent = rub(cartSum());
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function makeCard(p){
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
  el.querySelector("button").addEventListener("click", ()=>addToCart(p.id));
  return el;
}

function renderTabs(){
  const cats = ["Все", ...Array.from(new Set(MENU.map(x=>x.category)))];
  els.tabs.innerHTML = "";
  for (const c of cats){
    const b = document.createElement("button");
    b.className = "tab" + (c === state.category ? " isOn" : "");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", ()=>{
      state.category = c;
      renderTabs();
      renderProducts();
    });
    els.tabs.appendChild(b);
  }
}

function renderProducts(){
  const q = state.query.trim().toLowerCase();
  let list = MENU.slice();

  if (state.category !== "Все"){
    list = list.filter(x=>x.category === state.category);
  }
  if (q){
    list = list.filter(x =>
      (x.name||"").toLowerCase().includes(q) ||
      (x.desc||"").toLowerCase().includes(q) ||
      (x.category||"").toLowerCase().includes(q)
    );
  }

  els.products.innerHTML = "";
  for (const p of list){
    els.products.appendChild(makeCard(p));
  }
}

function renderHits(){
  const hits = MENU.filter(x=>x.hit).slice(0,4);
  if (!hits.length){
    els.hits.innerHTML = `<div class="muted">Добавь пометку "hit": true в menu.json</div>`;
    return;
  }
  els.hits.innerHTML = "";
  for (const p of hits){
    const it = document.createElement("div");
    it.className = "cartItem";
    it.innerHTML = `
      <img src="${p.img}" alt="">
      <div>
        <div class="cartItem__name">${escapeHtml(p.name)}</div>
        <div class="cartItem__meta">${rub(p.price)} • ${escapeHtml(p.weight||"")}</div>
      </div>
      <div><button class="btn btn--primary" type="button">+</button></div>
    `;
    it.querySelector("button").addEventListener("click", ()=>addToCart(p.id));
    els.hits.appendChild(it);
  }
}

/* ===== Delivery: Yandex map + zones ===== */
let ymap = null;
let ymarker = null;

function ymapsReady(){
  return new Promise((resolve, reject)=>{
    const start = Date.now();
    (function wait(){
      if (window.ymaps && typeof window.ymaps.ready === "function"){
        window.ymaps.ready(()=>resolve(window.ymaps));
        return;
      }
      if (Date.now() - start > 20000) return reject(new Error("Yandex Maps не загрузилась"));
      setTimeout(wait, 50);
    })();
  });
}

async function ensureMap(){
  if (ymap) return;
  const ymaps = await ymapsReady();
  const center = [51.7682, 55.0968]; // Оренбург (lat, lng)

  ymap = new ymaps.Map("map", {
    center,
    zoom: 12,
    controls: ["zoomControl"]
  }, {
    suppressMapOpenBlock: true
  });

  // Полигоны НЕ рисуем — клиент не видит зоны

  ymap.events.add("click", async (e)=>{
    const coords = e.get("coords"); // [lat,lng]
    await setDeliveryPoint(coords[0], coords[1], null, true);
  });
}

async function reverseGeocode(lat, lng){
  const ymaps = await ymapsReady();
  const res = await ymaps.geocode([lat, lng], { results: 1 });
  const first = res.geoObjects.get(0);
  if (!first) return "";
  return first.getAddressLine ? first.getAddressLine() : (first.get("text") || "");
}

// point-in-polygon (ray casting), GeoJSON coords: [lng,lat]
function pointInPolygon(point, vs){
  const x = point[0], y = point[1];
  let inside = false;
  for (let i=0, j=vs.length-1; i<vs.length; j=i++){
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function findZone(lat, lng){
  if (!ZONES) return null;
  const pt = [lng, lat]; // важно: GeoJSON = [lng,lat]
  for (const f of ZONES.features || []){
    if (!f.geometry) continue;

    if (f.geometry.type === "Polygon"){
      const ring = f.geometry.coordinates?.[0];
      if (ring && pointInPolygon(pt, ring)) return f;
    } else if (f.geometry.type === "MultiPolygon"){
      const polys = f.geometry.coordinates || [];
      for (const poly of polys){
        const ring = poly?.[0];
        if (ring && pointInPolygon(pt, ring)) return f;
      }
    }
  }
  return null;
}

async function setDeliveryPoint(lat, lng, addressStr, doReverse=false){
  state.delivery.lat = lat;
  state.delivery.lng = lng;

  const ymaps = await ymapsReady();

  if (!ymarker){
    ymarker = new ymaps.Placemark([lat, lng], {}, { preset: "islands#redDotIcon" });
    ymap.geoObjects.add(ymarker);
  } else {
    ymarker.geometry.setCoordinates([lat, lng]);
  }

  const zone = findZone(lat,lng);
  if (!zone){
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

  if (addressStr){
    state.delivery.address = addressStr;
    if (addressInput) addressInput.value = addressStr;
    if (els.checkoutForm?.elements?.address) els.checkoutForm.elements.address.value = addressStr;
  } else if (doReverse){
    try{
      const a = await reverseGeocode(lat, lng);
      if (a){
        state.delivery.address = a;
        if (addressInput) addressInput.value = a;
        if (els.checkoutForm?.elements?.address) els.checkoutForm.elements.address.value = a;
      }
    }catch{}
  }

  renderTotals();
}

function renderTotals(){
  const s = cartSum();
  els.sumProducts.textContent = rub(s);

  if (state.mode === "delivery"){
    if (state.delivery.available && typeof state.delivery.price === "number"){
      els.sumDelivery.textContent = rub(state.delivery.price);
      els.sumTotal.textContent = rub(s + state.delivery.price);
    } else {
      els.sumDelivery.textContent = "Недоступно";
      els.sumTotal.textContent = rub(s);
    }
  } else {
    els.sumDelivery.textContent = "0 ₽";
    els.sumTotal.textContent = rub(s);
  }
}

/* ===== Checkout mode switch ===== */
function setMode(mode){
  state.mode = mode;
  els.checkoutForm.elements.mode.value = mode;

  const btns = els.checkoutForm.querySelectorAll(".seg__btn");
  btns.forEach(b => b.classList.toggle("isOn", b.dataset.mode === mode));

  // ЖЁСТКО управляем показом (чтобы точно не было самовывоза при доставке)
  if (mode === "pickup"){
    if (els.pickupBlock){
      els.pickupBlock.hidden = false;
      els.pickupBlock.style.display = "block";
    }
    if (els.deliveryBlock){
      els.deliveryBlock.hidden = true;
      els.deliveryBlock.style.display = "none";
    }
  } else {
    if (els.pickupBlock){
      els.pickupBlock.hidden = true;
      els.pickupBlock.style.display = "none";
    }
    if (els.deliveryBlock){
      els.deliveryBlock.hidden = false;
      els.deliveryBlock.style.display = "block";
    }
    ensureMap().catch(()=>{});
  }

  renderTotals();
}

/* ===== Submit order ===== */
function buildOrderPayload(form){
  const items = Object.entries(state.cart).map(([id, qty])=>{
    const p = MENU.find(x=>x.id===id);
    return {
      id,
      name: p?.name || id,
      price: p?.price || 0,
      qty,
      sum: (p?.price || 0) * qty,
      weight: p?.weight || ""
    };
  });

  const subtotal = items.reduce((a,b)=>a+b.sum,0);

  let delivery = {
    type: "pickup",
    price: 0,
    address: form.pickupAddress?.value || "",
    zone: null,
    restaurant: form.pickupAddress?.value || ""
  };

  if (state.mode === "delivery"){
    delivery = {
      type: "delivery",
      available: !!state.delivery.available,
      price: (typeof state.delivery.price === "number") ? state.delivery.price : null,
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

  const total = subtotal + (delivery.price || 0);

  return {
    createdAt: new Date().toISOString(),
    customer: {
      name: form.name.value.trim(),
      phone: form.phone.value.trim()
    },
    payment: form.payment.value,
    comment: form.comment.value.trim(),
    items,
    subtotal,
    delivery,
    total,
    meta: {
      userAgent: navigator.userAgent
    }
  };
}

async function sendOrder(payload){
  const res = await fetch(ORDER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Order-Secret": "sytnay_dostavka_prozharim_secret_teatralnaya_liniya_kichigina_order_new"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data?.error || "Ошибка отправки");
  return data;
}

/* ===== Address suggestions + auto-commit ===== */
let suggestTimer = null;
let blurTimer = null;

function clearSuggest(){
  if (!suggestBox) return;
  suggestBox.innerHTML = "";
}

function renderSuggest(items){
  if (!suggestBox) return;
  suggestBox.innerHTML = "";
  items.forEach(({ text, coords })=>{
    const div = document.createElement("div");
    div.className = "suggest__item";
    div.textContent = text;
    div.addEventListener("click", async ()=>{
      clearSuggest();
      addressInput.value = text;
      els.checkoutForm.elements.address.value = text;

      await ensureMap().catch(()=>{});
      if (ymap) ymap.setCenter(coords, 16, { duration: 250 });
      await setDeliveryPoint(coords[0], coords[1], text, false);
    });
    suggestBox.appendChild(div);
  });
}

async function suggestAddress(q){
  const ymaps = await ymapsReady();
  const res = await ymaps.geocode(q, { results: 6 });
  const out = [];
  res.geoObjects.each(obj=>{
    const text = obj.getAddressLine ? obj.getAddressLine() : (obj.get("text") || "");
    const coords = obj.geometry.getCoordinates(); // [lat,lng]
    if (text && coords) out.push({ text, coords });
  });
  return out;
}

async function commitAddressFromInput(){
  if (state.mode !== "delivery") return;
  const q = (addressInput?.value || "").trim();
  if (q.length < 5) return;

  try{
    const ymaps = await ymapsReady();
    const res = await ymaps.geocode(q, { results: 1 });
    const first = res.geoObjects.get(0);
    if (!first){
      state.delivery.available = false;
      state.delivery.price = null;
      renderTotals();
      return;
    }

    const coords = first.geometry.getCoordinates(); // [lat,lng]
    const text = first.getAddressLine ? first.getAddressLine() : (first.get("text") || q);

    await ensureMap().catch(()=>{});
    if (ymap) ymap.setCenter(coords, 16, { duration: 250 });
    await setDeliveryPoint(coords[0], coords[1], text, false);
  }catch{
    state.delivery.available = false;
    state.delivery.price = null;
    renderTotals();
  }
}

/* ===== Success UI ===== */
function showCheckoutSuccess(){
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
async function init(){
  // UI events
  els.openCart.addEventListener("click", openDrawer);
  els.closeCart.addEventListener("click", closeDrawer);
  els.closeCart2.addEventListener("click", closeDrawer);
  els.goCheckout.addEventListener("click", ()=>{ closeDrawer(); openCheckout(); });

  els.closeCheckout.addEventListener("click", closeCheckout);
  els.closeCheckout2.addEventListener("click", closeCheckout);

  els.search.addEventListener("input", (e)=>{
    state.query = e.target.value || "";
    renderProducts();
  });

  // mode buttons
  const segBtns = els.checkoutForm.querySelectorAll(".seg__btn");
  segBtns.forEach(b => b.addEventListener("click", ()=> setMode(b.dataset.mode)));

  // подсказки адреса
  if (addressInput && suggestBox){
    addressInput.addEventListener("input", ()=>{
      const q = addressInput.value.trim();
      clearTimeout(suggestTimer);

      if (q.length < 3){
        clearSuggest();
        return;
      }

      suggestTimer = setTimeout(async ()=>{
        try{
          const items = await suggestAddress(q);
          renderSuggest(items);
        }catch{
          clearSuggest();
        }
      }, 250);
    });

    addressInput.addEventListener("blur", ()=>{
      clearTimeout(blurTimer);
      blurTimer = setTimeout(()=>commitAddressFromInput(), 220);
    });

    addressInput.addEventListener("keydown", (e)=>{
      if (e.key === "Enter"){
        e.preventDefault();
        commitAddressFromInput();
        clearSuggest();
      }
    });

    document.addEventListener("click", (e)=>{
      if (e.target === addressInput) return;
      if (suggestBox.contains(e.target)) return;
      clearSuggest();
    });
  }

  // checkout submit
  els.checkoutForm.addEventListener("submit", async (e)=>{
    e.preventDefault();

    if (cartCount() === 0) return showToast("Корзина пуста");

    if (state.mode === "delivery"){
      const addr = (els.checkoutForm.elements.address?.value || "").trim();
      if (!addr) return showToast("Укажите адрес доставки");
      if (!state.delivery.available || typeof state.delivery.price !== "number"){
        return showToast("Доставка по этому адресу недоступна");
      }
    }

    const payload = buildOrderPayload(els.checkoutForm.elements);

    const btn = document.getElementById("submitOrder");
    if (btn){
      btn.disabled = true;
      btn.textContent = "Отправляем…";
    }

    try{
      await sendOrder(payload);

      // clear cart
      state.cart = {};
      saveCart();
      renderCart();
      renderTotals();

      // success screen (в этом окне)
      showCheckoutSuccess();

    }catch(err){
      showToast(String(err.message || err));
      if (btn){
        btn.disabled = false;
        btn.textContent = "Отправить заказ";
      }
    }
  });

  // Load data
  MENU = await fetch("data/menu.json").then(r=>r.json());
  ZONES = await fetch("data/zones.geojson").then(r=>r.json()).catch(()=>null);

  renderTabs();
  renderProducts();
  renderHits();
  renderCartBadge();
  renderTotals();

  // default mode
  setMode("delivery");
}

document.addEventListener("DOMContentLoaded", init);
