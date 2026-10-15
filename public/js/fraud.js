// ─────────────────────────────────────────────────────────────
// Transfer safety check («فحص التحويل»).
// Runs before any money leaves a wallet. Pure code: no model decides here,
// so every warning can be explained signal by signal and tested.
//
// Score = sum of the weights of the signals that fire (capped at 100).
//   score > 60      → full awareness screen (cancel is the main button)
//   30 … 60         → light warning inside the payment sheet
//   below 30        → nothing shown
// The owner always has the last word; we warn, we do not block.
//
// Fairness decision: the sender's age is NEVER a signal. It is read only by
// messageFor() to make the wording shorter and plainer. tests/fraud.test.mjs
// checks that changing the age band never changes the score or the level.
// ─────────────────────────────────────────────────────────────

export const HIGH = 60;   // above this → full awareness message
export const MEDIUM = 30; // from this up to HIGH → light warning

// side: r = about the recipient (strongest), s = about this transfer / the sender's session
export const SIGNALS = [
  // recipient
  { id: 'reported',      side: 'r', w: 50, ar: 'المستلم عليه بلاغات احتيال سابقة' },
  { id: 'impersonation', side: 'r', w: 40, ar: 'اسم الحساب يشبه «زين كاش» أو «الدعم» أو «خدمة العملاء»' },
  { id: 'mule',          side: 'r', w: 40, ar: 'الفلوس تطلع من حساب المستلم خلال دقائق من وصولها' },
  { id: 'shared_device', side: 'r', w: 40, ar: 'حساب المستلم على نفس جهاز حساب مبلّغ عنه' },
  { id: 'many_senders',  side: 'r', w: 25, ar: 'يستلم من ناس كثيرين ما بينهم علاقة' },
  { id: 'new_account',   side: 'r', w: 20, ar: 'حساب المستلم جديد، انفتح قبل أيام' },
  { id: 'senior_inflow', side: 'r', w: 15, ar: 'أغلب اللي يحولون له كبار بالعمر' },
  { id: 'many_govs',     side: 'r', w: 15, ar: 'يحولون له من محافظات كثيرة وهو بمكان واحد' },
  { id: 'receive_only',  side: 'r', w: 15, ar: 'الحساب يستلم بس، ما عليه صرف طبيعي' },
  { id: 'first_receive', side: 'r', w: 10, ar: 'أول مرة يستلم تحويل' },
  // this transfer / sender session
  { id: 'payee_changed', side: 's', w: 35, ar: 'رقم محفظة المورد تغيّر قبل أيام' },
  { id: 'on_call',       side: 's', w: 30, ar: 'أكو مكالمة شغالة وإنت تحوّل' },
  { id: 'otp_recent',    side: 's', w: 20, ar: 'انطلب رمز تحقق أو تغيّر الرمز السري قبل دقائق' },
  { id: 'drain',         side: 's', w: 15, ar: 'المبلغ تقريباً كل رصيدك' },
  { id: 'note_mismatch', side: 's', w: 15, ar: 'الملاحظة تقول قريب (ماما، أخوي) والمستلم مو من جهاتك' },
  { id: 'new_device',    side: 's', w: 10, ar: 'دخلت من جهاز جديد' },
  { id: 'fast_login',    side: 's', w: 10, ar: 'التحويل صار خلال دقيقة من الدخول' },
  { id: 'pasted',        side: 's', w: 10, ar: 'الرقم ملصوق، مو من جهات اتصالك' },
  { id: 'new_payee',     side: 's', w: 10, ar: 'أول مرة تحوّل لهذا الرقم' },
  { id: 'dormant',       side: 's', w: 10, ar: 'حسابك كان واقف من مدة طويلة' },
  { id: 'new_location',  side: 's', w: 5,  ar: 'مكانك غير عن المعتاد' },
  { id: 'late_night',    side: 's', w: 5,  ar: 'الوقت متأخر بالليل' },
];
export const SIGNAL = Object.fromEntries(SIGNALS.map((s) => [s.id, s]));

const IMPERSONATION = /(زين\s*كا?ش|zain\s*cash|دعم|الدعم|خدمة\s*(ال)?عملاء|support|customer\s*service|ادارة\s*المحفظة|إدارة\s*المحفظة)/i;
const FAMILY_NOTE = /(ماما|امي|أمي|يمه|يمّه|بابا|ابوي|أبوي|اخوي|أخوي|اختي|أختي|ابني|بنتي|خالتي|عمي|عمّي)/;

// Each detector reads raw facts and returns true/false. Thresholds live here, in one place.
// t = { amount, note, recipient: {...}, sender: {...} }  (see fraud_data.js for the field list)
// A verified merchant wallet (registered business, ID checked) is SUPPOSED to receive from many
// strangers and to cash out often, so the "crowd" signals are skipped for it. Without this, the first
// version warned on most payments to ordinary shops (dev set: 48 of 56).
const crowd = (t) => !t.recipient.verifiedMerchant;
const DETECT = {
  reported:      (t) => (t.recipient.reports || 0) >= 1,
  mule:          (t) => crowd(t) && t.recipient.cashOutMinutes != null && t.recipient.cashOutMinutes <= 30,
  impersonation: (t) => IMPERSONATION.test(t.recipient.name || ''),
  shared_device: (t) => !!t.recipient.deviceLinkedToReported,
  many_senders:  (t) => crowd(t) && (t.recipient.unrelatedSenders7d || 0) >= 8,
  new_account:   (t) => t.recipient.accountAgeDays != null && t.recipient.accountAgeDays <= 7,
  senior_inflow: (t) => crowd(t) && (t.recipient.seniorSenderShare || 0) >= 0.6 && (t.recipient.unrelatedSenders7d || 0) >= 4,
  many_govs:     (t) => crowd(t) && (t.recipient.senderGovs7d || 0) >= 4,
  receive_only:  (t) => crowd(t) && (t.recipient.received30d || 0) >= 3 && (t.recipient.spends30d || 0) === 0,
  first_receive: (t) => (t.recipient.received30d || 0) === 0 && !t.sender.pastToRecipient,
  payee_changed: (t) => t.sender.payeeChangedDaysAgo != null && t.sender.payeeChangedDaysAgo <= 14,
  on_call:       (t) => !!t.sender.onCall && !t.sender.inContacts, // talking to the person you pay is normal
  otp_recent:    (t) => t.sender.otpMinutesAgo != null && t.sender.otpMinutesAgo <= 15,
  drain:         (t) => t.sender.balance > 0 && t.amount >= 0.9 * t.sender.balance,
  note_mismatch: (t) => FAMILY_NOTE.test(t.note || '') && !t.sender.inContacts && !t.sender.pastToRecipient,
  new_device:    (t) => !!t.sender.newDevice,
  fast_login:    (t) => t.sender.loginSecondsAgo != null && t.sender.loginSecondsAgo <= 60,
  pasted:        (t) => !!t.sender.pasted && !t.sender.inContacts,
  new_payee:     (t) => !t.sender.pastToRecipient,
  dormant:       (t) => (t.sender.dormantDays || 0) >= 90,
  new_location:  (t) => !!t.sender.newLocation,
  late_night:    (t) => t.sender.hour != null && (t.sender.hour >= 0 && t.sender.hour < 5),
};

export function checkTransfer(t) {
  const hits = SIGNALS.filter((s) => DETECT[s.id](t)).map((s) => ({ id: s.id, side: s.side, w: s.w, ar: s.ar }));
  const score = Math.min(100, hits.reduce((a, h) => a + h.w, 0));
  const level = score > HIGH ? 'high' : score >= MEDIUM ? 'medium' : 'none';
  return { score, level, hits: hits.sort((a, b) => b.w - a.w) };
}

// Advice keyed to the signals that fired. First match wins per line, max 3 lines.
const ADVICE = [
  [['on_call', 'impersonation'], 'زين كاش ما تتصل بيك تطلب تحويل أو رمز. سد الخط هسه.', 'سد الخط. زين كاش ما تطلب فلوس.'],
  [['payee_changed'], 'اتصل بالمورد على رقمه القديم المحفوظ عندك وتأكد منه قبل لا تحوّل.', 'اتصل بالمورد على رقمه القديم.'],
  [['otp_recent'], 'لا تنطي رمز التحقق لأي أحد، حتى لو گال إنه موظف.', 'لا تنطي الرمز لأحد.'],
  [['note_mismatch'], 'إذا واحد گال إنه قريبك برقم جديد، اتصل بيه على رقمه القديم أو شوفه بعينك.', 'اتصل بقريبك على رقمه القديم.'],
  [['reported', 'mule', 'shared_device', 'many_senders'], 'هذا الحساب عليه علامات احتيال. الأفضل تلغي وتبلّغ.', 'الأفضل تلغي.'],
  [['new_account', 'new_payee', 'pasted', 'first_receive'], 'تأكد من صاحب الرقم بنفسك، مو من رسالة أو مكالمة.', 'تأكد من صاحب الرقم.'],
];

// Plain words for the simple style, in the order a person can relate to them.
const PLAIN = [
  ['on_call', 'واحد على الخط يگلك حوّل'], ['impersonation', 'الاسم يدّعي إنه زين كاش'], ['reported', 'ناس بلّغوا على هذا الرقم'],
  ['payee_changed', 'المورد «غيّر» رقمه فجأة'], ['note_mismatch', 'يگول إنه قريبك بس رقمه غريب'], ['otp_recent', 'أحد طلب منك الرمز'],
  ['mule', 'هذا الرقم ياخذ فلوس من ناس هواية'], ['many_senders', 'هذا الرقم ياخذ فلوس من ناس هواية'], ['new_account', 'الرقم جديد'], ['drain', 'راح تحوّل كل فلوسك'],
];

// style 'simple' = shorter sentences, fewer lines, no score. Chosen from the sender's
// preference or age band; it changes the WORDING ONLY, never the decision.
export function messageFor(res, { style = 'normal' } = {}) {
  if (res.level === 'none') return null;
  const ids = new Set(res.hits.map((h) => h.id));
  const simple = style === 'simple';
  const advice = [];
  for (const [keys, normal, short] of ADVICE) if (keys.some((k) => ids.has(k))) advice.push(simple ? short : normal);
  const reasons = simple
    ? [...new Set(PLAIN.filter(([id]) => ids.has(id)).map(([, t]) => t))].slice(0, 2)
    : res.hits.slice(0, 4).map((h) => h.ar);
  if (!reasons.length) reasons.push(res.hits[0].ar);
  if (res.level === 'high') return {
    level: 'high',
    title: simple ? 'وگف. هذا التحويل بيه خطر.' : 'وگف لحظة، هذا التحويل بيه علامات احتيال',
    reasons, advice: advice.slice(0, simple ? 2 : 3),
    footer: simple ? 'إذا مو متأكد، ألغِ.' : 'الفلوس اللي تطلع لحساب محتال صعب ترجع. إذا عندك شك، ألغِ واتصل بأحد تثق بيه.',
  };
  return {
    level: 'medium',
    title: simple ? 'تأكد قبل لا تحوّل' : 'انتبه قبل لا تحوّل',
    reasons, advice: advice.slice(0, simple ? 1 : 2), footer: '',
  };
}

export const styleFor = (sender = {}) => (sender.prefersSimple || sender.ageBand === '60+' ? 'simple' : 'normal');
