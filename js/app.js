/* PROЖАРИМ — магазин (GitHub Pages front)
   Корзина: localStorage
   Доставка: Yandex Maps + GeoJSON зоны
   Отправка заказа: Cloudflare Worker
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
  toast: document.getElementById("toast"),

  phoneInput: document.getElementById("phoneInput")
};

const STORAGE_KEY = "prozharim_local_v1";

let MENU = [];
let ZONES = null;

let state = {
  cart: loadCart(),
  mode: "delivery",
  when: {
    type: "now",
    date: null
  }
};

function rub(n){ return `${Math.round(n)} ₽`; }

function showToast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add("isOn");
  setTimeout(()=>els.toast.classList.remove("isOn"),2600);
}

function loadCart(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function saveCart(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state.cart));
  renderCartBadge();
}

function cartCount(){
  return Object.values(state.cart).reduce((a,b)=>a+b,0);
}

function cartSum(){
  let sum=0;

  for(const [id,qty] of Object.entries(state.cart)){
    const p = MENU.find(x=>x.id===id);
    if(p) sum += p.price*qty;
  }

  return sum;
}

function renderCartBadge(){
  els.cartCount.textContent = cartCount();
}

/* ================= PHONE MASK ================= */

function setupPhoneMask(){

const input = els.phoneInput;

if(!input) return;

input.value="+7";

input.addEventListener("input",()=>{

let digits=input.value.replace(/\D/g,"");

if(digits.startsWith("8")) digits="7"+digits.slice(1);

if(!digits.startsWith("7")) digits="7"+digits;

digits=digits.slice(0,11);

input.value="+"+digits;

});

input.addEventListener("keydown",(e)=>{

if(input.selectionStart<2 && (e.key==="Backspace"||e.key==="Delete")){
e.preventDefault();
}

});

}

/* ================= CART ================= */

function addToCart(id){

state.cart[id]=(state.cart[id]||0)+1;

saveCart();

showToast("Добавлено в корзину");

}

function renderCart(){

els.cartItems.innerHTML="";

const ids=Object.keys(state.cart);

if(!ids.length){

els.cartItems.innerHTML=`<div class="muted">Корзина пуста</div>`;

return;

}

for(const id of ids){

const p=MENU.find(x=>x.id===id);

const qty=state.cart[id];

const row=document.createElement("div");

row.className="cartItem";

row.innerHTML=`
<img src="${p.img}">
<div>
<div class="cartItem__name">${p.name}</div>
<div class="cartItem__meta">${rub(p.price)}</div>
</div>
<div>${qty}</div>
`;

els.cartItems.appendChild(row);

}

els.cartSubtotal.textContent=rub(cartSum());

}

/* ================= WHEN ================= */

function setupWhenSelector(){

const btns=document.querySelectorAll("[data-time]");
const timeBlock=document.getElementById("timeBlock");

btns.forEach(btn=>{

btn.addEventListener("click",()=>{

btns.forEach(b=>b.classList.remove("isOn"));

btn.classList.add("isOn");

const type=btn.dataset.time;

state.when.type=type;

if(type==="later"){

timeBlock.style.display="block";

}else{

timeBlock.style.display="none";

}

});

});

}

/* ================= ORDER ================= */

function buildOrderPayload(form){

const items=Object.entries(state.cart).map(([id,qty])=>{

const p=MENU.find(x=>x.id===id);

return{

id,
name:p.name,
price:p.price,
qty,
sum:p.price*qty

};

});

const subtotal=items.reduce((a,b)=>a+b.sum,0);

return{

createdAt:new Date().toISOString(),

when:{
type:state.when.type,
date:form.whenDate?.value||null
},

customer:{
name:form.name.value.trim(),
phone:form.phone.value.trim()
},

payment:form.payment.value,

comment:form.comment.value.trim(),

items,

subtotal,

delivery:{
type:state.mode,
address:form.address?.value||form.pickupAddress?.value||""
},

total:subtotal

};

}

async function sendOrder(payload){

const res=await fetch(ORDER_API_URL,{
method:"POST",
headers:{
"Content-Type":"application/json",
"X-Order-Secret":"sytnay_dostavka_prozharim_secret_teatralnaya_liniya_kichigina_order_new"
},
body:JSON.stringify(payload)
});

const data=await res.json();

if(!res.ok) throw new Error("Ошибка отправки");

return data;

}

/* ================= INIT ================= */

async function init(){

setupPhoneMask();

setupWhenSelector();

els.checkoutForm.addEventListener("submit",async(e)=>{

e.preventDefault();

if(cartCount()===0) return showToast("Корзина пуста");

const phone=els.checkoutForm.elements.phone.value.trim();

if(!/^\+7\d{10}$/.test(phone)){
return showToast("Введите телефон +79999999999");
}

if(state.when.type==="later"){

const d=els.checkoutForm.elements.whenDate.value;

if(!d) return showToast("Укажите дату и время");

if(new Date(d)<new Date()) return showToast("Дата уже прошла");

}

const payload=buildOrderPayload(els.checkoutForm.elements);

try{

await sendOrder(payload);

state.cart={};

saveCart();

renderCart();

showToast("Заказ отправлен");

}catch(e){

showToast(e.message);

}

});

MENU = await fetch("data/menu.json").then(r=>r.json());

renderCartBadge();

}

document.addEventListener("DOMContentLoaded",init);