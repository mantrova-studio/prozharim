export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Order-Secret"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    const secret = request.headers.get("X-Order-Secret") || "";

    let site = null;

    if (secret === env.SECRET_PROZHARIM) {
      site = "ПРОЖАРИМ";
    } else if (env.SECRET_SUSHIDZA && secret === env.SECRET_SUSHIDZA) {
      site = "СУШИДЗА";
    } else if (env.SECRET_BANZAI && secret === env.SECRET_BANZAI) {
      site = "БАНЗАЙ";
    } else {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }

    let payload;

    try {
      payload = await request.json();
    } catch {
      return json({ error: "Bad JSON" }, 400, corsHeaders);
    }

    if (!payload?.customer?.phone || !Array.isArray(payload?.items) || payload.items.length === 0) {
      return json({ error: "Invalid order payload" }, 400, corsHeaders);
    }

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      return json({ error: "BOT_TOKEN or CHAT_ID not set" }, 500, corsHeaders);
    }

    const text = formatOrder(payload, site);

    const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text,
        disable_web_page_preview: true
      })
    });

    const tgData = await tgRes.json().catch(() => ({}));

    if (!tgRes.ok || tgData.ok === false) {
      return json({ error: "Telegram error", details: tgData }, 500, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  }
};

function formatOrder(p, site) {
  const dt = new Date(p.createdAt || Date.now());
  const pad = (n) => String(n).padStart(2, "0");

  const orderNo =
    dt.getFullYear().toString() +
    pad(dt.getMonth() + 1) +
    pad(dt.getDate()) + "-" +
    pad(dt.getHours()) +
    pad(dt.getMinutes());

  const time =
    pad(dt.getDate()) + "." +
    pad(dt.getMonth() + 1) + "." +
    dt.getFullYear() + " " +
    pad(dt.getHours()) + ":" +
    pad(dt.getMinutes());

  const deliveryType = p.delivery?.type === "delivery" ? "🚚 Доставка" : "🏃 Самовывоз";
  const whenText = p.when?.type === "later" && p.when?.date ? formatWhen(p.when.date) : "Ближайшее время";

  let items = [];
  let totalLength = 0;
  let hidden = 0;

  for (let i = 0; i < (p.items || []).length; i++) {
    const it = p.items[i];
    const price = Number(it.price || 0);
    const qty = Number(it.qty || 0);
    const sum = Number(it.sum || price * qty);
    const line = `${i + 1}) ${it.name} ×${qty} — ${sum} ₽`;

    if (totalLength + line.length > 2200) {
      hidden++;
      continue;
    }

    items.push(line);
    totalLength += line.length;
  }

  if (hidden > 0) items.push(`... и ещё ${hidden} поз.`);

  const itemsText = items.join("\n");

  let addressBlock = "";

  if (p.delivery?.type === "delivery") {
    const extras = [
      p.delivery?.entrance ? `подъезд ${p.delivery.entrance}` : "",
      p.delivery?.floor ? `этаж ${p.delivery.floor}` : "",
      p.delivery?.flat ? `кв ${p.delivery.flat}` : ""
    ].filter(Boolean).join(", ");

    addressBlock =
      `📍 ${p.delivery?.address || "—"}\n` +
      (extras ? `🏠 ${extras}\n` : "") +
      (p.delivery?.restaurant ? `🏪 Ресторан: ${p.delivery.restaurant}\n` : "") +
      `🚚 Доставка: ${typeof p.delivery?.price === "number" ? p.delivery.price + " ₽" : "Недоступно"}\n`;
  } else {
    addressBlock = `🏪 Точка: ${p.delivery?.address || p.delivery?.restaurant || "—"}\n`;
  }

  const subtotal = Number(p.subtotal || 0);
  const total = Number(p.total || 0);
  const paymentText = p.paymentLabel || paymentLabel(p.payment);

  return [
    `🔥 Новый заказ в ресторан ${site}`,
    ``,
    `№ ${orderNo}`,
    `🕒 ${time}`,
    ``,
    `👤 ${p.customer?.name || "—"}`,
    `📞 ${p.customer?.phone || "—"}`,
    ``,
    `📦 Способ получения: ${deliveryType}`,
    `⏱ На когда: ${whenText}`,
    `${addressBlock}`.trimEnd(),
    ``,
    `🛒 Заказ:`,
    itemsText || "—",
    ``,
    `💰 Сумма блюд: ${subtotal} ₽`,
    `🧾 Итого: ${total} ₽`,
    `💳 Оплата: ${paymentText}`,
    ...(p.payment === "cash" && p.cashChange ? [`💵 Сдача с: ${p.cashChange} ₽`] : []),
    `🍴 Приборы: ${cutleryLabel(p.cutlery)}`,
    ``,
    `💬 Комментарий:`,
    p.comment || "—"
  ].join("\n");
}

function paymentLabel(value) {
  if (value === "cash") return "Наличными";
  if (value === "card") return "Картой при получении";
  if (value === "transfer") return "Переводом курьеру";
  return value || "—";
}

function formatWhen(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cutleryLabel(value) {
  const n = Number(value || 0);
  if (!n) return "Не нужны";
  if (n === 1) return "1 персона";
  return `${n} персоны`;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}
