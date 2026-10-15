// ─────────────────────────────────────────────────────────────
// Synthetic transfers for the safety check. Fictional accounts and people only.
//  · DEMO: fixed scenarios for the two phones in the prototype.
//  · generateTransfers(seed, n): a labelled set for evaluation. The label comes
//    from the scenario that produced the case, not from the scorer.
//
// Fields the scorer reads (anything missing counts as "no signal"):
//  recipient: name, verifiedMerchant, reports, cashOutMinutes, deviceLinkedToReported, unrelatedSenders7d,
//             accountAgeDays, seniorSenderShare, senderGovs7d, received30d, spends30d
//  sender:    balance, pastToRecipient, inContacts, pasted, onCall, otpMinutesAgo,
//             loginSecondsAgo, newDevice, newLocation, dormantDays, hour,
//             payeeChangedDaysAgo, ageBand (used for wording only), prefersSimple
// ─────────────────────────────────────────────────────────────
import { rng } from './data.js';

const SHOP_BAL = 3200000;
const shopSender = (o = {}) => ({ balance: SHOP_BAL, pastToRecipient: false, inContacts: false, hour: 11, loginSecondsAgo: 600, ...o });

// Merchant phone: «بقالة أبو مصطفى» sends money.
export const DEMO_SHOP = [
  { id: 'd_ok', label: 'دفعة لمخازن الأمل', hint: 'مورد تتعامل وياه من شهور', amount: 450000, note: 'فاتورة طحين وبيض',
    recipient: { name: 'مخازن الأمل', phone: '07705550303', verifiedMerchant: true, accountAgeDays: 900, received30d: 64, spends30d: 41, unrelatedSenders7d: 9, senderGovs7d: 1 },
    sender: shopSender({ pastToRecipient: true, inContacts: true }) },
  { id: 'd_newsup', label: 'أول دفعة لمعمل ألبان', hint: 'مورد جديد بس حسابه قديم وشغّال', amount: 280000, note: 'لبن وقيمر',
    recipient: { name: 'معمل ألبان الجنوب', phone: '07809990011', verifiedMerchant: true, accountAgeDays: 520, received30d: 75, spends30d: 38, unrelatedSenders7d: 6, senderGovs7d: 1 },
    sender: shopSender({ pasted: true }) },
  { id: 'd_courier', label: 'عامل توصيل جديد', hint: 'گال حسابه جديد ودزّ رقمه بالواتساب', amount: 150000, note: 'أجور توصيل',
    recipient: { name: 'علي (توصيل)', phone: '07812345670', accountAgeDays: 4, received30d: 0, spends30d: 0 },
    sender: shopSender({ pasted: true, hour: 23 }) },
  { id: 'd_switch', label: 'الرافدين «غيّرت» رقم محفظتها', hint: 'وصلت رسالة: «حولوا على رقمنا الجديد»', amount: 1350000, note: 'فاتورة الرافدين',
    recipient: { name: 'الرافدين للمواد الغذائية', phone: '07836661122', accountAgeDays: 3, received30d: 0, spends30d: 0 },
    sender: shopSender({ pasted: true, payeeChangedDaysAgo: 1 }) },
  { id: 'd_support', label: 'اتصال من «دعم زين كاش»', hint: 'گالوا محفظتك راح تنقفل إذا ما تحوّل للتفعيل', amount: 3000000, note: 'تفعيل الحساب',
    recipient: { name: 'دعم زين كاش', phone: '07851230987', accountAgeDays: 2, received30d: 5, spends30d: 0, cashOutMinutes: 6, unrelatedSenders7d: 5, senderGovs7d: 4 },
    sender: shopSender({ pasted: true, onCall: true, otpMinutesAgo: 3, loginSecondsAgo: 40 }) },
];

// Customer wallet phone: the same «prize» scam sent to two customers.
// Same facts, so the same score and level; only the wording changes with the age band.
const prize = (ageBand) => ({ amount: 250000, note: 'رسوم استلام الجائزة',
  recipient: { name: 'جوائز زين كاش', phone: '07867770001', accountAgeDays: 5, received30d: 14, spends30d: 0, cashOutMinutes: 9, unrelatedSenders7d: 14, senderGovs7d: 6, seniorSenderShare: 0.7 },
  sender: { balance: 310000, pastToRecipient: false, inContacts: false, pasted: true, onCall: true, hour: 19, ageBand } });
export const DEMO_CUST = [
  { id: 'c_son', label: 'تحويل للابن', hint: 'رقمه محفوظ وتحوّل له كل شهر', amount: 100000, note: 'مصروف',
    recipient: { name: 'كرار كاظم', phone: '07722220004', accountAgeDays: 700, received30d: 12, spends30d: 30 },
    sender: { balance: 310000, pastToRecipient: true, inContacts: true, hour: 18 } },
  { id: 'c_prize', label: '«مبروك ربحت جائزة»', hint: 'متصل يگول حوّل رسوم الاستلام', ...prize() },
];
export const prizeFor = prize;

// ── labelled synthetic set ──
const NORMAL = [['known', 45], ['new_person', 18], ['shop', 20], ['new_legit_account', 7], ['family', 10]];
const SCAM = [['support', 20], ['supplier_switch', 15], ['family_emergency', 15], ['mule', 20], ['takeover', 15], ['quiet', 15]];
const pick = (r, list) => { const tot = list.reduce((a, x) => a + x[1], 0); let x = r() * tot; for (const [k, w] of list) { if ((x -= w) < 0) return k; } return list[0][0]; };
const NAMES = ['حسين', 'زهراء', 'مرتضى', 'سارة', 'عباس', 'نبأ', 'حيدر', 'رقية', 'منتظر', 'آيات'];
const SHOPS = ['أسواق النخيل', 'مكتبة الفرات', 'صيدلية الشفاء', 'مطعم الكورنيش', 'محل موبايلات', 'مخبز الحرية'];

export function generateTransfers(seed = 1, n = 400, scamShare = 0.25) {
  const r = rng(seed);
  const p = (x) => r() < x;
  const between = (a, b) => Math.round(a + r() * (b - a));
  const out = [];
  for (let i = 0; i < n; i++) {
    const scam = r() < scamShare;
    const kind = scam ? pick(r, SCAM) : pick(r, NORMAL);
    const balance = between(150, 5000) * 1000;
    const frac = p(0.06) ? 0.92 + r() * 0.08 : 0.03 + r() * 0.45;
    const sender = { balance, pastToRecipient: false, inContacts: false, hour: between(7, 22), loginSecondsAgo: between(60, 3600), ageBand: p(0.3) ? '60+' : p(0.5) ? '30-59' : '18-29' };
    // everyday noise that also shows up in honest transfers
    if (p(0.08)) sender.onCall = true;
    if (p(0.05)) sender.otpMinutesAgo = between(1, 15);
    if (p(0.06)) sender.newDevice = true;
    if (p(0.15)) sender.loginSecondsAgo = between(10, 60);
    if (p(0.07)) sender.hour = between(0, 4);
    if (p(0.10)) sender.newLocation = true;
    if (p(0.03)) sender.dormantDays = between(90, 300);
    const recipient = { name: NAMES[between(0, NAMES.length - 1)], accountAgeDays: between(60, 2000), received30d: between(2, 40), spends30d: between(2, 40), unrelatedSenders7d: between(0, 3), senderGovs7d: 1 };
    if (p(0.04)) recipient.cashOutMinutes = between(10, 30); // some honest people withdraw at an agent right away
    let note = '';
    switch (kind) {
      case 'known': Object.assign(sender, { pastToRecipient: true, inContacts: p(0.9) }); break;
      case 'new_person': Object.assign(sender, { inContacts: p(0.5) }); sender.pasted = !sender.inContacts && p(0.6); break;
      case 'shop': Object.assign(recipient, { verifiedMerchant: p(0.9), name: SHOPS[between(0, SHOPS.length - 1)], unrelatedSenders7d: between(8, 60), senderGovs7d: between(1, 3), spends30d: between(10, 60), received30d: between(30, 300) });
        Object.assign(sender, { pastToRecipient: p(0.5), pasted: p(0.4) }); break;
      case 'new_legit_account': Object.assign(recipient, { accountAgeDays: between(1, 7), received30d: 0, spends30d: 0 }); Object.assign(sender, { inContacts: true }); break;
      case 'family': note = ['ماما', 'لأخوي', 'مصروف ابني'][between(0, 2)]; Object.assign(sender, { pastToRecipient: p(0.85), inContacts: true }); break;
      case 'support':
        recipient.name = p(0.8) ? ['دعم زين كاش', 'خدمة العملاء', 'ZainCash Support', 'ادارة المحفظة'][between(0, 3)] : NAMES[between(0, 9)];
        Object.assign(sender, { onCall: p(0.85), pasted: p(0.9) }); if (p(0.6)) sender.otpMinutesAgo = between(1, 10);
        if (p(0.7)) Object.assign(recipient, { accountAgeDays: between(1, 7), received30d: between(0, 6), spends30d: 0 });
        if (p(0.3)) recipient.reports = between(1, 4); if (p(0.4)) recipient.cashOutMinutes = between(2, 25); break;
      case 'supplier_switch':
        recipient.name = 'مورد (رقم جديد)'; Object.assign(sender, { payeeChangedDaysAgo: p(0.9) ? between(0, 10) : undefined, pasted: p(0.8) });
        if (p(0.6)) Object.assign(recipient, { accountAgeDays: between(1, 7), received30d: 0, spends30d: 0 }); break;
      case 'family_emergency':
        note = p(0.8) ? ['ماما', 'أخوي ضروري', 'بابا'][between(0, 2)] : ''; Object.assign(sender, { pasted: p(0.7) });
        if (p(0.4)) sender.onCall = true; if (p(0.4)) Object.assign(recipient, { accountAgeDays: between(1, 7), received30d: 0, spends30d: 0 }); if (p(0.2)) sender.hour = between(0, 4); break;
      case 'mule':
        if (p(0.7)) recipient.cashOutMinutes = between(2, 25); if (p(0.7)) recipient.unrelatedSenders7d = between(8, 30);
        if (p(0.6)) recipient.senderGovs7d = between(4, 12); if (p(0.6)) Object.assign(recipient, { spends30d: 0, received30d: between(5, 40) });
        if (p(0.4)) recipient.seniorSenderShare = 0.6 + r() * 0.3; if (p(0.3)) recipient.reports = between(1, 3);
        if (p(0.3)) recipient.accountAgeDays = between(1, 7); if (p(0.2)) recipient.deviceLinkedToReported = true; sender.pasted = p(0.6); break;
      case 'takeover':
        if (p(0.8)) sender.newDevice = true; if (p(0.7)) sender.otpMinutesAgo = between(1, 10); if (p(0.7)) sender.loginSecondsAgo = between(5, 60);
        if (p(0.6)) sender.newLocation = true; if (p(0.2)) sender.dormantDays = between(90, 400); sender.pasted = p(0.7);
        if (p(0.5)) Object.assign(recipient, { accountAgeDays: between(1, 7), received30d: between(0, 3), spends30d: 0 }); break;
      case 'quiet': // the hard ones: look almost normal
        sender.pasted = p(0.5); if (p(0.1)) recipient.reports = 1; break;
    }
    const amount = kind === 'takeover' || kind === 'support' ? (p(0.6) ? Math.round(balance * (0.9 + r() * 0.1)) : Math.round(balance * frac)) : Math.round(balance * frac);
    out.push({ id: `T${seed}-${i}`, scam, kind, amount: Math.max(5000, Math.round(amount / 250) * 250), note, recipient, sender });
  }
  return out;
}
