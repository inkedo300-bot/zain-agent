// ─────────────────────────────────────────────────────────────
// Workflow diagram (swimlanes) for the middle panel.
// Lanes run right → left like the page: the merchant's phone is on the right,
// the customer's / supplier's phone on the left, and the diagram sits between them.
// ─────────────────────────────────────────────────────────────

export const LANES = {
  m: { title: 'صاحب المحل', sub: 'هاتفه', color: '#5b2a86', tint: '#f6f1fb' },
  a: { title: 'الوكيل', sub: 'Gemini + المدقق', color: '#2563a8', tint: '#f1f6fc' },
  l: { title: 'الدفتر', sub: 'يحسب ويحفظ', color: '#4a4552', tint: '#f7f6f8' },
  w: { title: 'المحفظة', sub: 'الفلوس والإشعارات', color: '#c01f68', tint: '#fdf2f7' },
  c: { title: 'الزبون', sub: 'محفظته', color: '#5b2a86', tint: '#f6f1fb' },
  s: { title: 'المورد', sub: 'محفظة أعمال', color: '#1f6e55', tint: '#eef7f3' },
  k: { title: 'وكيل الزبون', sub: 'بمحفظته', color: '#0f766e', tint: '#eefaf8' },
};
// one icon per lane (24×24 strokes, same style as the app's icon set)
const LANE_ICON = {
  m: '<path d="M4 9.5h16l-1.6-4.5H5.6z"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  a: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  l: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>',
  w: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h3"/><path d="M3 9h14a2 2 0 002-2V6"/>',
  c: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 3.8-6 7-6s6 2 7 6"/>',
  s: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  k: '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v5M9.5 10.5h5"/>',
};
export const laneIcon = (k, s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LANE_ICON[k]}</svg>`;

// d = decision. alt = the other branch, drawn dashed to the side.
// sum = the scenario in one line (shown before playing); done = what the last step achieved.
export const FLOWS = {
  debt: {
    title: 'الدين والتحصيل',
    sum: 'الدين ينسجل بجملة، والزبون يأكده ويسدده من محفظته، والدفتر يطابق الدفعة وحده.',
    done: 'الدين انسد: من جملة وحدة لحد ما الفلوس وصلت وتطابقت، بدون دفتر ورقي ولا ملاحقة.',
    lanes: ['m', 'a', 'l', 'w', 'c'],
    try: { label: 'جرّبها: ذكّر أم زينب', chat: 'ذكّر أم زينب' },
    steps: [
      { id: 'd1', lane: 'm', t: 'بعت لأم زينب|بالدين', x: 'صاحب المحل يگول أو يكتب «بعت 3 كراتين ببسي لأم زينب بالدين». ما يحتاج دفتر ورقي.', where: 'المساعد' },
      { id: 'd2', lane: 'a', t: 'Gemini يفهم القيد', x: 'Gemini يطلع منو الزبون وشنو المادة وكم. السعر ما ياخذه من Gemini، ينحسب من قائمة أسعار المحل.', where: 'خطوات الوكيل' },
      { id: 'd3', lane: 'm', t: 'بطاقة تأكيد|قبل الحفظ', x: 'تطلع بطاقة بيها كل الحقول. إذا شي ناقص أو غلط يصلحه، وما ينحفظ شي بدون موافقته.', where: 'المساعد' },
      { id: 'd4', lane: 'l', t: 'ينحفظ قيد الدين', x: 'الدين ينحفظ بالدفتر ويا رقم قيد، وكل رقم يطلع بعدين يرجع لهذا القيد.', where: 'الدفتر' },
      { id: 'd5', lane: 'c', t: 'إشعار: أكّدي الدين|أو اعترضي', x: 'الزبونة يوصلها إشعار بمحفظتها تأكد الدين أو تعترض. هيچ ماكو «ما أخذت شي» بعدين.', where: 'هاتف الزبون' },
      { id: 'd6', lane: 'm', t: 'ذكّر أم زينب', x: 'لما يتأخر الدين، صاحب المحل يگول «ذكّر أم زينب» بالصوت أو الكتابة، أو يضغط زر التذكير.', where: 'المساعد أو الديون' },
      { id: 'd7', lane: 'a', d: 1, t: 'Gemini يكتب التذكير|المبلغ مطابق؟', x: 'Gemini يكتب رسالة مؤدبة باللهجة. المدقق يتأكد إن المبلغ نفس الدين بالضبط. إذا لا، تطلع الرسالة الجاهزة.', alt: { lane: 'l', t: 'لا ← رسالة جاهزة' }, where: 'بطاقة التذكير' },
      { id: 'd8', lane: 'w', t: 'رابط دفع|بزر «ادفع»', x: 'بعد ما يضغط «أرسل»، المحفظة تضيف زر دفع بنفس مبلغ الدين.', where: 'أحداث المحفظة' },
      { id: 'd9', lane: 'c', t: 'إشعار تذكير|تدفع بضغطة', x: 'الزبونة تشوف التذكير وتدفع كامل أو جزء من رصيدها بضغطة، بدون ما تجي للمحل.', where: 'هاتف الزبون' },
      { id: 'd10', lane: 'w', t: 'الفلوس تنتقل', x: 'الدفعة تنتقل من محفظتها لمحفظة المحل فوراً.', where: 'أحداث المحفظة' },
      { id: 'd11', lane: 'l', t: 'تتطابق وحدها|ويا الدين', x: 'الدفتر يربط الدفعة بالدين المفتوح تلقائياً، فالرصيد ينزل بدون ما أحد يسجل شي.', where: 'الديون' },
      { id: 'd12', lane: 'm', t: 'إشعار: وصلك المبلغ ✓', x: 'صاحب المحل ياخذ إشعار إن الفلوس وصلت وتطابقت. الدين انسد.', where: 'هاتف صاحب المحل' },
    ],
  },
  cust: {
    title: 'طلب الزبون',
    sum: 'الزبون عنده وكيل بمحفظته: يفهم طلبه ويجهّز السلة، والمحل يجهّز الطلب، والدفتر يسجله وحده.',
    done: 'الطلب وصل من محفظة الزبون للمحل وانسجل بالدفتر، بدون مكالمة ولا ورقة ولا حساب باليد.',
    lanes: ['m', 'l', 'w', 'k', 'c'],
    try: { label: 'جرّبها: اطلب من محفظة الزبون', cust: 'اريد 2 كيلو سكر وكارتون ببسي' },
    steps: [
      { id: 'k1', lane: 'c', t: '«اريد 2 كيلو سكر|وكارتون ببسي»', x: 'الزبون يكتب طلبه بمحفظته باللهجة، مثل ما يحچي ويا صاحب المحل.', where: 'هاتف الزبون · وكيلي' },
      { id: 'k2', lane: 'k', d: 1, t: 'وكيل الزبون يفهم|المواد بقائمة المحل؟', x: 'النموذج يطلع المواد والكميات بس. ما يحسب سعر، وما يوصله رصيد الزبون ولا ديونه ولا أي شي من دفتر المحل. إذا المادة مو بالقائمة يگول، وما يخمّن.', alt: { lane: 'c', t: 'لا ← «المحل ما يبيعها»' }, where: 'خطوات الوكيل' },
      { id: 'k3', lane: 'k', t: 'يجهّز السلة|الأسعار والمجموع بالكود', x: 'السعر من قائمة المحل، والمجموع بالكود، وإذا المخزون ما يكفي تنقص الكمية ويگله ليش.', where: 'هاتف الزبون · وكيلي' },
      { id: 'k4', lane: 'c', t: 'بطاقة السلة|يعدّل ويختار الدفع', x: 'الزبون يغيّر الكميات ويختار «ادفع هسه» لو «عالدفتر». ما ينرسل شي قبل ما يضغط «أرسل».', where: 'هاتف الزبون · وكيلي' },
      { id: 'k5', lane: 'w', d: 1, t: 'يدفع هسه؟', x: 'إذا يدفع هسه: رمز PIN، والمبلغ ينحجز لحد ما المحل يجهّز الطلب. إذا عالدفتر: لازم يبقى ضمن حد الدين اللي يسمح بيه المحل.', alt: { lane: 'l', t: 'لا ← عالدفتر ضمن الحد' }, where: 'هاتف الزبون' },
      { id: 'k6', lane: 'm', t: 'إشعار: طلب جديد|جهّزته / ما متوفر', x: 'صاحب المحل يشوف الطلب بالرئيسية ويضغط «جهّزته». إذا ما متوفر والمبلغ محجوز، يرجع للزبون وحده.', where: 'هاتف صاحب المحل · الرئيسية' },
      { id: 'k7', lane: 'l', t: 'قيد بيع أو دين مؤكد|والمخزون ينقص', x: 'البيع ينسجل بالدفتر بنفس الأسعار، والدين يكون مؤكد من البداية لأن الزبون هو اللي طلبه.', where: 'الدفتر' },
      { id: 'k8', lane: 'c', t: 'إشعار: طلبك جاهز ✓', x: 'الزبون ياخذ إشعار إن طلبه جاهز، ويبين بـ«طلباتي» بمحفظته.', where: 'هاتف الزبون' },
    ],
  },
  ask: {
    title: 'سؤال بالصوت',
    sum: 'سؤال باللهجة: النموذج يختار الأداة ويصيغ الجواب، بس كل رقم يحسبه الدفتر.',
    done: 'جواب باللهجة، وكل رقم بيه محسوب بالكود ويرجع للقيود اللي انحسب منها.',
    lanes: ['m', 'a', 'l', 'w', 'c'],
    try: { label: 'جرّبها: شكد ربحت هالأسبوع؟', chat: 'شكد ربحت هالأسبوع؟' },
    steps: [
      { id: 'q1', lane: 'm', t: 'شكد ربحت|هالأسبوع؟', x: 'صاحب المحل يسأل بالصوت أو الكتابة، باللهجة. يگدر يسأل سؤالين بجملة وحدة.', where: 'المساعد' },
      { id: 'q2', lane: 'a', t: 'Gemini يحوّل|الصوت لنص', x: 'التسجيل يروح لـGemini ويا أسماء الزباين والمواد، حتى يكتبها صح.', where: 'أحداث المحفظة' },
      { id: 'q3', lane: 'a', d: 1, t: 'Gemini يختار أداة|الاختيار صالح؟', x: 'Gemini ما يحسب. يختار أداة من 12 أداة (ربح، ديون، مخزون…) والفترة. إذا اختياره غلط، يشتغل المحلل الثابت بداله.', alt: { lane: 'l', t: 'لا ← المحلل الثابت' }, where: 'خطوات الوكيل' },
      { id: 'q4', lane: 'l', t: 'الأداة تحسب الرقم|ويا أرقام القيود', x: 'الدفتر يحسب الرقم بالكود، وكل رقم وياه أرقام القيود اللي انحسب منها.', where: 'خطوات الوكيل' },
      { id: 'q5', lane: 'a', t: 'Gemini يصيغ الجواب', x: 'Gemini ياخذ الأرقام الجاهزة ويكتب جواب قصير باللهجة.', where: 'خطوات الوكيل' },
      { id: 'q6', lane: 'a', d: 1, t: 'المدقق: الأرقام صح؟|ماكو كلام مخترع؟', x: 'المدقق يرفض الجواب إذا بيه رقم مو موجود بالنتيجة، أو نسي الرقم الأساسي، أو نسب كلام لزبون. وقتها يطلع جواب ثابت.', alt: { lane: 'l', t: 'لا ← الجواب الثابت' }, where: 'خطوات الوكيل' },
      { id: 'q7', lane: 'm', t: 'الجواب: كل رقم|ينضغط ويبين قيوده', x: 'الجواب يوصل، وأي رقم بيه ينضغط ويبين القيود اللي انحسب منها.', where: 'المساعد' },
    ],
  },
  agent: {
    title: 'وكيل «ليش؟»',
    sum: 'للأسئلة المفتوحة: الوكيل يقرا الدفتر بأدوات قراءة بس ويقترح، وصاحب المحل يقرر.',
    done: 'الوكيل فكّر وقرا بس، والتنفيذ صار بموافقة صاحب المحل.',
    lanes: ['m', 'a', 'l', 'w', 'c'],
    try: { label: 'جرّبها: ليش ربحي نزل؟', chat: 'ليش ربحي نزل؟' },
    steps: [
      { id: 'g1', lane: 'm', t: 'ليش ربحي نزل؟', x: 'سؤال مفتوح يحتاج أكثر من خطوة. الأسئلة البسيطة («شكد بعت اليوم؟») تبقى بسير العمل الثابت لأنه أسرع وأضمن.', where: 'المساعد' },
      { id: 'g2', lane: 'a', d: 1, t: 'سؤال مفتوح؟', x: 'إذا السؤال فيه «ليش» أو «شلون أدبّر» يروح للوكيل. غير هيچ يمشي بسير العمل الثابت.', alt: { lane: 'l', t: 'لا ← سير العمل الثابت' }, where: 'خطوات الوكيل' },
      { id: 'g3', lane: 'a', t: 'الوكيل يختار أداة|قراءة فقط', x: 'Gemini يقرر أي أداة يحتاج. المسموح أدوات قراءة بس: مقارنة، مصاريف، دولار، توقع، ديون… وأي أداة ثانية تنمنع وتبين بالخطوات.', where: 'خطوات الوكيل' },
      { id: 'g4', lane: 'l', t: 'مقارنة آخر 7 أيام|بالسبعة اللي قبلها', x: 'الدفتر يحسب الفرق بنفسه، حتى النموذج ما يطرح ولا يحسب أي رقم.', where: 'خطوات الوكيل' },
      { id: 'g5', lane: 'a', d: 1, t: 'يحتاج أداة ثانية؟|(حد أقصى 5)', x: 'الوكيل يشوف النتيجة ويقرر: يكفي، لو يحتاج يشوف المصاريف أو أكثر المواد ربحاً. ما يتجاوز 5 خطوات أبداً.', alt: { lane: 'l', t: 'نعم ← أداة ثانية' }, where: 'خطوات الوكيل' },
      { id: 'g6', lane: 'a', d: 1, t: 'المدقق: كل رقم|رجعته أداة؟', x: 'إذا الجواب بيه رقم ما رجعته أداة، أو كلام منسوب لزبون، ينرفض ويجاوب سير العمل الثابت بداله.', alt: { lane: 'l', t: 'لا ← جواب ثابت' }, where: 'خطوات الوكيل' },
      { id: 'g7', lane: 'm', t: 'الجواب والسبب|ويا اقتراحات', x: 'التاجر يشوف السبب، وكل رقم ينضغط، وتحته أزرار مقترحة مثل «ذكّر أبو علي».', where: 'المساعد' },
      { id: 'g8', lane: 'm', t: 'يضغط «ذكّر»', x: 'الاقتراح مجرد زر. لما يضغطه يبدي سير العمل الثابت للتذكير، ويا بطاقة موافقة.', where: 'المساعد' },
      { id: 'g9', lane: 'w', t: 'بطاقة موافقة ←|إرسال', x: 'الوكيل ما يگدر يرسل أو يدفع بنفسه أبداً. كل تنفيذ يمر ببطاقة موافقة، والدفع يحتاج رمز PIN.', where: 'سجل التدقيق' },
      { id: 'g10', lane: 'c', t: 'إشعار للزبون', x: 'التذكير يوصل لمحفظة الزبون، وينسجل بسجل التدقيق ويا زر تراجع لخمس دقايق.', where: 'هاتف الزبون' },
    ],
  },
  xfer: {
    title: 'فحص التحويل',
    sum: 'قبل ما تطلع الفلوس، 22 إشارة تنفحص بالكود، وكل تنبيه يشرح سببه.',
    done: 'الفحص نبّه قبل ما تطلع الفلوس، والقرار بقى لصاحبها.',
    lanes: ['m', 'w', 'l', 'c'],
    try: { label: 'جرّبها: اتصال من «دعم زين كاش»', screen: 'send' },
    steps: [
      { id: 'x1', lane: 'm', t: 'يحوّل لرقم|وصله بمكالمة أو رسالة', x: 'صاحب المحل (أو الزبون من محفظته) يكتب رقم ومبلغ ويضغط «حوّل».', where: 'تحويل آمن' },
      { id: 'x2', lane: 'w', t: 'المحفظة تجمع|معلومات المستلم والجلسة', x: 'عمر حساب المستلم، البلاغات عليه، شگد بسرعة تطلع الفلوس منه، هل أكو مكالمة شغالة، هل انطلب رمز تحقق قبل دقائق، هل الرقم ملصوق… (بالنموذج الأولي هاي بيانات تجريبية).', where: 'فحص التحويل' },
      { id: 'x3', lane: 'l', d: 1, t: '22 إشارة بالكود|المجموع 30 أو أكثر؟', x: 'كل إشارة إلها وزن ثابت، والمجموع من 100. الكود هو اللي يقرر مو النموذج، حتى كل تنبيه نگدر نشرح سببه ونختبره. عمر المرسل مو إشارة أبداً.', alt: { lane: 'w', t: 'لا ← يكمل عادي' }, where: 'فحص التحويل' },
      { id: 'x4', lane: 'm', d: 1, t: 'فوق 60؟', x: 'من 30 لـ60: تنبيه خفيف داخل نافذة الدفع. فوق 60: شاشة توعية كاملة بالأسباب وشنو يسوي.', alt: { lane: 'w', t: 'لا ← تنبيه خفيف' }, where: 'تحويل آمن' },
      { id: 'x5', lane: 'm', t: 'شاشة توعية|ألغِ / بلّغ / أكمل', x: 'الزر الرئيسي «ألغِ التحويل». الإكمال يحتاج انتظار 10 ثواني وتأكيد إنه تأكد بنفسه، وبعدها الرمز السري. القرار الأخير إله.', where: 'تحويل آمن' },
      { id: 'x6', lane: 'c', t: 'نفس الفحص للزبون|بكلام أبسط إذا يحتاج', x: 'لكبار السن الرسالة أقصر وأوضح، بس الدرجة والقرار نفسهم بالضبط. هذا مختبر على 800 حالة.', where: 'هاتف الزبون' },
      { id: 'x7', lane: 'l', t: 'سجل التدقيق|والبلاغ يرجع للفحص', x: 'كل إلغاء أو إكمال أو بلاغ ينسجل. البلاغ يصير إشارة للتحويلات الجاية لنفس الرقم.', where: 'سجل التدقيق' },
    ],
  },
  order: {
    title: 'طلبية المورد',
    sum: 'مادة تقرب تخلص، فتنكتب طلبية للمورد، وكل الدورة (قبول، فاتورة، دفع) تصير بالمحفظة.',
    done: 'المخزون رجع يكفي، والطلبية والفاتورة والدفع كلها صارت بالمحفظة.',
    lanes: ['m', 'a', 'l', 'w', 's'],
    try: { label: 'افتح الموردين', screen: 'sup' },
    steps: [
      { id: 'o1', lane: 'l', t: 'كل بيع ينقّص|المخزون', x: 'المخزون ينحسب من الدفتر: أول المدة + الواصل − المبيوع ± الجرد.', where: 'المخزون' },
      { id: 'o2', lane: 'a', d: 1, t: 'السكر يكفي 1.5 يوم|أقل من التوصيل + 2؟', x: 'كل مادة: كم يوم يكفي = الموجود ÷ بيع آخر 7 أيام. إذا أقل من وقت توصيل المورد + يومين، تحتاج طلبية.', where: 'المخزون' },
      { id: 'o3', lane: 'a', t: 'يحسب الكمية|حسب سرعة البيع', x: 'الكمية تكفي 10 أيام حسب سرعة البيع، ناقص الموجود والطلبيات اللي بالطريق.', where: 'الموردين' },
      { id: 'o4', lane: 'a', d: 1, t: 'تلقائي مفعّل|وتحت الحد؟', x: 'صاحب المحل يحدد لكل مورد: طلب تلقائي نعم/لا وحد أعلى للمبلغ. تحت الحد تنرسل وحدها، وفوقه تنتظر موافقته.', alt: { lane: 'm', t: 'لا ← تنتظر موافقتك' }, where: 'الموردين' },
      { id: 'o5', lane: 's', t: 'إشعار: طلبية جديدة', x: 'المورد يوصله إشعار بمحفظة الأعمال بيه الطلبية كاملة.', where: 'هاتف المورد' },
      { id: 'o6', lane: 's', t: 'قبول / تعديل|الكميات / رفض', x: 'المورد يقبل، أو يعدّل إذا عنده نص الكمية، أو يرفض. صاحب المحل ياخذ إشعار بكل حالة.', where: 'هاتف المورد' },
      { id: 'o7', lane: 's', t: 'سلّم البضاعة|وأرسل فاتورة', x: 'المورد يكتب سعر كل مادة ويرسل الفاتورة.', where: 'هاتف المورد' },
      { id: 'o8', lane: 'a', d: 1, t: 'السعر أعلى من|آخر مرة؟', x: 'إذا سعر مادة زاد أكثر من 8% عن آخر مرة، يطلع تنبيه قبل الدفع.', alt: { lane: 'm', t: 'نعم ← تنبيه قبل الدفع' }, where: 'الموردين' },
      { id: 'o9', lane: 'm', t: 'يدفع الفاتورة', x: 'صاحب المحل يدفع بالمحفظة أو كاش. الدفع دائماً بيده.', where: 'الموردين' },
      { id: 'o10', lane: 'w', t: 'الدفعة للمورد', x: 'الفلوس تنتقل لمحفظة المورد.', where: 'أحداث المحفظة' },
      { id: 'o11', lane: 'l', t: 'قيد شراء|المخزون يزيد', x: 'قيد شراء ينحفظ بالكميات والأسعار، والمخزون يزيد وحده.', where: 'المخزون' },
      { id: 'o12', lane: 's', t: 'إشعار: وصلت الدفعة', x: 'المورد ياخذ إشعار إن الدفعة وصلت.', where: 'هاتف المورد' },
    ],
  },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// How long autoplay stays on a step: long enough to read its explanation.
export const stepMs = (st) => Math.min(7000, Math.max(3200, 1500 + st.x.length * 36));
// Entrance animations of the current step finish within this; after it the step is drawn still.
export const ENTER_MS = 1800;

// sel: step chosen in the walkthrough (-1 = overview); live: last step that really happened in the app.
// t: ms since sel/live changed. Animations run with a negative delay of t, so a re-render mid-way
// continues them instead of restarting. uid keeps ids apart when the panel and the zoom window both show it.
// the lane columns: background, the highlight on the current step's lane, and (with titles) the header cards
const W = 680, HEAD = 58;
function lanes(F, curLane, H, titles) {
  const LW = W / F.lanes.length, out = [];
  F.lanes.forEach((k, i) => {
    const L = LANES[k], x = W - (i + 1) * LW, on = k === curLane;
    out.push(`<rect x="${x}" y="0" width="${LW}" height="${H}" fill="${L.tint}"/>`);
    if (on) out.push(`<rect x="${x}" y="0" width="${LW}" height="${H}" fill="${L.color}" class="lanehl"/>`);
    if (i) out.push(`<line x1="${x + LW}" y1="0" x2="${x + LW}" y2="${H}" stroke="#e3dee9"/>`);
    if (titles) out.push(`<g class="fhd ${on ? 'on' : ''}" style="--lc:${L.color}"><rect x="${x + 6}" y="6" width="${LW - 12}" height="${HEAD - 12}" rx="10" class="card"/>
      <rect x="${x + 6}" y="6" width="${LW - 12}" height="4" rx="2" fill="${L.color}"/>
      <g transform="translate(${x + LW - 29},16) scale(.75)" fill="none" stroke="${L.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LANE_ICON[k]}</g>
      <text x="${x + LW / 2 - 11}" y="30" text-anchor="middle" class="lt" fill="${L.color}">${L.title}</text>
      <text x="${x + LW / 2 - 11}" y="45" text-anchor="middle" class="ls">${L.sub}</text></g>`);
  });
  return out.join('');
}
// The lane titles on their own: the page pins this row at the top of the chart box, so while the steps scroll
// under it you can still see which column each step is in. Same width and columns as flowSVG, so they line up.
export function flowHeadSVG(key, { sel = -1, t = ENTER_MS } = {}) {
  const F = FLOWS[key], curLane = sel >= 0 ? F.steps[sel].lane : null;
  return `<svg viewBox="0 0 ${W} ${HEAD}" class="flowsvg fheadsvg" style="--t:${-Math.round(Math.min(t, 60000))}ms" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${lanes(F, curLane, HEAD, true)}</svg>`;
}

// head: false draws the chart without its title row (the page shows flowHeadSVG above it instead)
export function flowSVG(key, { sel = -1, live = -1, t = ENTER_MS, uid = 'f', head = true } = {}) {
  const F = FLOWS[key], walk = sel >= 0, cur = walk ? sel : live, fresh = cur >= 0 && t < ENTER_MS;
  const LW = W / F.lanes.length, NW = LW - 18, GAP = 22;
  const cx = (lane) => W - (F.lanes.indexOf(lane) + 0.5) * LW;
  let y = HEAD + 16;
  const rows = F.steps.map((s) => { const h = s.d ? 46 : 38; const r = { ...s, y, h }; y += h + GAP; return r; });
  const H = y + 4;
  const curLane = walk ? rows[sel].lane : null;
  const arrow = (id, c) => `<marker id="${uid}${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`;
  const out = [];
  const top = head ? 0 : HEAD;
  out.push(`<svg viewBox="0 ${top} ${W} ${H - top}" class="flowsvg ${walk ? 'walk' : ''}" style="--t:${-Math.round(Math.min(t, 60000))}ms" role="img" aria-label="مخطط سير العمل: ${esc(F.title)}" xmlns="http://www.w3.org/2000/svg">
  <defs>${arrow('ah', '#8a8494')}${arrow('ahOn', '#17845a')}${arrow('ahP', '#5b2a86')}${arrow('ahT', '#cfc9d6')}</defs>`);
  // lanes: the one the current step is on lights up
  out.push(lanes(F, curLane, H, head));
  // connectors: walked ones solid, the one into the current step draws itself, the rest wait faded
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    const x1 = cx(a.lane), x2 = cx(b.lane), y1 = a.y + a.h, y2 = b.y, ym = y1 + GAP / 2;
    const d = x1 === x2 ? `M${x1},${y1} V${y2 - 1}` : `M${x1},${y1} V${ym} H${x2} V${y2 - 1}`;
    const st = walk ? (i + 1 < sel ? 'past' : i + 1 === sel ? 'past in' : 'todo') : live >= i + 1 ? 'on' : '';
    const draw = fresh && i + 1 === cur;
    const mk = st === 'on' ? 'ahOn' : st.startsWith('past') ? 'ahP' : st === 'todo' ? 'ahT' : 'ah';
    out.push(`<path id="${uid}c${i}" d="${d}" class="fcon ${st}${draw ? ' draw' : ''}"${draw ? ' pathLength="1"' : ''} marker-end="url(#${uid}${mk})"/>`);
  }
  // nodes
  rows.forEach((s, i) => {
    const x = cx(s.lane), L = LANES[s.lane];
    const state = walk ? (i === sel ? 'sel' : i < sel ? 'past' : 'todo') : i === live ? 'live' : i < live ? 'done' : '';
    const enter = fresh && i === cur;
    const [l1, l2] = s.t.split('|');
    const shape = (cls) => s.d
      ? (() => { const hw = NW / 2, c = 14; return `<polygon class="${cls}" points="${x - hw + c},${s.y} ${x + hw - c},${s.y} ${x + hw},${s.y + s.h / 2} ${x + hw - c},${s.y + s.h} ${x - hw + c},${s.y + s.h} ${x - hw},${s.y + s.h / 2}"/>`; })()
      : `<rect class="${cls}" x="${x - NW / 2}" y="${s.y}" width="${NW}" height="${s.h}" rx="10"/>`;
    // decision alt branch
    if (s.alt) {
      const ax = cx(s.alt.lane), ay = s.y + s.h / 2, aw = Math.min(NW, 118);
      const from = ax > x ? x + NW / 2 : x - NW / 2, to = ax > x ? ax - aw / 2 : ax + aw / 2;
      out.push(`<g class="falt ${state}${enter ? ' enter' : ''}"><path d="M${from},${ay} H${to}" marker-end="url(#${uid}ah)"/>
        <rect x="${ax - aw / 2}" y="${ay - 13}" width="${aw}" height="26" rx="13"/>
        <text x="${ax}" y="${ay + 4}" text-anchor="middle" class="alt">${esc(s.alt.t)}</text></g>`);
    }
    // --d waits for the travelling dot before the step pops in; --sx/--sy make the ripple grow evenly
    const style = `--lc:${L.color};--d:${enter && cur > 0 ? 560 : 0}ms;--sx:${(1 + 22 / NW).toFixed(3)};--sy:${(1 + 22 / s.h).toFixed(3)}`;
    out.push(`<g class="fnode ${state}${s.d ? ' dec' : ''}${enter ? ' enter' : ''}" style="${style}" data-p="flowStep" data-i="${i}" tabindex="0" role="button" aria-label="${i + 1}. ${esc(s.t.replace('|', ' '))}"${i === sel ? ' aria-current="step"' : ''}>`);
    if (enter) out.push(shape('fring'));
    out.push(`<g class="body">${shape('shp')}`);
    const ty = l2 ? s.y + s.h / 2 - 3 : s.y + s.h / 2 + 4;
    out.push(`<text x="${x}" y="${ty}" text-anchor="middle" class="nt">${esc(l1)}</text>`);
    if (l2) out.push(`<text x="${x}" y="${ty + 14}" text-anchor="middle" class="nt2">${esc(l2)}</text>`);
    const bx = x + NW / 2 - 2, by = s.y + 1;
    out.push(`<circle cx="${bx}" cy="${by}" r="8.5" class="bdg"/><text x="${bx}" y="${by + 3.5}" text-anchor="middle" class="bn">${i + 1}</text></g></g>`);
  });
  // the dot that carries the step from the previous lane to this one
  if (fresh && cur > 0) out.push(`<g class="ftok ${walk ? '' : 'ok'}"><circle r="10" class="halo"/><circle r="4.5" class="dot"/><animateMotion dur="0.62s" begin="${(-t / 1000).toFixed(3)}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .2 1"><mpath href="#${uid}c${cur - 1}"/></animateMotion></g>`);
  // last step of the walkthrough: a small burst
  if (fresh && walk && sel === rows.length - 1) {
    const r = rows[sel], x = cx(r.lane), y0 = r.y + r.h / 2;
    const cols = ['#5b2a86', '#e0287a', '#17845a', '#b86e00'];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2, dist = 52 + (k % 3) * 12;
      out.push(`<circle cx="${x}" cy="${y0}" r="${k % 2 ? 2.6 : 3.6}" class="fpart" style="--dx:${(Math.cos(a) * dist * 1.5).toFixed(1)}px;--dy:${(Math.sin(a) * dist * 0.7).toFixed(1)}px;--c:${cols[k % 4]}"/>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}
