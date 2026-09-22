// ─────────────────────────────────────────────────────────────
// Supplier orders, end to end:
//   stock runs low → order drafted from the ledger → (auto-sent if the merchant
//   allowed it and it is under his cap, otherwise waits for approval) → supplier
//   accepts / edits / rejects on his phone → delivers with an invoice → merchant
//   pays from the wallet → a purchase entry lands in the ledger and stock goes up.
// ─────────────────────────────────────────────────────────────
import { SUPPLIERS, SHOP, productBySku, fmt, TODAY } from './data.js';

let seq = 0;
export const STATUS_AR = { draft: 'تنتظر موافقتك', sent: 'انرسلت للمورد', accepted: 'المورد وافق', rejected: 'المورد رفض', delivered: 'انسلمت، بانتظار الدفع', paid: 'مدفوعة ✓', cancelled: 'ملغية' };
export const OPEN = ['draft', 'sent', 'accepted', 'delivered'];

export function incomingOf(orders) {
  const inc = {};
  for (const o of orders) if (o.status === 'sent' || o.status === 'accepted') for (const i of o.items) inc[i.sku] = (inc[i.sku] || 0) + (o.status === 'accepted' ? i.accepted ?? i.qty : i.qty);
  return inc;
}
export const orderValue = (o, L) => o.items.reduce((a, i) => a + (i.accepted ?? i.qty) * (i.price ?? L.currentCost(i.sku)), 0);

export function orderText(o) {
  const s = SUPPLIERS[o.sid];
  return `هلا ${s.contact}، طلبية من ${SHOP.name}:\n${o.items.map((i) => `- ${productBySku(i.sku).name}: ${i.qty}`).join('\n')}\nإذا ممكن التوصيل خلال ${s.lead === 1 ? 'يوم' : `${s.lead} أيام`}. تسلم.`;
}

export function makeOrder(sid, items, { auto = false, status = 'sent' } = {}) {
  const o = { id: 'O' + String(++seq).padStart(3, '0'), sid, items: items.map((i) => ({ sku: i.sku, qty: i.qty })), status, auto, created: TODAY, log: [] };
  o.text = orderText(o);
  return o;
}

// decide, per supplier, whether an order is needed now
export function autoCheck(L, orders, settings) {
  const actions = [];
  const r = L.reorder({ incoming: incomingOf(orders) });
  for (const sid of Object.keys(SUPPLIERS)) {
    if (orders.some((o) => o.sid === sid && OPEN.includes(o.status))) continue;
    if (!r.urgent[sid]) continue;
    const items = r.bySup[sid].filter((i) => i.order > 0).map((i) => ({ sku: i.sku, qty: i.order }));
    if (!items.length) continue;
    const value = items.reduce((a, i) => a + i.qty * L.currentCost(i.sku), 0);
    const st = settings[sid];
    const auto = st.auto && value <= st.cap;
    const o = makeOrder(sid, items, { auto, status: auto ? 'sent' : 'draft' });
    o.value = value;
    o.reason = r.bySup[sid].filter((i) => i.status === 'low' || i.status === 'out').map((i) => `${i.name} يكفي ${i.cover} يوم`).join('، ');
    o.overCap = st.auto && !auto;
    orders.push(o);
    actions.push(o);
  }
  return actions;
}

export function describe(o) { return o.items.map((i) => `${productBySku(i.sku).name} ${i.accepted ?? i.qty}`).join('، '); }
export { fmt };
