// Transfer safety check — unit tests. node tests/fraud.test.mjs
import assert from 'node:assert/strict';
import { checkTransfer, messageFor, styleFor, HIGH, MEDIUM } from '../public/js/fraud.js';
import { DEMO_SHOP, DEMO_CUST, prizeFor, generateTransfers } from '../public/js/fraud_data.js';

let fail = 0;
const check = (name, fn) => { try { fn(); console.log('ok ·', name); } catch (e) { fail++; console.log('FAIL ·', name, '—', e.message); } };
const demo = Object.fromEntries([...DEMO_SHOP, ...DEMO_CUST].map((d) => [d.id, d]));
const lvl = (id) => checkTransfer(demo[id]).level;

check('regular supplier payment → no warning', () => assert.equal(lvl('d_ok'), 'none'));
check('new supplier with an old, active account → no warning', () => assert.equal(lvl('d_newsup'), 'none'));
check('unverified new account → light warning', () => assert.equal(lvl('d_courier'), 'medium'));
check('supplier «changed» its wallet number → full warning', () => assert.equal(lvl('d_switch'), 'high'));
check('«ZainCash support» on the phone → full warning', () => assert.equal(lvl('d_support'), 'high'));
check('customer pays own son → no warning', () => assert.equal(lvl('c_son'), 'none'));

check('thresholds: above 60 full, 30–60 light', () => {
  const base = { amount: 1000, note: '', recipient: {}, sender: { balance: 1e6, pastToRecipient: true, inContacts: true } };
  assert.equal(checkTransfer(base).level, 'none');
  assert.equal(checkTransfer({ ...base, recipient: { reports: 1 } }).level, 'medium'); // 50
  assert.equal(checkTransfer({ ...base, recipient: { reports: 1, accountAgeDays: 2, received30d: 4 } }).level, 'high'); // 70
  assert.ok(HIGH === 60 && MEDIUM === 30);
});
check('talking on the phone to someone in your contacts is not a signal', () => {
  const t = { amount: 1000, recipient: {}, sender: { balance: 1e6, pastToRecipient: true, inContacts: true, onCall: true } };
  assert.equal(checkTransfer(t).score, 0);
});
check('verified merchant: crowd signals are skipped', () => {
  const r = { unrelatedSenders7d: 40, senderGovs7d: 6, cashOutMinutes: 5, received30d: 200, spends30d: 0 };
  const s = { balance: 1e6, pastToRecipient: true, inContacts: true };
  assert.ok(checkTransfer({ amount: 1, recipient: r, sender: s }).score >= 60);
  assert.equal(checkTransfer({ amount: 1, recipient: { ...r, verifiedMerchant: true }, sender: s }).score, 0);
});

// fairness: age never changes the decision, only the wording
check('fairness: same prize scam, 60+ vs 30-59 → identical score and level', () => {
  const a = checkTransfer(prizeFor('60+')), b = checkTransfer(prizeFor('30-59'));
  assert.equal(a.score, b.score); assert.equal(a.level, b.level);
});
check('fairness: flipping the age band on 800 synthetic cases changes nothing', () => {
  for (const t of [...generateTransfers(11, 400), ...generateTransfers(22, 400)]) {
    const r = checkTransfer(t);
    for (const ageBand of ['18-29', '30-59', '60+', undefined]) {
      const r2 = checkTransfer({ ...t, sender: { ...t.sender, ageBand } });
      assert.equal(r2.score, r.score, t.id); assert.equal(r2.level, r.level, t.id);
    }
  }
});
check('wording: 60+ gets the simple style, shorter and without extra reasons', () => {
  const r = checkTransfer(prizeFor('60+'));
  const simple = messageFor(r, { style: styleFor({ ageBand: '60+' }) }), normal = messageFor(r, { style: styleFor({ ageBand: '30-59' }) });
  assert.equal(styleFor({ ageBand: '60+' }), 'simple'); assert.equal(styleFor({ ageBand: '30-59' }), 'normal');
  assert.ok(simple.reasons.length <= 2 && simple.advice.length <= 2);
  assert.ok(JSON.stringify(simple).length < JSON.stringify(normal).length);
  assert.ok(simple.advice.some((a) => a.includes('سد الخط')));
});
check('advice matches the signal: supplier switch → call the old number', () => {
  const m = messageFor(checkTransfer(demo.d_switch));
  assert.ok(m.advice.some((a) => a.includes('رقمه القديم')));
});
check('no message when nothing fired', () => assert.equal(messageFor(checkTransfer(demo.d_ok)), null));
check('every warning explains itself (each hit has Arabic text and a weight)', () => {
  for (const t of generateTransfers(11, 400)) for (const h of checkTransfer(t).hits) assert.ok(h.ar && h.w > 0);
});

console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
