export function setBanner(type, title, message) {
  const el = document.getElementById('banner');
  if (!title && !message) {
    el.className = 'hidden mb-4';
    el.innerHTML = '';
    return;
  }

  const styles = {
    info: 'bg-sky-50 border-sky-200 text-sky-800',
    warn: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-rose-50 border-rose-200 text-rose-800',
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800'
  };

  el.className = `mb-4 border rounded-2xl p-4 ${styles[type] || styles.info}`;
  el.innerHTML = `
    <div class="font-extrabold mb-1">${escapeHtml(title || '')}</div>
    <div class="text-sm leading-6">${escapeHtml(message || '')}</div>
  `;
}

export function badgeTraffic(traffic) {
  if (traffic === 'GREEN') return '<span class="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">🟢 آمن</span>';
  if (traffic === 'YELLOW') return '<span class="px-2 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold">🟡 بحذر</span>';
  return '<span class="px-2 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-extrabold">🔴 خطر</span>';
}

export function fmtNumber(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('ar-SA', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('ar-SA');
}

export function scorePill(score) {
  const s = Number(score);
  let cls = 'bg-rose-100 text-rose-800';
  if (s >= 80) cls = 'bg-emerald-100 text-emerald-800';
  else if (s >= 50) cls = 'bg-amber-100 text-amber-900';
  return `${renderMarketRegimeBanner(data)}<span class="px-3 py-1 rounded-full ${cls} text-sm font-extrabold">درجة الثقة: ${fmtInt(s)} / 100</span>`;
}

function decisionCard(data) {
  const d = data?.decision;
  if (!d || !d.tag) return '';
  const tag = String(d.tag).toUpperCase();
  const conf = String(d.confidence || '').toUpperCase();
  const map = {
    CONSIDER: { cls: 'bg-sky-50 border-sky-200 text-sky-900', label: '🔵 فرصة دخول محتملة' },
    WATCH: { cls: 'bg-amber-50 border-amber-200 text-amber-900', label: '🟡 تحت المتابعة' },
    REDUCE_RISK: { cls: 'bg-orange-50 border-orange-200 text-orange-900', label: '🟠 خفّض المخاطر / راجع المركز' },
    AVOID: { cls: 'bg-rose-50 border-rose-200 text-rose-900', label: '🔴 تجنّب' },
  };
  const m = map[tag] || { cls: 'bg-slate-50 border-slate-200 text-slate-900', label: '—' };
  const why = Array.isArray(d.why) ? d.why.slice(0, 4) : [];
  const confTxt = conf === 'HIGH' ? 'عالية' : conf === 'MED' ? 'متوسطة' : 'منخفضة';
  return `
    <div class="border rounded-2xl px-3 py-2 ${m.cls}">
      <div class="flex items-center justify-between gap-2">
        <div class="font-extrabold text-sm">مساعد القرار: ${m.label}</div>
        <div class="text-xs font-extrabold">${escapeHtml(confTxt)}</div>
      </div>
      ${why.length ? `<ul class="mt-1 text-xs leading-6 list-disc pr-5">${why.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
    </div>
  `;
}

function finalDecisionCard(data) {
  const fd = data?.finalDecision;
  if (!fd || !fd.label) return '';
  const code = String(fd.code || '').toUpperCase();
  const conf = String(fd.confidence || '').toUpperCase();
  const confTxt = conf === 'HIGH' ? 'عالية' : conf === 'MED' ? 'متوسطة' : 'منخفضة';

  let cls = 'bg-slate-50 border-slate-200 text-slate-900';
  if (code.includes('ENTER') || code.includes('ADD') || code.includes('HOLD')) cls = 'bg-emerald-50 border-emerald-200 text-emerald-900';
  if (code.includes('AVOID')) cls = 'bg-rose-50 border-rose-200 text-rose-900';
  if (code.includes('EXIT') || code.includes('REDUCE')) cls = 'bg-orange-50 border-orange-200 text-orange-900';

  const why = Array.isArray(fd.why) ? fd.why.slice(0, 6) : [];
  const blockers = Array.isArray(fd.blockers) ? fd.blockers.slice(0, 4) : [];
  const controls = Array.isArray(fd.riskControls) ? fd.riskControls.slice(0, 4) : [];
  const ov = ownerDecisionOverride(data, fd);
  const action = String(ov.action || fd.action || "").toUpperCase();
  const actionLabel = ov.label ? ov.label : (action === "ADD" || action === "ADD_STRONG" ? "تعزيز" : action === "HOLD_STRONG" ? "احتفاظ قوي" : action === "HOLD_CAUTION" ? "احتفاظ بحذر" : action === "TRIM" ? "تخفيف" : action === "EXIT" ? "خروج" : "");
  return `
    <div class="border rounded-2xl px-3 py-2 ${cls}">
      <div class="flex items-center justify-between gap-2">
        <div class="font-extrabold text-sm">القرار النهائي: ${escapeHtml(fd.label)}${actionLabel ? ` <span class="text-xs font-bold opacity-80">(${escapeHtml(actionLabel)})</span>` : ``}</div>
        <div class="text-xs font-extrabold">ثقة: ${escapeHtml(confTxt)}</div>
      </div>
      ${why.length ? `<ul class="mt-1 text-xs leading-6 list-disc pr-5">${why.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}
      ${blockers.length ? `<div class="mt-2 text-xs"><div class="font-extrabold mb-1">سبب/أسباب منع التعزيز</div><ul class="leading-6 list-disc pr-5">${blockers.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
      ${controls.length ? `<div class="mt-2 text-xs"><div class="font-extrabold mb-1">ضبط المخاطر (اقتراحات)</div><ul class="leading-6 list-disc pr-5">${controls.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
    </div>
  `;
}

function positionToggle(data) {
  const owned = !!data?.position?.owned;
  const exposure = String(data?.position?.exposure || 'MED').toUpperCase();
  return `
    <div class="border border-slate-200 bg-white rounded-2xl px-3 py-2">
      <div class="text-xs font-extrabold text-slate-700 mb-1">وضعك</div>
      <div class="flex items-center gap-4 text-sm">
        <label class="flex items-center gap-2 cursor-pointer"><input id="ms_pos_notowned" type="radio" name="ms_pos" value="0" ${owned ? '' : 'checked'} /> لا أملكه</label>
        <label class="flex items-center gap-2 cursor-pointer"><input id="ms_pos_owned" type="radio" name="ms_pos" value="1" ${owned ? 'checked' : ''} /> أملكه</label>
      </div>
      <div class="mt-2">
        <div class="text-[11px] font-extrabold text-slate-700 mb-1">نسبة التعرض (للمالك)</div>
        <select id="ms_exposure" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" ${owned ? '' : 'disabled'}>
          <option value="LOW" ${exposure === 'LOW' ? 'selected' : ''}>خفيف</option>
          <option value="MED" ${exposure === 'MED' ? 'selected' : ''}>متوسط</option>
          <option value="HIGH" ${exposure === 'HIGH' ? 'selected' : ''}>عالي</option>
        </select>
        <div class="text-[11px] text-slate-500 mt-1">تؤثر على قرار: تخفيف (TRIM) مقابل خروج (EXIT) عند ارتفاع المخاطر.</div>
      </div>
      <div class="text-[11px] text-slate-500 mt-1">سيتم ضبط القرار النهائي حسب كونك مالكاً للسهم أو لا.</div>
    </div>
  `;
}



function opportunityCard(data) {
  const o = data?.opportunity;
  if (!o || typeof o.score !== 'number') return '';
  const tag = String(o.tag || '').toUpperCase();
  const map = {
    HIGH_OPPORTUNITY: { cls: 'bg-indigo-50 border-indigo-200 text-indigo-900', label: '⭐ رادار أفضلية الدخول' },
    MID_OPPORTUNITY: { cls: 'bg-slate-50 border-slate-200 text-slate-800', label: '✨ رادار أفضلية الدخول' },
    LOW_OPPORTUNITY: { cls: 'bg-slate-50 border-slate-200 text-slate-800', label: '✨ رادار أفضلية الدخول' },
  };
  const m = map[tag] || map.MID_OPPORTUNITY;
  const why = Array.isArray(o.why) ? o.why : [];
  return `
    <div class="border rounded-2xl px-3 py-2 ${m.cls}">
      <div class="flex items-center justify-between gap-2">
        <div class="font-extrabold text-sm">${m.label}</div>
        <div class="text-xs font-extrabold">Score: ${fmtInt(o.score)}</div>
      </div>
      ${why.length ? `<ul class="mt-1 text-xs leading-6 list-disc pr-5">${why.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
    </div>
  `;
}

function exitCard(data) {
  const x = data?.exit;
  if (!x || typeof x.score !== 'number') return '';
  const tag = String(x.tag || '').toUpperCase();
  const map = {
    HIGH_EXIT_RISK: { cls: 'bg-rose-50 border-rose-200 text-rose-900', label: '⚠️ رادار الخروج/التخفيف' },
    MID_EXIT_RISK: { cls: 'bg-amber-50 border-amber-200 text-amber-900', label: '🟠 رادار الخروج/التخفيف' },
    LOW_EXIT_RISK: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-900', label: '🟢 رادار الخروج/التخفيف' },
  };
  const m = map[tag] || map.MID_EXIT_RISK;
  const why = Array.isArray(x.why) ? x.why : [];
  return `
    <div class="border rounded-2xl px-3 py-2 ${m.cls}">
      <div class="flex items-center justify-between gap-2">
        <div class="font-extrabold text-sm">${m.label}</div>
        <div class="text-xs font-extrabold">Score: ${fmtInt(x.score)}</div>
      </div>
      ${why.length ? `<ul class="mt-1 text-xs leading-6 list-disc pr-5">${why.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul>` : ''}
    </div>
  `;
}

export function renderDashboard(container, rows) {
  container.innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-4">
      <div>
        <div class="text-xl font-extrabold">لوحة المتابعة</div>
        <div class="text-sm text-slate-500">رادار مزدوج: كشف المخاطر + إبراز أفضلية الدخول/الخروج مع أسباب</div>
      </div>
      <a href="#/add" class="px-3 py-2 rounded-xl bg-sky-600 text-white font-extrabold text-sm">+ إضافة سهم</a>
    </div>

    <div id="ms_sector_heatmap" class="mb-4"></div>

    <div class="bg-white border border-slate-200 rounded-2xl p-3 mb-4">
      <div class="border border-slate-200 rounded-2xl p-3 bg-slate-50 mb-3">
        <div class="font-extrabold text-sm mb-2">تحليل فوري (US + SA)</div>
        <div class="grid md:grid-cols-12 gap-2 items-end">
          <div class="md:col-span-6">
            <label class="text-xs font-bold text-slate-600">رمز/رقم السهم</label>
            <input id="ms_scan_symbol" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white" placeholder="مثال: AAPL أو 2222 أو 2222.SR" />
            <div class="text-[11px] text-slate-500 mt-1">يتم كشف السوق تلقائياً: الأرقام = السعودية، الحروف = أمريكا.</div>
          </div>
          <div class="md:col-span-3">
            <button id="ms_scan_btn" class="w-full px-3 py-2 rounded-xl bg-emerald-600 text-white font-extrabold">حلّل الآن</button>
          </div>
          <div class="md:col-span-3">
            <button id="ms_scan_add" class="w-full px-3 py-2 rounded-xl bg-sky-600 text-white font-extrabold">+ أضف للمراقبة</button>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mb-3">
        <button class="ms_mode_pill px-3 py-2 rounded-xl border text-sm font-extrabold bg-slate-50" data-mode="ALL">الكل</button>
        <button class="ms_mode_pill px-3 py-2 rounded-xl border text-sm font-extrabold bg-white" data-mode="OPPORTUNITY">⭐ أفضلية دخول</button>
        <button class="ms_mode_pill px-3 py-2 rounded-xl border text-sm font-extrabold bg-white" data-mode="EXIT">⚠️ مرشح خروج/تخفيف</button>
        <button class="ms_mode_pill px-3 py-2 rounded-xl border text-sm font-extrabold bg-white" data-mode="WATCH">🟡 تحت المتابعة</button>
        <button class="ms_mode_pill px-3 py-2 rounded-xl border text-sm font-extrabold bg-white" data-mode="AVOID">🔴 تجنب</button>
      </div>

      <!-- Filters: Desktop panel (md+) -->
      <div class="hidden md:grid md:grid-cols-3 gap-3">
        <div>
          <label class="text-xs font-bold text-slate-600">بحث</label>
          <input id="ms_dash_search" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" placeholder="رمز أو اسم..." />
        </div>
        <div>
          <label class="text-xs font-bold text-slate-600">فرز</label>
          <select id="ms_dash_sort" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
            <option value="added_desc">الأحدث إضافة</option>
            <option value="score_desc">الأعلى Trust</option>
            <option value="score_asc">الأقل Trust</option>
            <option value="change_desc">الأعلى تغير %</option>
            <option value="change_asc">الأقل تغير %</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-bold text-slate-600">تصفية الحالة</label>
          <select id="ms_dash_traffic" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
            <option value="ALL">الكل</option>
            <option value="GREEN">🟢 آمن</option>
            <option value="YELLOW">🟡 بحذر</option>
            <option value="RED">🔴 خطر</option>
          </select>
        </div>
      </div>

      <!-- Filters: Mobile drawer/bottom-sheet -->
      <div class="md:hidden mt-3">
        <button id="ms_filters_open" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-extrabold">⚙️ الفلاتر والفرز</button>

        <div id="ms_filters_sheet" class="hidden fixed inset-0 z-40">
          <div class="absolute inset-0 bg-black/30" data-close="1"></div>
          <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-4 max-h-[85vh] overflow-auto">
            <div class="flex items-center justify-between mb-3">
              <div class="font-extrabold">الفلاتر</div>
              <button class="px-3 py-2 rounded-xl border border-slate-200 font-bold" data-close="1">إغلاق</button>
            </div>

            <div class="grid grid-cols-1 gap-3">
              <div>
                <label class="text-xs font-bold text-slate-600">بحث</label>
                <input id="ms_dash_search_m" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" placeholder="رمز أو اسم..." />
              </div>
              <div>
                <label class="text-xs font-bold text-slate-600">فرز</label>
                <select id="ms_dash_sort_m" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
                  <option value="added_desc">الأحدث إضافة</option>
                  <option value="score_desc">الأعلى Trust</option>
                  <option value="score_asc">الأقل Trust</option>
                  <option value="change_desc">الأعلى تغير %</option>
                  <option value="change_asc">الأقل تغير %</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-bold text-slate-600">تصفية الحالة</label>
                <select id="ms_dash_traffic_m" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
                  <option value="ALL">الكل</option>
                  <option value="GREEN">🟢 آمن</option>
                  <option value="YELLOW">🟡 بحذر</option>
                  <option value="RED">🔴 خطر</option>
                </select>
              </div>
            </div>

            <div class="mt-4">
              <button id="ms_filters_apply" class="w-full px-3 py-2 rounded-xl bg-sky-600 text-white font-extrabold">تطبيق</button>
            </div>
          </div>
        </div>
      </div>

      <div class="text-xs text-slate-500 mt-2">(v1.6) الفرز/التصفية تعمل محليًا داخل المتصفح.</div>
    </div>

    <!-- Mobile cards (no horizontal scroll) -->
    <div id="ms_watchlist_cards" class="md:hidden space-y-3">
      ${dashboardCardsHtml(rows)}
    </div>

    <!-- Desktop table -->
    <div class="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr class="text-right">
              <th class="p-3">السهم</th>
              <th class="p-3">السوق</th>
              <th class="p-3">السعر</th>
              <th class="p-3">التغير %</th>
              <th class="p-3">الحجم</th>
              <th class="p-3">Trust</th>
              <th class="p-3">الحالة</th>
              <th class="p-3">SMF</th>
              <th class="p-3">القرار</th>
              <th class="p-3"></th>
            </tr>
          </thead>
          <tbody>
            ${dashboardRowsHtml(rows)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function dashboardRowsHtml(rows) {
  return (rows || []).map(r => `
    <tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="p-3">
        <div class="font-extrabold">${escapeHtml(r.symbol)}</div>
        <div class="text-xs text-slate-500">${escapeHtml(r.name || '')}</div>
      </td>
      <td class="p-3">${r.market === 'SA' ? 'السوق السعودي' : 'السوق الأمريكي'}</td>
      <td class="p-3">${fmtNumber(r.price, 2)} ${escapeHtml(r.currency || '')}</td>
      <td class="p-3">${fmtNumber(r.changePercent, 2)}</td>
      <td class="p-3">${fmtInt(r.volume)}</td>
      <td class="p-3">${scorePill(r.trustScore ?? 0)}</td>
      <td class="p-3">${badgeTraffic(r.traffic || 'YELLOW')}</td>
      <td class="p-3">${smfBadge(r)}</td>
      <td class="p-3">${opportunityBadge(r)}</td>
      <td class="p-3">${exitBadge(r)}</td>
      <td class="p-3">${decisionBadge(r)}</td>
      <td class="p-3">
        <a class="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold" href="#/details?symbol=${encodeURIComponent(r.symbol)}&market=${encodeURIComponent(r.market)}">تفاصيل</a>
      </td>
    </tr>
  `).join('');
}


function decisionBadge(r) {
  const tag = String(r?.decisionTag || '').toUpperCase();
  if (tag === 'CONSIDER') return '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-sky-100 text-sky-800">🔵 فرصة</span>';
  if (tag === 'WATCH') return '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-amber-100 text-amber-900">🟡 متابعة</span>';
  if (tag === 'REDUCE_RISK') return '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-orange-100 text-orange-900">🟠 تخفيف</span>';
  if (tag === 'AVOID') return '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-rose-100 text-rose-800">🔴 تجنّب</span>';
  return '<span class="text-xs text-slate-400">—</span>';
}

function smfBadge(r) {
  const available = r?.smfAvailable;
  if (!available) return '<span class="text-xs text-slate-400">—</span>';
  const sig = String(r?.smfSignal || '').toUpperCase();
  if (sig === 'ACCUMULATION') {
    return '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">🟢 تجميع</span>';
  }
  if (sig === 'DISTRIBUTION') {
    return '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-rose-100 text-rose-800">🔴 تصريف</span>';
  }
  return '<span class="text-xs text-slate-400">—</span>';
}

export function renderAdd(container) {
  container.innerHTML = `
    <div class="text-xl font-extrabold mb-1">إضافة سهم</div>
    <div class="text-sm text-slate-500 mb-4">أضف سهمًا أمريكيًا أو سعوديًا إلى قائمة المراقبة</div>

    <div class="bg-white border border-slate-200 rounded-2xl p-4">
      <div class="grid md:grid-cols-3 gap-3">
        <div>
          <label class="text-sm font-bold">الرمز (Symbol)</label>
          <input id="addSymbol" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" placeholder="مثال: AAPL أو 2222.SR" />
        </div>
        <div>
          <label class="text-sm font-bold">السوق</label>
          <select id="addMarket" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
            <option value="US">US — أمريكي</option>
            <option value="SA">SA — سعودي</option>
          </select>
        </div>
        <div class="flex items-end">
          <button id="addBtn" class="w-full px-3 py-2 rounded-xl bg-sky-600 text-white font-extrabold">إضافة</button>
        </div>
      </div>

      <div class="mt-4 text-xs text-slate-500 leading-6">
        <div class="font-bold">ملاحظات:</div>
        <ul class="list-disc pr-6">
          <li>البيانات في v1 تعتمد على DB + وضع التجربة. مزود بيانات خارجي قابل للإضافة لاحقًا.</li>
          <li>لا يوجد أي مفاتيح API داخل الواجهة (Security).</li>
        </ul>
      </div>
    </div>
  `;
}


function opportunityBadge(r) {
  const s = Number(r?.opportunityScore);
  const tag = String(r?.opportunityTag || '').toUpperCase();
  if (!Number.isFinite(s)) return '<span class="text-xs text-slate-400">—</span>';
  if (tag === 'HIGH_OPPORTUNITY') return `<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-indigo-100 text-indigo-800">⭐ ${fmtInt(s)} دخول</span>`;
  if (tag === 'LOW_OPPORTUNITY') return `<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-slate-100 text-slate-700">${fmtInt(s)} فرصة</span>`;
  return `<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-slate-50 text-slate-700">${fmtInt(s)} فرصة</span>`;
}

function exitBadge(r) {
  const s = Number(r?.exitScore);
  const tag = String(r?.exitTag || '').toUpperCase();
  if (!Number.isFinite(s)) return '<span class="text-xs text-slate-400">—</span>';
  if (tag === 'HIGH_EXIT_RISK') return `<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-rose-100 text-rose-800">⚠️ ${fmtInt(s)} خروج</span>`;
  if (tag === 'LOW_EXIT_RISK') return `<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">${fmtInt(s)} خروج</span>`;
  return `<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-amber-100 text-amber-900">${fmtInt(s)} خروج</span>`;
}

export function dataSourceLine(data){
  const src = data?.meta?.data_source || data?.meta?.source || data?.data_source;
  const note = data?.meta?.latency_note || data?.meta?.latency || data?.latency_note;
  const mode = data?.meta?.data_mode || data?.meta?.mode;
  if (!src && !note && !mode) return '';
  const parts = [];
  if (mode) parts.push(`<span class="font-bold">الوضع:</span> ${escapeHtml(String(mode).toUpperCase())}`);
  if (src) parts.push(`<span class="font-bold">مصدر البيانات:</span> ${escapeHtml(String(src))}`);
  if (note) parts.push(`<span class="font-bold">التأخير:</span> ${escapeHtml(String(note))}`);
  return `<div class="text-xs text-slate-500 mt-1">${parts.join(' • ')}</div>`;
}



let __msTV = { chart:null, candle:null, sma20:null, sma200:null, vol:null, zone:null, tf:'M', lines:[], symbol:null, tooltipEl:null, restoreRange:null, eventMap:new Map() };

function _msKey(symbol, k){ return `ms_${k}_${symbol || 'GLOBAL'}`; }
function _msLoad(symbol, k){ try{ return localStorage.getItem(_msKey(symbol,k)); }catch(_){ return null; } }
function _msSave(symbol, k, v){ try{ localStorage.setItem(_msKey(symbol,k), String(v)); }catch(_){ } }


function initCharts(container, data) {
  const candles = Array.isArray(data?.history?.candles) ? data.history.candles : [];
  if (!candles.length || typeof LightweightCharts === 'undefined') return;

  const symbol = data?.symbol || 'GLOBAL';
  __msTV.symbol = symbol;
  const savedTf = _msLoad(symbol, 'tf');
  if (savedTf) __msTV.tf = savedTf;
  const savedRange = _msLoad(symbol, 'range');
  __msTV.restoreRange = savedRange ? JSON.parse(savedRange) : null;

  const tfButtons = container.querySelectorAll('.ms-tf');
  tfButtons.forEach(b => {
    b.addEventListener('click', () => {
      __msTV.tf = b.getAttribute('data-tf') || 'M';
      _msSave(symbol, 'tf', __msTV.tf);
      tfButtons.forEach(x => x.classList.remove('bg-sky-600','text-white','border-sky-600'));
      b.classList.add('bg-sky-600','text-white','border-sky-600');
      drawTV(container, data, candles);
    });
  });

  // highlight saved TF
  const def = container.querySelector(`.ms-tf[data-tf="${__msTV.tf || 'M'}"]`) || container.querySelector('.ms-tf[data-tf="M"]');
  if (def) def.classList.add('bg-sky-600','text-white','border-sky-600');
  __msTV.tf = __msTV.tf || 'M';

  drawTV(container, data, candles);
}

function drawTV(container, data, candles) {
  const host = container.querySelector('#ms_tv_chart');
  if (!host) return;

  // cleanup
  if (__msTV.chart) {
    try { __msTV.chart.remove(); } catch (_) {}
    __msTV.chart = null;
    __msTV.lines = [];
  }
  host.innerHTML = '';

  const tf = __msTV.tf || 'M';
  const series = resampleOHLCV(candles, tf); // [{time,open,high,low,close,volume}]

  const w = host.clientWidth || host.parentElement?.clientWidth || 800;
  const h = host.clientHeight || 260;

  __msTV.chart = LightweightCharts.createChart(host, {
    width: w,
    height: h,
    layout: { background: { type: 'solid', color: '#ffffff' }, textColor: '#0f172a' },
    grid: { vertLines: { color: '#e2e8f0' }, horzLines: { color: '#e2e8f0' } },
    rightPriceScale: { borderColor: '#e2e8f0' },
    timeScale: { borderColor: '#e2e8f0', timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  // Tooltip overlay (Arabic)
  __msTV.tooltipEl = createTooltip(host);

  // Restore last visible range if available
  try {
    if (__msTV.restoreRange && __msTV.chart?.timeScale) {
      __msTV.chart.timeScale().setVisibleLogicalRange(__msTV.restoreRange);
    }
  } catch (_) {}

  // Persist zoom/scroll range (logical range)
  try {
    __msTV.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || __msTV.symbol === null) return;
      _msSave(__msTV.symbol, 'range', JSON.stringify(range));
    });
  } catch (_) {}

  __msTV.candle = __msTV.chart.addCandlestickSeries({
    upColor: '#10b981',
    downColor: '#ef4444',
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444',
    borderVisible: false,
  });

  __msTV.candle.setData(series.map(x => ({
    time: x.time,
    open: x.open,
    high: x.high,
    low: x.low,
    close: x.close
  })));

  // Volume histogram
  __msTV.vol = __msTV.chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    scaleMargins: { top: 0.8, bottom: 0 },
  });
  __msTV.vol.setData(series.map(x => ({
    time: x.time,
    value: x.volume || 0,
    color: x.close >= x.open ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'
  })));

  // SMA overlays
  const closes = series.map(x => x.close);
  const sma20 = computeSMA(closes, 20);
  const sma200 = computeSMA(closes, 200);

  __msTV.sma20 = __msTV.chart.addLineSeries({ lineWidth: 1, color: '#0ea5e9' });
  __msTV.sma200 = __msTV.chart.addLineSeries({ lineWidth: 1, color: '#7c3aed' });

  __msTV.sma20.setData(series.map((x,i)=> sma20[i]===null ? null : ({ time:x.time, value:sma20[i] })).filter(Boolean));
  __msTV.sma200.setData(series.map((x,i)=> sma200[i]===null ? null : ({ time:x.time, value:sma200[i] })).filter(Boolean));
  // v2.3.4: منطقة دعم/مقاومة مظللة (Best-effort) — بين support & resistance
  try {
    const d = data?.decision || null;
    const sr = data?.sr || {};
    const support = Number(sr.support ?? d?.support);
    const resistance = Number(sr.resistance ?? d?.resistance);
    if (Number.isFinite(support) && Number.isFinite(resistance) && resistance > support) {
      __msTV.zone = __msTV.chart.addBaselineSeries({
        baseValue: { type: 'price', price: support },
        topLineColor: 'rgba(148,163,184,0.25)',
        topFillColor1: 'rgba(14,165,233,0.10)',
        topFillColor2: 'rgba(14,165,233,0.03)',
        bottomLineColor: 'rgba(148,163,184,0.25)',
        bottomFillColor1: 'rgba(148,163,184,0.05)',
        bottomFillColor2: 'rgba(148,163,184,0.02)',
        lineWidth: 1,
      });
      __msTV.zone.setData(series.map(x => ({ time: x.time, value: resistance })));
    }
  } catch (_) {}


  // Markers for Alerts (A01..A05)
  const markers = buildAlertMarkers(data, series);
  const allMarkers = combineMarkers(markers, data, series);
  if (allMarkers.length) __msTV.candle.setMarkers(allMarkers);

  // v2.6.1: Event overlay — map markers to alerts and show details on click
  try {
    __msTV.eventMap = buildEventMap(data, series);
    const panel = container.querySelector('#ms_event_panel');
    if (panel) panel.classList.add('hidden');
    __msTV.chart.subscribeClick((param) => {
      if (!param || !param.time) return;
      const t = Number(param.time);
      const hit = findNearestEvent(__msTV.eventMap, t, 0); // exact time match after mapping
      if (!hit) return;
      renderEventPanel(container, hit.time, hit.alerts, series);
    });
  } catch (_) {}



  // Auto lines: Entry/Stop/Targets + Support/Resistance
  drawDecisionLines(data);

  __msTV.chart.timeScale().fitContent();

  // Crosshair tooltip content
  try {
    __msTV.chart.subscribeCrosshairMove((param) => {
      if (!__msTV.tooltipEl) return;
      if (!param || !param.time || !param.seriesData) { __msTV.tooltipEl.innerHTML = '—'; return; }
      const c = param.seriesData.get(__msTV.candle);
      const v = param.seriesData.get(__msTV.vol);
      const s20 = param.seriesData.get(__msTV.sma20);
      const s200 = param.seriesData.get(__msTV.sma200);
      const o = c?.open, h = c?.high, l = c?.low, cl = c?.close;
      const vol = v?.value;
      __msTV.tooltipEl.innerHTML = `
        <div class="font-extrabold mb-1">تفاصيل الشمعة</div>
        <div>فتح: <b>${fmtAr(o)}</b> — أعلى: <b>${fmtAr(h)}</b></div>
        <div>أدنى: <b>${fmtAr(l)}</b> — إغلاق: <b>${fmtAr(cl)}</b></div>
        <div>حجم: <b>${fmtAr(vol)}</b></div>
        <div class="mt-1 text-slate-600">SMA20: <b>${fmtAr(s20?.value)}</b> | SMA200: <b>${fmtAr(s200?.value)}</b></div>
      `;
    });
  } catch (_) {}

}

function drawDecisionLines(data) {
  // remove old price lines
  try {
    __msTV.lines.forEach(l => {
      try { l.remove(); } catch (_) {}
    });
  } catch (_) {}
  __msTV.lines = [];

  const d = data?.decision || null;
  const sr = data?.sr || {};
  if (!__msTV.candle) return;

  const addLine = (price, title, color) => {
    if (price === null || price === undefined || !Number.isFinite(Number(price))) return;
    const line = __msTV.candle.createPriceLine({
      price: Number(price),
      color,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title,
    });
    __msTV.lines.push(line);
  };

  // Conservative plan
  addLine(d?.entry, 'دخول', '#10b981');
  addLine(d?.stop, 'وقف', '#ef4444');
  addLine(d?.target1, 'هدف', '#0ea5e9');
  addLine(d?.target2, 'هدف2', '#0ea5e9');

  addLine(sr?.support ?? d?.support, 'دعم', '#64748b');
  addLine(sr?.resistance ?? d?.resistance, 'مقاومة', '#64748b');

  // v2.3.3: رسم مستويات دعم/مقاومة إضافية (Top Levels)
  const levels = (d?.levels || []).slice(0, 6);
  for (const lv of levels) {
    const p = Number(lv.price);
    if (!Number.isFinite(p)) continue;
    const tag = (lv.kind === 'SUPPORT') ? 'S' : (lv.kind === 'RESISTANCE') ? 'R' : 'SR';
    addLine(p, `${tag}`, '#cbd5e1');
  }

}

function buildAlertMarkers(data, series) {
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
  if (!alerts.length || !series.length) return [];

  const times = series.map(x => x.time); // epoch seconds sorted asc
  const closestTime = (epochSec) => {
    if (!epochSec) return times[times.length - 1];
    // binary search
    let lo = 0, hi = times.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (times[mid] < epochSec) lo = mid + 1; else hi = mid;
    }
    const t1 = times[lo];
    const t0 = times[Math.max(0, lo - 1)];
    return (Math.abs(t1 - epochSec) < Math.abs(epochSec - t0)) ? t1 : t0;
  };

  const toEpoch = (t) => {
    if (!t) return null;
    if (typeof t === 'number') return Math.floor(t / (t > 1e12 ? 1000 : 1)); // ms vs sec
    const d = new Date(t);
    const ms = d.getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  };

  const shapeByCode = (code) => {
    switch (code) {
      case 'A01': return 'arrowDown';
      case 'A02': return 'circle';
      case 'A03': return 'square';
      case 'A04': return 'circle';
      case 'A05': return 'arrowDown';
      case 'A06': return 'circle';
      default: return 'circle';
    }
  };

  const out = [];
  for (const a of alerts.slice(0, 25)) {
    const code = String(a.code || '').toUpperCase();
    const sev = String(a.severity || a.level || '').toUpperCase();
    const epoch = toEpoch(a.at);
    const t = closestTime(epoch);

    const color = (sev === 'HIGH') ? '#ef4444' : (sev === 'MED') ? '#f59e0b' : '#64748b';
    out.push({
      time: t,
      position: 'aboveBar',
      color,
      shape: shapeByCode(code),
      text: code,
    });
  }
  return out;
}

function bucketCandles(candles, tf) {
  // Input: [{t,open,high,low,close,volume}] time in ISO or epoch.
  const keyFn = (dt) => {
    const d = new Date(dt);
    if (tf === 'W') {
      const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
      const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
      return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
    }
    // M or Y -> month buckets (Y shows longer history)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };

  const map = new Map();
  for (const c of candles) {
    const t = c.t || c.time || c.date;
    if (!t) continue;
    const k = keyFn(t);
    const o = Number(c.open), h = Number(c.high), l = Number(c.low), cl = Number(c.close), v = Number(c.volume||0);
    if (!Number.isFinite(cl)) continue;

    const cur = map.get(k) || { key:k, time:null, open:null, high:null, low:null, close:null, volume:0 };
    const d = new Date(t);
    // store representative time as end of bucket (last seen)
    cur.time = Math.floor(d.getTime()/1000);

    if (cur.open === null && Number.isFinite(o)) cur.open = o;
    if (Number.isFinite(h)) cur.high = cur.high===null ? h : Math.max(cur.high,h);
    if (Number.isFinite(l)) cur.low = cur.low===null ? l : Math.min(cur.low,l);
    cur.close = cl;
    if (Number.isFinite(v)) cur.volume += v;
    map.set(k, cur);
  }
  const arr = Array.from(map.values()).sort((a,b)=> String(a.key).localeCompare(String(b.key)));

  const limit = (tf === 'W') ? 120 : (tf === 'M') ? 120 : 240; // Y shows more
  const sliced = arr.slice(Math.max(0, arr.length - limit));

  return sliced.map(x => ({
    time: x.time,
    open: x.open ?? x.close,
    high: x.high ?? x.close,
    low: x.low ?? x.close,
    close: x.close,
    volume: x.volume || 0
  })).filter(x => x.time && Number.isFinite(x.close));
}

function computeSMA(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i=0;i<values.length;i++){
    const v = Number(values[i]);
    if (!Number.isFinite(v)) continue;
    sum += v;
    if (i >= n) {
      const old = Number(values[i-n]);
      if (Number.isFinite(old)) sum -= old;
    }
    if (i >= n-1) out[i] = +(sum / n);
  }
  return out;
}

// RSI still used in other panels; keep a simple implementation for compatibility
function computeRSI(values, period=14) {
  const out = new Array(values.length).fill(null);
  let gains = 0, losses = 0;
  for (let i=1;i<values.length;i++){
    const diff = Number(values[i]) - Number(values[i-1]);
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      gains += gain; losses += loss;
      if (i === period) {
        const rs = (losses === 0) ? 100 : (gains/period)/(losses/period);
        out[i] = +(100 - (100/(1+rs)));
      }
    } else {
      gains = (gains * (period-1) + gain) / period;
      losses = (losses * (period-1) + loss) / period;
      const rs = (losses === 0) ? 100 : (gains / losses);
      out[i] = +(100 - (100/(1+rs)));
    }
  }
  return out;
}

function renderAssistantPanel(data, opts = {}) {
  const a = data?.assistant || {};
  const summary = a.executive_summary || '';
  const actions = Array.isArray(a.manager_actions) ? a.manager_actions : [];
  const why = Array.isArray(a.why_now) ? a.why_now : [];
  const note = a.confidence_note || '';

  const warn = data?.portfolio_health?.warning;

  if (!summary && !actions.length && !why.length && !note && !warn) {
    return '<div class="text-sm text-slate-500">لا يوجد ملخص تنفيذي.</div>';
  }

  const list = (arr) => arr.map(x => `<li class="mb-1">${escapeHtml(String(x))}</li>`).join('');

  return `
    ${warn ? `
      <div class="mb-3 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-sm">
        <div class="font-extrabold">تحذير نفسي للمحفظة</div>
        <div class="text-slate-700 mt-1">${escapeHtml(warn)}</div>
      </div>` : ''}

    ${summary ? `<div class="font-extrabold text-base">${escapeHtml(summary)}</div>` : ''}

    ${actions.length ? `
      <div class="mt-3">
        <div class="text-xs text-slate-500 font-bold mb-1">أوامر المدير (٣ فقط)</div>
        <ol class="text-sm list-decimal pr-5">${list(actions.slice(0,3))}</ol>
      </div>` : ''}

    ${why.length ? `
      <div class="mt-3">
        <div class="text-xs text-slate-500 font-bold mb-1">لماذا الآن</div>
        <ul class="text-sm list-disc pr-5">${list(why.slice(0,3))}</ul>
      </div>` : ''}

    ${note ? `<div class="mt-3 text-xs text-slate-600">${escapeHtml(note)}</div>` : ''}
  `;
}

function renderDetails(container, data, snapshots = [], opts = {}) {
  try { window.__ms_lastDetailData = data; } catch(e) {}

  const alertsHtml = (data.alerts || []).length
    ? (data.alerts || []).map(a => `
        <div class="border border-slate-200 rounded-2xl p-3 bg-white">
          <div class="flex items-center justify-between gap-2">
            <div class="font-extrabold">${escapeHtml(a.title_ar || a.title || '')}</div>
            <div class="text-xs font-extrabold px-2 py-1 rounded-full ${a.severity === 'HIGH' ? 'bg-rose-100 text-rose-800' : a.severity === 'MED' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'}">
              ${escapeHtml(a.code)} • ${escapeHtml(a.severity)}
            </div>
          </div>
          <div class="text-sm text-slate-600 mt-1">${escapeHtml(a.message_ar || a.message || '')}</div>
        </div>
      `).join('')
    : '<div class="text-sm text-slate-500">لا توجد تنبيهات حالياً.</div>';

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <div class="text-xl font-extrabold">تفاصيل السهم: ${escapeHtml(data.symbol)} <span class="text-sm text-slate-500">(${data.market === 'SA' ? 'سعودي' : 'أمريكي'})</span></div>
        ${dataSourceLine(data)}
        <div class="mt-2 flex flex-wrap items-center gap-2">
          ${scorePill(data.score)}
          ${badgeTraffic(data.traffic)}
          ${positionToggle(data)}
          ${finalDecisionCard(data)}
          ${decisionCard(data)}
          ${opportunityCard(data)}
          ${exitCard(data)}
        </div>
      </div>
      <a href="#/dashboard" class="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold">رجوع</a>
    </div>

    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 space-y-4">
        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">السعر والحجم</div>
          <div class="grid sm:grid-cols-3 gap-3 text-sm">
            <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div class="text-slate-500">السعر</div>
              <div class="font-extrabold text-lg">${fmtNumber(data.quote?.price, 2)}</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div class="text-slate-500">التغير %</div>
              <div class="font-extrabold text-lg">${fmtNumber(data.quote?.changePercent, 2)}</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div class="text-slate-500">الحجم</div>
              <div class="font-extrabold text-lg">${fmtInt(data.quote?.volume)}</div>
            </div>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">المؤشرات الفنية</div>
          <div class="grid sm:grid-cols-4 gap-3 text-sm">
            <div class="p-3 rounded-2xl bg-sky-50 border border-sky-200">
              <div class="text-slate-600">RSI(14)</div>
              <div class="font-extrabold text-lg">${fmtNumber(data.indicators?.rsi14, 2)}</div>
            </div>
            <div class="p-3 rounded-2xl bg-sky-50 border border-sky-200">
              <div class="text-slate-600">SMA20</div>
              <div class="font-extrabold text-lg">${fmtNumber(data.indicators?.sma20, 2)}</div>
            </div>
            <div class="p-3 rounded-2xl bg-sky-50 border border-sky-200">
              <div class="text-slate-600">SMA200</div>
              <div class="font-extrabold text-lg">${fmtNumber(data.indicators?.sma200, 2)}</div>
            </div>
            <div class="p-3 rounded-2xl bg-sky-50 border border-sky-200">
              <div class="text-slate-600">Volume Ratio (20)</div>
              <div class="font-extrabold text-lg">${fmtNumber(data.indicators?.vol_ratio20, 2)}</div>
            </div>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">المؤشرات الأساسية (Fundamentals)</div>
          <div class="grid sm:grid-cols-4 gap-3 text-sm">
            ${fundCard('P/E', data.fundamentals?.pe)}
            ${fundCard('Debt/Equity', data.fundamentals?.debt_equity)}
            ${fundCard('ROE', data.fundamentals?.roe)}
            ${fundCard('Operating Margin', (data.fundamentals?.operating_margin ?? data.fundamentals?.op_margin))}
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">تفصيل الدرجة (Score Breakdown)</div>
          ${renderBreakdown(data.scoreBreakdown)}
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="flex items-center justify-between gap-2 mb-3">
            <div>
              <div class="font-extrabold">خطة قرار آلي (نمط محافظ)</div>
              <div class="text-xs text-slate-500">إشارة مساعدة وليست توصية استثمارية. القرار النهائي للمستخدم.</div>
            </div>
          </div>
          ${renderDecisionCard(data)}
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="flex items-center justify-between gap-2 mb-3">
            <div>
              <div class="font-extrabold">الرسم البياني</div>
              <div class="text-xs text-slate-500">Price + SMA / Volume / RSI — اختر الفترة الزمنية (W/M/Y)</div>
            </div>
            <div class="flex gap-2">
              <button data-tf="W" class="ms-tf px-3 py-1 rounded-xl border border-slate-200 bg-white text-sm font-bold">أسبوعي</button>
              <button data-tf="M" class="ms-tf px-3 py-1 rounded-xl border border-slate-200 bg-white text-sm font-bold">شهري</button>
              <button data-tf="Y" class="ms-tf px-3 py-1 rounded-xl border border-slate-200 bg-white text-sm font-bold">سنوي</button>
            </div>
          </div>

          <div class="grid gap-3">
            <div class="border border-slate-200 rounded-2xl p-3 bg-slate-50">
              <div id="ms_tv_chart" style="height:260px;"></div>
              <div id="ms_event_panel" class="mt-3 hidden"></div>
            </div>
            <div class="border border-slate-200 rounded-2xl p-3 bg-slate-50">
              <div class="text-xs text-slate-500">الحجم مدمج داخل الشارت (Histogram).</div>
            </div>
            <div class="border border-slate-200 rounded-2xl p-3 bg-slate-50">
              <canvas id="ms_chart_rsi" height="80"></canvas>
            </div>
            <div class="text-xs text-slate-500">
              <span class="font-bold">ملاحظة:</span> في v2.3.2 نعتمد شموع حقيقية (Candlesticks) مع متوسطات وإشارات لتفسير القرار (السعر/المتوسطات/الحجم/RSI). الشموع الكاملة يمكن إضافتها كترقية لاحقة دون تغيير الهيكل.
            </div>
          </div>
        </div>

          <div class="font-extrabold mb-2">سجل اللقطات (Snapshots)</div>
          ${renderSnapshotsTable(snapshots)}
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">التنبيهات</div>
          ${opts?.hiddenCount ? `
    <div class="mb-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm">
      <div class="font-extrabold">وضع صامت مفعل</div>
      <div class="text-slate-700 mt-1">+${fmtInt(opts.hiddenCount)} تنبيهات منخفضة مخفية</div>
    </div>` : ''}

    <div class="space-y-2">${alertsHtml}</div>
        </div>
      </div>

      <div class="space-y-4">
        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">المستشار التنفيذي</div>
          ${renderAssistantPanel(data, opts)}
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">رادار السيولة الذكية (SMF)</div>
          ${renderSMFCard(data)}
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">التدفق المؤسسي (Institutional Flow)</div>
          ${renderInstitutionalFlowCard(data)}
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">مؤشرات القرار الذكي (v2.6)</div>
          ${renderDecisionGauges(data)}
        </div>


        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">اتجاه نمو الأرباح (Earnings Growth Trend)</div>
          ${renderEarningsGrowthCard(data)}
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">فلاتر الحماية الخمسة</div>
          <div class="text-xs text-slate-500 mb-2">شرح مختصر + نتيجة كل فلتر (قدر المستطاع حسب البيانات المتاحة).</div>
          ${renderProtectionFilters(data)}
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">الأسباب (Reasons)</div>
          ${renderReasonsByAxis(data.reasonsByAxis)}
          <ul class="list-disc pr-6 text-sm text-slate-600 leading-7">
            ${(data.reasons || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}
          </ul>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="font-extrabold mb-2">خبر/عنوان (Manual Sentiment)</div>
          <div class="text-xs text-slate-500 mb-2">(Placeholder MVP) — ألصق عنوان خبر وسيُحلل كلمات مفتاحية. ويمكن تفعيل "ضجيج بدون إفصاح" لإظهار تنبيه A04.</div>
          <textarea id="newsText" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" rows="4" placeholder="مثال: الشركة تعلن خفض المديونية وتوزيع أرباح..."></textarea>

          <div class="mt-3 flex items-center gap-3 text-sm">
            <label class="flex items-center gap-2"><input id="hype" type="checkbox" /> ضجيج اجتماعي مرتفع</label>
            <label class="flex items-center gap-2"><input id="noOfficial" type="checkbox" /> لا يوجد إفصاح رسمي</label>
          </div>

          <button id="reanalyzeBtn" class="mt-3 w-full px-3 py-2 rounded-xl bg-emerald-600 text-white font-extrabold">إعادة التحليل</button>
        </div>
      </div>
    </div>
  `;

  try { initCharts(container, data); } catch (_) {}

}

function renderSMFCard(data) {
  const smf = data?.smf || {};
  if (!smf.available) {
    return `<div class="text-sm text-slate-500">غير متاح حالياً — يعتمد على توفر بيانات كافية (Intraday اختياري).</div>`;
  }
  const sig = String(smf.signal || '').toUpperCase();
  const pill = sig === 'ACCUMULATION'
    ? '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">🟢 تجميع</span>'
    : '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-rose-100 text-rose-800">🔴 تصريف</span>';
  const expl = sig === 'ACCUMULATION'
    ? 'قراءة تميل إلى دخول/تجميع سيولة. (لا تعني توصية شراء — فقط قياس سلوك السيولة).'
    : 'قراءة تميل إلى خروج/تصريف سيولة. (إشارة تحذير وليست توصية بيع).';
  return `
    <div class="flex items-center justify-between gap-2">
      <div class="text-sm">النوع: <span class="font-extrabold">${escapeHtml(smf.type)}</span></div>
      ${pill}
    </div>
    <div class="mt-2 text-sm">الدرجة: <span class="font-extrabold">${escapeHtml(String(smf.score))}</span>/100</div>
    <div class="mt-2 text-xs text-slate-600 leading-6">${escapeHtml(expl)}</div>
  `;
}


function renderContextEngineCard(data){
  try {
    const ce = data?.meta?.context_engine;
    if (!ce || !ce.regime) return "";
    const regimeMap = {
      UPTREND: "اتجاه صاعد",
      DOWNTREND: "اتجاه هابط",
      RANGE: "تذبذب جانبي",
      VOLATILE: "تذبذب عالي"
    };
    const rLabel = regimeMap[ce.regime] || ce.regime;
    const s = (typeof ce.strength_pct === "number") ? ce.strength_pct : Number(ce.strength_pct || 0);
    const strengthText = Number.isFinite(s) ? `${s.toFixed(2)}%` : "—";

    return `
      <div class="card p-4 mt-3" style="border-radius:16px">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="font-bold">🧭 Context Engine</div>
          <div class="chip px-3 py-1 text-sm">${rLabel}</div>
        </div>
        <div class="text-sm muted leading-6">
          <div>القوة (مسافة عن المتوسط القصير): <b>${strengthText}</b></div>
          <div class="mt-2 muted">*معلومة سياقية لتقليل الأخطاء (ليست توصية شراء/بيع).</div>
        </div>
      </div>
    `;
  } catch(e){
    return "";
  }
}


function renderSmartMoneyCard(data) {
  const sm = data?.smart_money || null;
  if (!sm) {
    return `<div class="text-sm text-slate-500">غير متاح حالياً.</div>`;
  }
  const score = Number(sm.smart_money_score);
  const state = String(sm.smart_money_state || '').toUpperCase();
  const reasons = Array.isArray(sm.reasons) ? sm.reasons : [];
  const flags = Array.isArray(sm.flags) ? sm.flags : [];

  const pill =
    state === 'QUIET_ACCUMULATION'
      ? '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">🟢 تجميع هادئ</span>'
      : state === 'EARLY_BUILD'
        ? '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-sky-100 text-sky-800">🔵 بناء مبكر</span>'
        : state === 'DISTRIBUTION'
          ? '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-rose-100 text-rose-800">🔴 تصريف/توزيع</span>'
          : '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-slate-100 text-slate-800">⚪ محايد</span>';

  const scoreBadge =
    Number.isFinite(score)
      ? `<div class="text-sm">الدرجة: <span class="font-extrabold">${Math.round(score)}</span> / 100</div>`
      : `<div class="text-sm text-slate-500">الدرجة: غير متاحة</div>`;

  const reasonsHtml = reasons.length
    ? `<ul class="mt-2 text-sm text-slate-600 list-disc pr-5 space-y-1">${reasons.slice(0,3).map(r => `<li>${escapeHtml(String(r))}</li>`).join('')}</ul>`
    : `<div class="mt-2 text-sm text-slate-500">لا توجد علامات قوية حالياً.</div>`;

  const flagsHtml = flags.length
    ? `<div class="mt-2 flex flex-wrap gap-2">${flags.slice(0,4).map(f => `<span class="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(String(f))}</span>`).join('')}</div>`
    : ``;

  return `
    <div class="flex items-center justify-between gap-2">
      <div class="text-sm">الحالة: ${pill}</div>
      ${scoreBadge}
    </div>
    ${reasonsHtml}
    ${flagsHtml}
    <div class="mt-2 text-xs text-slate-500">ملاحظة: هذا قياس سلوك سيولة/تجميع محتمل وليس توصية شراء/بيع.</div>
  `;
}

function renderInstitutionalFlowCard(data) {
  const inst = data?.institutionalFlow || {};
  if (!inst.available) {
    return `<div class="text-sm text-slate-500">غير متاح حالياً — يعتمد على Intraday (اختياري) أو إشارات SMF.</div>`;
  }
  const sig = String(inst.signal || '').toUpperCase();
  const pill = sig === 'ACCUMULATION'
    ? '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">🟢 تجميع</span>'
    : sig === 'DISTRIBUTION'
      ? '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-rose-100 text-rose-800">🔴 تصريف</span>'
      : '<span class="text-xs font-extrabold px-2 py-1 rounded-full bg-amber-100 text-amber-800">🟡 مختلط</span>';
  const conf = escapeHtml(String(inst.confidence || 'MED'));
  const vwap = inst.vwap != null ? `VWAP: ${fmtNumber(inst.vwap, 4)}` : 'VWAP: —';
  const delta = inst.delta != null ? `ΔFlow: ${fmtNumber(inst.delta, 3)}` : 'ΔFlow: —';
  return `
    <div class="flex items-center justify-between gap-2">
      <div class="text-sm">الثقة: <span class="font-extrabold">${conf}</span></div>
      ${pill}
    </div>
    <div class="mt-2 text-sm">الدرجة: <span class="font-extrabold">${escapeHtml(String(inst.score))}</span>/100</div>
    <div class="mt-2 text-xs text-slate-600 leading-6">${escapeHtml(vwap)} • ${escapeHtml(delta)}</div>
    <div class="mt-2 text-xs text-slate-600 leading-6">قراءة سلوك سيولة مؤسسية محتمل (لا توصية شراء/بيع).</div>
  `;
}

function renderEarningsGrowthCard(data) {
  const eg = data?.earningsGrowth || {};
  if (!eg.available) {
    return `<div class="text-sm text-slate-500">غير متاح حالياً — يعتمد على بيانات ربع سنوية من المزود (قد لا تتوفر لبعض الرموز).</div>`;
  }
  const sig = escapeHtml(String(eg.signal || 'MIXED'));
  const rev = eg.revenue_yoy != null ? `${eg.revenue_yoy}%` : '—';
  const ni = eg.net_income_yoy != null ? `${eg.net_income_yoy}%` : '—';
  const eps = eg.eps_yoy != null ? `${eg.eps_yoy}%` : '—';
  return `
    <div class="flex items-center justify-between gap-2">
      <div class="text-sm">الإشارة: <span class="font-extrabold">${sig}</span></div>
      <div class="text-sm">الدرجة: <span class="font-extrabold">${escapeHtml(String(eg.score))}</span>/100</div>
    </div>
    <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
      <div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-slate-500">Revenue YoY</div><div class="font-extrabold">${escapeHtml(rev)}</div></div>
      <div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-slate-500">Net Income YoY</div><div class="font-extrabold">${escapeHtml(ni)}</div></div>
      <div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-slate-500">EPS YoY</div><div class="font-extrabold">${escapeHtml(eps)}</div></div>
    </div>
    <div class="mt-2 text-xs text-slate-600 leading-6">يُستخدم لتصفية الشركات ذات اتجاه نمو سلبي/متراجع (مخاطر أعلى).</div>
  `;
}

function renderProtectionFilters(data) {
  const inst = data?.institutionalFlow;
  const eg = data?.earningsGrowth;
  const items = [
    {
      key: 'institutional',
      title: '١) التدفق المؤسسي (Institutional Flow)',
      desc: 'يمزج بين SMF + اتجاه طويل (SMA200) + VWAP/دلتا سيولة Intraday (إن توفرت) + سياق الحجم لإشارة تجميع/تصريف.',
      value: inst?.available ? `${inst.signal === 'ACCUMULATION' ? '🟢 تجميع' : inst.signal === 'DISTRIBUTION' ? '🔴 تصريف' : '🟡 مختلط'} • ${inst.score}/100` : '— غير متاح',
    },
    {
      key: 'sector',
      title: '٢) تقييم قطاعي (Sector Valuation)',
      desc: 'يقارن P/E للسهم بمتوسط قطاعه (في v1.6 قد نستخدم متوسط عام إذا لم يتوفر قطاع).',
      value: data?.sectorValuation?.available ? `${data.sectorValuation.valuation} • P/E=${Number(data.sectorValuation.stockPE).toFixed(1)}` : '— غير متاح',
    },
    {
      key: 'hype',
      title: '٣) كشف التطبيل/الضجيج (Social Hype)',
      desc: 'يرصد كلمات تسويقية/مبالغات + خيار “ضجيج بدون إفصاح” لإطلاق تنبيه (A04/A06).',
      value: data?.alerts?.some(a => a.code === 'A06' || a.code === 'A04') ? '🟡 رصد ضجيج' : '🟢 طبيعي',
    },
    {
      key: 'earn',
      title: '٤) اتجاه نمو الأرباح/الإيرادات (Earnings Growth Trend)',
      desc: 'يرصد اتجاه النمو ربع السنوي (YoY) للإيرادات/الأرباح/الـEPS إن توفر. أقوى من مؤشرات الزخم البحتة لتصفية الشركات الخاسرة.',
      value: eg?.available
        ? `${eg.signal} • ${eg.score}/100${eg.revenue_yoy != null ? ` • RevYoY ${eg.revenue_yoy}%` : ''}`
        : (data?.earningsQuality?.available ? `Proxy: ${data.earningsQuality.flag} • ${data.earningsQuality.qualityScore}/100` : '— غير متاح'),
    },
    {
      key: 'vol',
      title: '٥) تجمّع شذوذ السيولة (Volume Anomaly)',
      desc: 'يرصد قفزات/جفاف غير طبيعي في الحجم مقارنة بالـ 60 يوم الأخيرة (z-score).',
      value: data?.volumeAnomaly?.available ? `${data.volumeAnomaly.flag} • z=${data.volumeAnomaly.z}` : '— غير متاح',
    },
  ];

  return `
    <div class="space-y-3">
      ${items.map(it => `
        <div class="p-3 rounded-2xl border border-slate-200 bg-slate-50">
          <div class="font-extrabold text-sm">${escapeHtml(it.title)}</div>
          <div class="text-xs text-slate-600 mt-1 leading-6">${escapeHtml(it.desc)}</div>
          <div class="text-sm mt-2">النتيجة: <span class="font-extrabold">${escapeHtml(String(it.value))}</span></div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderAlerts(container, rows, opts = {}) {
  container.innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-4">
      <div>
        <div class="text-xl font-extrabold">التنبيهات</div>
        <div class="text-sm text-slate-500">آخر 200 تنبيه محفوظة في قاعدة البيانات</div>
      </div>
      <a href="#/dashboard" class="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold">رجوع</a>
    </div>

    <div class="space-y-2">
      ${rows.length ? rows.map(a => `
        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-extrabold">${escapeHtml(a.title_ar)}</div>
              <div class="text-xs text-slate-500 mt-1">${escapeHtml(a.symbol)} • ${a.market === 'SA' ? 'سعودي' : 'أمريكي'} • ${new Date(a.created_at).toLocaleString('ar-SA')}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-extrabold px-2 py-1 rounded-full ${a.severity === 'HIGH' ? 'bg-rose-100 text-rose-800' : a.severity === 'MED' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'}">${escapeHtml(a.code)} • ${escapeHtml(a.severity)}</span>
              <a class="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold" href="#/details?symbol=${encodeURIComponent(a.symbol)}&market=${encodeURIComponent(a.market)}">تفاصيل</a>
            </div>
          </div>
          <div class="text-sm text-slate-600 mt-2">${escapeHtml(a.message_ar)}</div>
        </div>
      `).join('') : '<div class="text-sm text-slate-500">لا توجد تنبيهات حالياً. فعّل وضع تجريبي لرؤية A01-A04 فوراً.</div>'}
    </div>
  `;
}

export function renderSettings(container, model = null) {
  const providers = (model?.providers && model.providers.length) ? model.providers : [
    { id: 'yahoo_free', label: 'Yahoo Finance (مجاني/متأخر)', markets: ['US','SA'] },
    { id: 'alphavantage_free', label: 'AlphaVantage (مجاني محدود)', markets: ['US'] },
    { id: 'finnhub_paid', label: 'Finnhub (مدفوع/أدق)', markets: ['US'] },
    { id: 'demo', label: 'Demo (تجريبي)', markets: ['US','SA'] },
  ];
  const settings = model?.settings || { data_mode: 'free', provider_us: 'yahoo_free', provider_sa: 'yahoo_free', risk_profile: 'balanced', silent_mode: false, min_severity_to_show: 'MED' };
  const optionHtml = (market, selectedId) => providers
    .filter(p => (p.markets || []).includes(market))
    .map(p => `<option value="${escapeHtml(p.id)}" ${p.id===selectedId?'selected':''}>${escapeHtml(p.label)}</option>`)
    .join('');

  container.innerHTML = `
    <div class="text-xl font-extrabold mb-1">الإعدادات</div>
    <div class="text-sm text-slate-500 mb-4">اختيار مزوّد البيانات (مجاني/اشتراك) + معلومات التشغيل والأمن</div>

    <div class="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-sm">
      <div class="p-3 rounded-2xl bg-sky-50 border border-sky-200">
        <div class="font-extrabold mb-2">مزوّد البيانات</div>
        <div class="mt-3 p-3 rounded-2xl bg-white border border-slate-200">
          <div class="font-bold mb-1">وضع البيانات (Free / Pro)</div>
          <div class="grid md:grid-cols-2 gap-3 items-start">
            <label class="block">
              <div class="text-slate-600 mb-1">اختر وضع البيانات</div>
              <select id="ms_data_mode" class="w-full rounded-xl border border-slate-300 p-2 bg-white">
                <option value="free">🆓 مجاني (قد يكون متأخر — مناسب للاستثمار الهادئ)</option>
                <option value="pro">💳 مدفوع (أدق + Intraday للمضاربة عند توفر المفاتيح)</option>
              </select>
              <div class="text-xs text-slate-500 mt-1">المجاني يعتمد على Yahoo + بيانات مفتوحة (عامة). المدفوع يتطلب مفاتيح API في السيرفر.</div>
            </label>
            <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs leading-6">
              <div class="font-bold mb-1">معلومة</div>
              <div>سيظهر داخل نتائج التحليل: <span class="font-bold">مصدر البيانات</span> + <span class="font-bold">نوع التأخير</span> (EOD/Delayed/Intraday) لشفافية القرار.</div>
            </div>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <div class="text-slate-600 mb-1">السوق الأمريكي (US)</div>
            <select id="ms_provider_us" class="w-full rounded-xl border border-slate-300 p-2 bg-white">
              ${optionHtml('US', settings.provider_us)}
            </select>
          </label>
          <label class="block">
            <div class="text-slate-600 mb-1">السوق السعودي (SA)</div>
            <select id="ms_provider_sa" class="w-full rounded-xl border border-slate-300 p-2 bg-white">
              ${optionHtml('SA', settings.provider_sa)}
            </select>
          </label>
        </div>
        
        <div class="mt-4 border-t border-sky-200 pt-4">
          <div class="font-extrabold mb-2">مساعد القرار (Decision Support)</div>
          <div class="grid md:grid-cols-2 gap-3">
            <label class="block">
              <div class="text-slate-600 mb-1">نمط المخاطر</div>
              <select id="ms_risk_profile" class="w-full rounded-xl border border-slate-300 p-2 bg-white">
                <option value="conservative">محافظ (Conservative)</option>
                <option value="balanced">متوازن (Balanced)</option>
                <option value="aggressive">جريء (Aggressive)</option>
              </select>
              <div class="text-xs text-slate-500 mt-1">يؤثر على شدة شروط “Consider/Reduce Risk” داخل التطبيق.</div>
            </label>
          <div class="mt-3 p-3 rounded-2xl bg-white border border-slate-200">
            <div class="font-bold mb-2">وضع صامت (Silent Mode)</div>
            <div class="grid md:grid-cols-2 gap-3 items-start">
              <label class="flex items-center gap-2">
                <input id="ms_silent_mode" type="checkbox" class="w-4 h-4" />
                <span class="font-bold">إخفاء التنبيهات الضعيفة والتركيز على MED/HIGH</span>
              </label>
              <label class="block">
                <div class="text-slate-600 mb-1">أقل شدة تُعرض</div>
                <select id="ms_min_severity" class="w-full rounded-xl border border-slate-300 p-2 bg-white">
                  <option value="LOW">LOW</option>
                  <option value="MED">MED</option>
                  <option value="HIGH">HIGH</option>
                </select>
                <div class="text-xs text-slate-500 mt-1">هذا لا يوقف الحساب في الخلفية — فقط يقلل الإزعاج في العرض.</div>
              </label>
            </div>
          </div>

            <div class="p-3 rounded-2xl bg-white border border-slate-200">
              <div class="font-bold mb-1">ملاحظة</div>
              <div class="text-xs text-slate-600 leading-6">هذا القسم يساعدك على اتخاذ القرار بناءً على قواعد فلترة مخاطر، وليس توصية شراء/بيع.</div>
            </div>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2 items-center">
          <button id="ms_save_settings" class="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">حفظ</button>
          <button id="ms_test_us" class="px-4 py-2 rounded-xl bg-slate-900 text-white">اختبار US (AAPL)</button>
          <button id="ms_test_sa" class="px-4 py-2 rounded-xl bg-slate-900 text-white">اختبار SA (2222.SR)</button>
          <span id="ms_settings_status" class="text-slate-600"></span>
        </div>
        <div class="text-slate-600 mt-2">ملاحظة: المفاتيح (API Keys) — إن لزم — تُحفظ في Secrets/ENV فقط داخل السيرفر، ولا تُكتب داخل public/ نهائياً.</div>
      </div>

      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="font-extrabold">Security</div>
        <div class="text-slate-600 mt-1">أي مفاتيح API يجب أن تكون داخل Replit Secrets (أو متغيرات البيئة). ممنوع داخل ملفات الواجهة public/.</div>
      </div>

      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="font-extrabold">PostgreSQL</div>
        <div class="text-slate-600 mt-1">هذا الإصدار يتطلب DATABASE_URL فعلي. في Replit: أضف قاعدة Postgres أو اربط Neon، ثم ضع DATABASE_URL في Secrets.</div>
      </div>

      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="font-extrabold">مزوّد البيانات</div>
        <div class="text-slate-600 mt-1">v1.3 يدعم مزوّد مجاني افتراضي (Yahoo) مع حرية التبديل لاحقًا لمزوّد أدق (مدفوع) دون تغيير الواجهة.</div>
      </div>
    </div>
  `;

  // Apply selected values (after options render)
  const selUS = container.querySelector('#ms_provider_us');
  const selSA = container.querySelector('#ms_provider_sa');
  if (selUS) selUS.value = settings.provider_us || 'yahoo_free';
  if (selSA) selSA.value = settings.provider_sa || 'yahoo_free';
}

function fundCard(label, value) {
  const v = (value === null || value === undefined || Number.isNaN(Number(value))) ? '—' : fmtNumber(value, 2);
  return `
    <div class="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
      <div class="text-slate-600">${escapeHtml(label)}</div>
      <div class="font-extrabold text-lg">${escapeHtml(v)}</div>
    </div>
  `;
}

function renderBreakdown(b) {
  if (!b) {
    return '<div class="text-sm text-slate-500">غير متوفر في هذا التحليل.</div>';
  }
  const w = b.weights || {};
  const t = Number(b.technical);
  const f = Number(b.fundamentals);
  const s = Number(b.sentiment);
  return `
    <div class="grid sm:grid-cols-3 gap-3 text-sm">
      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="text-slate-600">تقني/سلوكي (T) • وزن ${(Number(w.technical || 0) * 100).toFixed(0)}%</div>
        <div class="font-extrabold text-lg">${fmtInt(t)} / 100</div>
      </div>
      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="text-slate-600">أساسي (F) • وزن ${(Number(w.fundamentals || 0) * 100).toFixed(0)}%</div>
        <div class="font-extrabold text-lg">${fmtInt(f)} / 100</div>
      </div>
      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="text-slate-600">مشاعر/خبر (S) • وزن ${(Number(w.sentiment || 0) * 100).toFixed(0)}%</div>
        <div class="font-extrabold text-lg">${fmtInt(s)} / 100</div>
      </div>
    </div>
    <div class="mt-3 text-sm text-slate-700">
      <span class="font-extrabold">المعادلة:</span> Trust = round( ${Number(w.technical || 0).toFixed(2)}×T + ${Number(w.fundamentals || 0).toFixed(2)}×F + ${Number(w.sentiment || 0).toFixed(2)}×S )
    </div>
  `;
}

function renderSnapshotsTable(rows) {
  if (!rows || !rows.length) {
    return '<div class="text-sm text-slate-500">لا يوجد سجل لقطات بعد. اضغط إعادة التحليل أو استخدم وضع Demo.</div>';
  }

  const cards = rows.map(r => `
    <div class="bg-white border border-slate-200 rounded-2xl p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="text-xs text-slate-500">${escapeHtml(new Date(r.as_of).toLocaleString('ar-SA'))}</div>
        <div class="text-sm font-extrabold">${fmtNumber(r.price, 2)}</div>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div class="bg-slate-50 rounded-xl p-2"><span class="font-bold">التغير%</span> ${fmtNumber(r.change_percent, 2)}</div>
        <div class="bg-slate-50 rounded-xl p-2"><span class="font-bold">Trust</span> ${fmtInt(r.trust_score)} • ${escapeHtml(r.traffic || '')}</div>
        <div class="bg-slate-50 rounded-xl p-2"><span class="font-bold">RSI</span> ${fmtNumber(r.rsi14, 1)}</div>
        <div class="bg-slate-50 rounded-xl p-2"><span class="font-bold">SMA20</span> ${fmtNumber(r.sma20, 2)}</div>
        <div class="bg-slate-50 rounded-xl p-2"><span class="font-bold">VolRatio</span> ${fmtNumber(r.vol_ratio20, 2)}</div>
        <div class="bg-slate-50 rounded-xl p-2"><span class="font-bold">الحجم</span> ${fmtInt(r.volume || 0)}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="md:hidden space-y-3">${cards}</div>

    <div class="hidden md:block overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="p-2">الوقت</th>
            <th class="p-2">السعر</th>
            <th class="p-2">% التغير</th>
            <th class="p-2">RSI</th>
            <th class="p-2">SMA20</th>
            <th class="p-2">VolRatio</th>
            <th class="p-2">Trust</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="border-t border-slate-100">
              <td class="p-2 text-slate-500">${escapeHtml(new Date(r.as_of).toLocaleString('ar-SA'))}</td>
              <td class="p-2">${fmtNumber(r.price, 2)}</td>
              <td class="p-2">${fmtNumber(r.change_percent, 2)}</td>
              <td class="p-2">${fmtNumber(r.rsi14, 1)}</td>
              <td class="p-2">${fmtNumber(r.sma20, 2)}</td>
              <td class="p-2">${fmtNumber(r.vol_ratio20, 2)}</td>
              <td class="p-2">${fmtInt(r.trust_score)} • ${escapeHtml(r.traffic || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderReasonsByAxis(b) {
  if (!b) return '';
  const section = (title, arr) => {
    if (!arr || !arr.length) return '';
    return `
      <div class="mt-3">
        <div class="text-sm font-extrabold text-slate-700">${escapeHtml(title)}</div>
        <ul class="list-disc pr-6 text-sm text-slate-600 leading-7">
          ${arr.map(x => `<li>${escapeHtml(x)}</li>`).join('')}
        </ul>
      </div>
    `;
  };
  return `
    <div class="text-xs text-slate-500">(v1.6) تفصيل الأسباب حسب المحاور</div>
    ${section('تقني/سلوكي', b.technical)}
    ${section('أساسي', b.fundamentals)}
    ${section('مشاعر/خبر', b.sentiment)}
    ${section('تنبيهات', b.alerts)}
    <hr class="my-3" />
  `;
}

export function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


export function renderScreener(container) {
  container.innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-4">
      <div>
        <div class="text-xl font-extrabold">ماسح خارجي</div>
        <div class="text-sm text-slate-500">استخدم أدوات مسح خارجية ثم حلّل الرموز داخل Market Sentinel (بدون جلب بيانات مباشر من المواقع الخارجية).</div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-4">
      <div class="bg-white border border-slate-200 rounded-2xl p-4">
        <div class="font-extrabold mb-2">فتح ماسح الأسهم (Investing.com)</div>
        <div class="text-sm text-slate-600 leading-7 mb-3">
          يفتح الماسح في تبويب جديد. بعد اختيار الأسهم، انسخ الرمز وألصقه في خانة البحث داخل التطبيق للتحليل.
        </div>
        <a class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white font-extrabold text-sm"
           href="https://sa.investing.com/stock-screener" target="_blank" rel="noopener">
          فتح Investing.com Screener ↗
        </a>
        <div class="text-xs text-slate-500 mt-3">
          ملاحظة: لا نعتمد على Investing.com كمصدر بيانات مباشر (لا يوجد Public API رسمي عام)، لذلك نستخدمه كأداة مسح خارجية فقط.
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-2xl p-4">
        <div class="font-extrabold mb-2">استيراد قائمة رموز من CSV</div>
        <div class="text-sm text-slate-600 leading-7 mb-3">
          إذا كان الماسح يتيح تنزيل CSV، ارفعه هنا. يدعم أعمدة شائعة مثل: <span class="font-bold">Symbol / Ticker</span>.
        </div>

        <div class="flex flex-col gap-3">
          <input id="ms_csv_file" type="file" accept=".csv,text/csv" class="block w-full text-sm"/>
          <button id="ms_csv_import" class="px-4 py-2 rounded-xl bg-emerald-600 text-white font-extrabold text-sm">استيراد الرموز</button>
          <div id="ms_csv_out" class="mt-2"></div>
        </div>
      </div>
    </div>
  `;
}


function renderDecisionCard(data) {
  const d = data?.decision || null;
  if (!d) {
    return `<div class="text-sm text-slate-500">لا توجد خطة قرار جاهزة لهذا السهم.</div>`;
  }
  const badge = decisionBadgeAction(d.action);
  const fmt = (x) => (x === null || x === undefined) ? '—' : Number(x).toLocaleString('ar-SA', { maximumFractionDigits: 2 });
  const sr = data?.sr || {};
  const notes = Array.isArray(d.notes) ? d.notes.slice(0, 8) : [];
  const ad = adaptDecisionLevels(data);
  return `
    <div class="grid md:grid-cols-2 gap-3">
      <div class="p-3 rounded-2xl border border-slate-200 bg-slate-50">
        <div class="flex items-center justify-between">
          <div class="font-extrabold">القرار</div>
          ${badge}
        </div>
        <div class="text-xs text-slate-500 mt-1">الثقة: <span class="font-bold">${fmt(d.confidence)}</span>/100</div>
        <div class="grid grid-cols-3 gap-2 mt-3 text-sm">
          <div class="p-2 rounded-xl bg-white border border-slate-200">
            <div class="text-xs text-slate-500">دخول</div>
            <div class="font-extrabold">${fmt(ad.entry)}</div>
          </div>
          <div class="p-2 rounded-xl bg-white border border-slate-200">
            <div class="text-xs text-slate-500">وقف</div>
            <div class="font-extrabold">${fmt(ad.stop)}</div>
          </div>
          <div class="p-2 rounded-xl bg-white border border-slate-200">
            <div class="text-xs text-slate-500">هدف</div>
            <div class="font-extrabold">${fmt(ad.target1)}</div>
          </div>
        </div>
        <div class="mt-2 p-2 rounded-xl bg-white border border-slate-200">

        <div class="mt-2 p-2 rounded-xl bg-slate-50 border border-slate-200">
          <div class="text-xs font-extrabold text-slate-700 mb-1">خطة تنفيذ (TRIM/TP/TS)</div>
          ${renderExecutionPlan(data)}
        </div>

          <div class="flex items-center justify-between">
            <div class="text-xs text-slate-500">حجم مركز مقترح</div>
            <div class="text-xs font-extrabold">${ad.position.label} (${ad.position.pct}%)</div>
          </div>
          <div class="text-[11px] text-slate-600 mt-1">${escapeHtml(ad.note)} — Volatility: ${ad.volScore}/100</div>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-2 text-sm">
          <div class="p-2 rounded-xl bg-white border border-slate-200">
            <div class="text-xs text-slate-500">دعم</div>
            <div class="font-extrabold">${fmt(sr.support ?? d.support)}</div>
          </div>
          <div class="p-2 rounded-xl bg-white border border-slate-200">
            <div class="text-xs text-slate-500">مقاومة</div>
            <div class="font-extrabold">${fmt(sr.resistance ?? d.resistance)}</div>
          </div>
        </div>
      </div>

      <div class="md:col-span-2 p-3 rounded-2xl border border-slate-200 bg-slate-50">
        <div class="font-extrabold mb-2">السيناريوهين (Best / Worst) + Risk/Reward</div>
        ${renderBullBearScenarios(data)}
      </div>
    </div>
  `;
}

function decisionBadgeAction(action) {
  const a = String(action || '').toUpperCase();
  const map = {
    ENTER: { t: '🟢 دخول', cls: 'bg-emerald-600' },
    ADD: { t: '🟢 تعزيز', cls: 'bg-emerald-600' },
    HOLD: { t: '🟡 احتفاظ', cls: 'bg-amber-500' },
    WATCH: { t: '🟡 مراقبة', cls: 'bg-amber-500' },
    TRIM: { t: '🟠 تخفيف', cls: 'bg-orange-600' },
    EXIT: { t: '🔴 خروج', cls: 'bg-rose-600' },
    AVOID: { t: '🔴 تجنّب', cls: 'bg-rose-600' },
  };
  const x = map[a] || { t: '—', cls: 'bg-slate-500' };
  return `<span class="px-3 py-1 rounded-xl text-white text-xs font-extrabold ${x.cls}">${x.t}</span>`;
}



function createTooltip(host) {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.zIndex = '20';
  el.style.top = '8px';
  el.style.left = '8px';
  el.style.padding = '8px 10px';
  el.style.border = '1px solid #e2e8f0';
  el.style.borderRadius = '12px';
  el.style.background = 'rgba(255,255,255,0.95)';
  el.style.boxShadow = '0 4px 14px rgba(15,23,42,0.08)';
  el.style.fontSize = '12px';
  el.style.color = '#0f172a';
  el.style.pointerEvents = 'none';
  el.innerHTML = '—';
  host.style.position = 'relative';
  host.appendChild(el);
  return el;
}

function fmtAr(x) {
  if (x === null || x === undefined || !Number.isFinite(Number(x))) return '—';
  return Number(x).toLocaleString('ar-SA', { maximumFractionDigits: 2 });
}

function combineMarkers(alertMarkers, data, series) {
  const out = [...(alertMarkers || [])];
  const d = data?.decision || null;
  if (!d || !series?.length) return out;
  const lastTime = series[series.length - 1].time;
  const push = (price, code, color, text) => {
    if (price === null || price === undefined || !Number.isFinite(Number(price))) return;
    out.push({
      time: lastTime,
      position: 'belowBar',
      color,
      shape: 'arrowUp',
      text: code,
    });
  };
  push(d.entry, 'IN', '#10b981');
  push(d.stop, 'SL', '#ef4444');
  push(d.target1, 'TP', '#0ea5e9');
  return out;
}


function buildEventMap(data, series) {
  const map = new Map();
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
  if (!alerts.length || !series.length) return map;

  const times = series.map(x => x.time);
  const closestTime = (epochSec) => {
    if (!epochSec) return times[times.length - 1];
    let lo = 0, hi = times.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (times[mid] < epochSec) lo = mid + 1; else hi = mid;
    }
    const t1 = times[lo];
    const t0 = times[Math.max(0, lo - 1)];
    return (Math.abs(t1 - epochSec) < Math.abs(epochSec - t0)) ? t1 : t0;
  };

  const toEpoch = (t) => {
    if (!t) return null;
    if (typeof t === 'number') return Math.floor(t / (t > 1e12 ? 1000 : 1));
    const d = new Date(t);
    const ms = d.getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  };

  for (const a of alerts) {
    const epoch = toEpoch(a.at);
    const key = closestTime(epoch);
    const arr = map.get(key) || [];
    arr.push(a);
    map.set(key, arr);
  }
  return map;
}

function findNearestEvent(map, time, toleranceSec = 0) {
  // Here we map to exact candle times; so exact match is expected.
  if (map.has(time)) return { time, alerts: map.get(time) };
  if (toleranceSec <= 0) return null;
  // tolerance search (rare)
  let best = null;
  for (const [t, alerts] of map.entries()) {
    const d = Math.abs(Number(t) - Number(time));
    if (d <= toleranceSec && (!best || d < best.d)) best = { time: t, alerts, d };
  }
  return best ? { time: best.time, alerts: best.alerts } : null;
}

function renderEventPanel(container, time, alerts, series) {
  const panel = container.querySelector('#ms_event_panel');
  if (!panel) return;
  const dateStr = (() => {
    try { return new Date(Number(time) * 1000).toLocaleString('ar-SA'); } catch (_) { return '—'; }
  })();
  const items = (alerts || []).slice(0, 6).map(a => {
    const code = String(a.code || '').toUpperCase();
    const sev = String(a.severity || a.level || '').toUpperCase();
    const title = a.title_ar || a.title || code;
    const msg = a.message_ar || a.message || '';
    const badge = (sev === 'HIGH') ? 'bg-rose-600' : (sev === 'MED') ? 'bg-amber-500' : 'bg-slate-500';
    return `
      <div class="p-3 rounded-2xl border border-slate-200 bg-white">
        <div class="flex items-center justify-between gap-2">
          <div class="font-extrabold">${escapeHtml(title)}</div>
          <span class="px-3 py-1 rounded-xl text-white text-xs font-extrabold ${badge}">${code}</span>
        </div>
        <div class="text-sm text-slate-700 leading-7 mt-2">${escapeHtml(msg)}</div>
      </div>
    `;
  }).join('');

  panel.innerHTML = `
    <div class="p-3 rounded-2xl border border-slate-200 bg-slate-50">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="font-extrabold">تفاصيل الإشارة على الشارت</div>
          <div class="text-xs text-slate-500">وقت الشمعة: ${escapeHtml(dateStr)}</div>
        </div>
        <button id="ms_evt_close" class="px-3 py-1 rounded-xl border border-slate-200 bg-white text-sm font-bold">إغلاق</button>
      </div>
      <div class="grid gap-2 mt-3">${items || '<div class="text-sm text-slate-500">—</div>'}</div>
      <div class="text-xs text-slate-500 mt-2">اضغط على أي إشارة (A01..A05) على الشارت لعرض تفسيرها.</div>
    </div>
  `;
  panel.classList.remove('hidden');
  const btn = panel.querySelector('#ms_evt_close');
  if (btn) btn.onclick = () => panel.classList.add('hidden');
}



function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function gaugeSvg({ label, value, color, sub }) {
  const v = Number(value);
  const pct = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const rest = c - dash;
  return `
  <div class="flex items-center gap-3">
    <svg width="86" height="86" viewBox="0 0 86 86" class="shrink-0">
      <circle cx="43" cy="43" r="${r}" fill="none" stroke="rgba(226,232,240,1)" stroke-width="10" />
      <circle cx="43" cy="43" r="${r}" fill="none" stroke="${color}" stroke-width="10"
              stroke-linecap="round"
              stroke-dasharray="${dash} ${rest}"
              transform="rotate(-90 43 43)" />
      <text x="43" y="45" text-anchor="middle" font-size="16" font-weight="800" fill="#0f172a">${Math.round(pct)}%</text>
    </svg>
    <div class="min-w-0">
      <div class="font-extrabold">${escapeHtml(label)}</div>
      <div class="text-sm text-slate-600 leading-6">${escapeHtml(sub || '—')}</div>
    </div>
  </div>`;
}

function computeEarlyWarning(data) {
  // 0..100 higher = more warning
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
  const high = alerts.filter(a => String(a.severity || a.level || '').toUpperCase() === 'HIGH').length;
  const hasDivergence = alerts.some(a => String(a.code || '').toUpperCase() === 'A02');
  const hasVolumeTrap = alerts.some(a => String(a.code || '').toUpperCase() === 'A01');
  const hasSmartMoney = alerts.some(a => String(a.code || '').toUpperCase() === 'A05');
  const rsi14 = Number(data?.indicators?.rsi14);
  const price = Number(data?.quote?.price);
  const sma200 = Number(data?.indicators?.sma200);

  let score = 0;
  score += Math.min(40, high * 15);
  if (hasDivergence) score += 18;
  if (hasVolumeTrap) score += 12;
  if (hasSmartMoney) score += 16;
  if (Number.isFinite(price) && Number.isFinite(sma200) && price < sma200) score += 18;
  if (Number.isFinite(rsi14) && rsi14 < 45) score += 8; // ضعف زخم نسبي
  score = Math.max(0, Math.min(100, score));
  let tag = 'LOW';
  if (score >= 70) tag = 'HIGH';
  else if (score >= 40) tag = 'MED';
  return { score, tag };
}

function computeExhaustion(data) {
  // 0..100 higher = more exhaustion (risk of pullback)
  const rsi14 = Number(data?.indicators?.rsi14);
  const price = Number(data?.quote?.price);
  const sma20 = Number(data?.indicators?.sma20);
  const volRatio = Number(data?.indicators?.vol_ratio20);
  const resistance = Number(data?.sr?.resistance ?? data?.decision?.resistance);

  let score = 0;
  if (Number.isFinite(rsi14)) {
    if (rsi14 >= 75) score += 35;
    else if (rsi14 >= 70) score += 25;
    else if (rsi14 >= 65) score += 12;
  }
  if (Number.isFinite(price) && Number.isFinite(sma20) && sma20 > 0) {
    const pct = ((price - sma20) / sma20) * 100;
    if (pct >= 20) score += 35;
    else if (pct >= 15) score += 25;
    else if (pct >= 10) score += 12;
  }
  if (Number.isFinite(volRatio)) {
    if (volRatio >= 2.0) score += 20;
    else if (volRatio >= 1.5) score += 12;
  }
  if (Number.isFinite(price) && Number.isFinite(resistance) && resistance > 0) {
    const dist = Math.abs(resistance - price) / resistance;
    if (dist <= 0.01) score += 12;
    else if (dist <= 0.02) score += 7;
  }
  score = Math.max(0, Math.min(100, score));
  let tag = 'NORMAL';
  if (score >= 70) tag = 'HIGH';
  else if (score >= 40) tag = 'MED';
  return { score, tag };
}

function computeConfidenceComposite(data) {
  // Start from trust score and adjust by warnings/exhaustion; 0..100
  const base = Number(data?.score);
  const t = Number.isFinite(base) ? base : 50;
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);

  // penalties
  const penalty = (ew.score * 0.35) + (ex.score * 0.25);
  // bonus: if strong confluence signals in decision
  const reasons = Array.isArray(data?.reasons) ? data.reasons.length : 0;
  const bonus = Math.min(10, reasons * 1.2);
  let conf = t - penalty + bonus;

  // market regime effect (adds stability in Bullish, tightens in Risk-Off)
  const mr = data?.marketRegime;
  const mrReg = String(mr?.regime || '').toUpperCase();
  const mrScore = Number(mr?.score);
  if (mrReg === 'BULLISH') conf += 6;
  else if (mrReg === 'SIDEWAYS') conf -= 3;
  else if (mrReg === 'RISK_OFF') conf -= 10;
  if (Number.isFinite(mrScore)) conf += (mrScore - 50) * 0.06;
  conf = Math.max(0, Math.min(100, conf));
  return { score: conf };
}

function renderDecisionGauges(data) {
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);
  const cc = computeConfidenceComposite(data);

  const ewColor = (ew.tag === 'HIGH') ? '#ef4444' : (ew.tag === 'MED') ? '#f59e0b' : '#10b981';
  const exColor = (ex.tag === 'HIGH') ? '#ef4444' : (ex.tag === 'MED') ? '#f59e0b' : '#10b981';
  const ccColor = (cc.score >= 75) ? '#10b981' : (cc.score >= 50) ? '#f59e0b' : '#ef4444';

  const ewSub = ew.tag === 'HIGH' ? 'تحذير انعكاس مبكر قوي' : ew.tag === 'MED' ? 'إشارة انعكاس محتملة' : 'مستقر حالياً';
  const exSub = ex.tag === 'HIGH' ? 'إجهاد مرتفع (احتمال جني أرباح)' : ex.tag === 'MED' ? 'إجهاد متوسط' : 'إجهاد منخفض';
  const ccSub = cc.score >= 75 ? 'ثقة مركبة عالية' : cc.score >= 50 ? 'ثقة مركبة متوسطة' : 'ثقة مركبة منخفضة';

  return `
    <div class="grid gap-3">
      ${gaugeSvg({ label: 'Market Confidence', value: cc.score, color: ccColor, sub: ccSub })}
      ${gaugeSvg({ label: 'Early Warning', value: ew.score, color: ewColor, sub: ewSub })}
      ${gaugeSvg({ label: 'Exhaustion', value: ex.score, color: exColor, sub: exSub })}
      <div class="text-xs text-slate-500 leading-6">
        ملخص سريع: ${escapeHtml(generateGaugeSummary(data))}\n        * هذه عدادات تفسيرية تساعد على قوة القرار (بدون توصيات شراء/بيع مباشرة).
      </div>
    </div>
  `;
}


function computeRiskReward(entry, stop, target) {
  const e = Number(entry), s = Number(stop), t = Number(target);
  if (!Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(t)) return null;
  const risk = e - s;
  const reward = t - e;
  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

function computeBullBearProbabilities(data) {
  // Use the same gauges logic (EarlyWarning + Exhaustion + base score) to produce bull/bear probabilities.
  const base = Number(data?.score);
  const t = Number.isFinite(base) ? base : 50;
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);

  // bull score favors high trust, low warning, low exhaustion
  let bull = (t * 0.55) + ((100 - ew.score) * 0.25) + ((100 - ex.score) * 0.20);

  // Market Regime adjustment
  const mr = data?.marketRegime;
  const mrReg = String(mr?.regime || '').toUpperCase();
  const mrScore = Number(mr?.score);
  if (mrReg === 'BULLISH') bull += 8;
  else if (mrReg === 'SIDEWAYS') bull -= 4;
  else if (mrReg === 'RISK_OFF') bull -= 12;
  // fine-tune with regime score (centered at 50)
  if (Number.isFinite(mrScore)) bull += (mrScore - 50) * 0.08;
  // adjust by market relative strength if available
  const rs = data?.relativeStrength;
  const rsTag = String(rs?.label || rs?.status || '').toLowerCase();
  if (rsTag.includes('out') || rsTag.includes('تفوق')) bull += 6;
  if (rsTag.includes('under') || rsTag.includes('أضعف')) bull -= 6;

  bull = Math.max(0, Math.min(100, bull));
  const bear = 100 - bull;
  return { bull: Math.round(bull), bear: Math.round(bear) };
}

function explainWhyProb(data) {
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);
  const reasons = [];
  if (ew.tag === 'LOW') reasons.push('لا توجد إشارات انعكاس مبكر قوية');
  if (ew.tag === 'MED') reasons.push('هناك إشارات انعكاس محتملة — راقب الكسر/الارتداد');
  if (ew.tag === 'HIGH') reasons.push('تحذير انعكاس مبكر قوي — الحذر واجب');
  if (ex.tag === 'HIGH') reasons.push('إجهاد مرتفع — احتمال جني أرباح/تصحيح');
  if (ex.tag === 'MED') reasons.push('إجهاد متوسط — لا تدخل متأخراً');
  if (ex.tag === 'NORMAL') reasons.push('إجهاد منخفض — مجال حركة أفضل');
  const rs = data?.relativeStrength;
  const rsLabel = rs?.label || rs?.status || '';
  if (rsLabel) reasons.push(`القوة النسبية: ${rsLabel}`);
  return reasons.slice(0, 4);
}

function renderBullBearScenarios(data) {
  const d = data?.decision || {};
  const ad = adaptDecisionLevels(data);
  const sr = data?.sr || {};
  const fmt = (x) => (x === null || x === undefined) ? '—' : Number(x).toLocaleString('ar-SA', { maximumFractionDigits: 2 });
  const probs = computeBullBearProbabilities(data);
  const rr = computeRiskReward(ad.entry, ad.stop, ad.target1);
  const rrText = rr ? rr.toLocaleString('ar-SA', { maximumFractionDigits: 2 }) : '—';
  const why = explainWhyProb(data);

  // Worst-case levels: if support breaks, next is support - (resistance-support)*0.5 as heuristic
  const support = Number(sr.support ?? d.support);
  const resistance = Number(sr.resistance ?? d.resistance);
  let downside = null;
  if (Number.isFinite(support) && Number.isFinite(resistance)) {
    downside = support - Math.max(0, (resistance - support) * 0.5);
  } else if (Number.isFinite(support)) {
    downside = support * 0.95;
  }

  return `
    <div class="grid md:grid-cols-3 gap-3">
      <div class="p-3 rounded-2xl border border-slate-200 bg-white">
        <div class="font-extrabold mb-1">أفضل حالة (Bull)</div>
        <div class="text-xs text-slate-500">احتمال: <span class="font-extrabold">${probs.bull}%</span></div>
        <div class="grid grid-cols-3 gap-2 mt-3 text-sm">
          <div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-xs text-slate-500">Entry</div><div class="font-extrabold">${fmt(ad.entry)}</div></div>
          <div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-xs text-slate-500">Stop</div><div class="font-extrabold">${fmt(ad.stop)}</div></div>
          <div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-xs text-slate-500">Target</div><div class="font-extrabold">${fmt(ad.target1)}</div></div>
        </div>
        <div class="text-xs text-slate-600 mt-2">R/R: <span class="font-extrabold">${rrText}</span></div>
      </div>

      <div class="p-3 rounded-2xl border border-slate-200 bg-white">
        <div class="font-extrabold mb-1">أسوأ حالة (Bear)</div>
        <div class="text-xs text-slate-500">احتمال: <span class="font-extrabold">${probs.bear}%</span></div>
        <div class="grid grid-cols-2 gap-2 mt-3 text-sm">
          <div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-xs text-slate-500">Trigger</div><div class="font-extrabold">كسر الدعم</div></div>
          <div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-xs text-slate-500">Downside</div><div class="font-extrabold">${fmt(downside)}</div></div>
        </div>
        <div class="text-xs text-slate-600 mt-2">إجراء: <span class="font-extrabold">${bearActionText(data)}</span></div>
      </div>

      <div class="p-3 rounded-2xl border border-slate-200 bg-white">
        <div class="font-extrabold mb-2">لماذا هذه الاحتمالات؟</div>
        <ul class="list-disc pr-5 text-sm text-slate-700 leading-7">
          ${why.map(x => `<li>${escapeHtml(x)}</li>`).join('') || '<li>—</li>'}
        </ul>
        <div class="text-xs text-slate-500 mt-2">* الاحتمالات “ترجيح منطقي” مبني على توافق الأدلة، وليست تنبؤًا يقينيًا.</div>
      </div>
    </div>
  `;
}


function generateGaugeSummary(data) {
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);
  const cc = computeConfidenceComposite(data);
  // concise Arabic summary line
  const conf = cc.score >= 75 ? 'ثقة عالية' : cc.score >= 50 ? 'ثقة متوسطة' : 'ثقة منخفضة';
  const warn = ew.tag === 'HIGH' ? 'تحذير انعكاس قوي' : ew.tag === 'MED' ? 'تحذير انعكاس محتمل' : 'لا تحذير قوي';
  const exh = ex.tag === 'HIGH' ? 'إجهاد مرتفع' : ex.tag === 'MED' ? 'إجهاد متوسط' : 'إجهاد منخفض';
  const mr = data?.marketRegime;
  const reg = String(mr?.regime || '').toUpperCase();
  const regAr = reg==='BULLISH' ? 'سوق صاعد' : reg==='RISK_OFF' ? 'سوق دفاعي' : reg==='SIDEWAYS' ? 'سوق متذبذب' : 'سوق غير معروف';
  return `${conf} — ${warn} — ${exh} — ${regAr}`;
}


function renderMarketRegimeBanner(data){
  const r = data?.marketRegime;
  if(!r) return '';
  let color='bg-slate-200 text-slate-700';
  let label='حيادي';
  if(r.regime==='BULLISH'){color='bg-emerald-100 text-emerald-700';label='سوق صاعد';}
  if(r.regime==='RISK_OFF'){color='bg-rose-100 text-rose-700';label='سوق دفاعي / خطر';}
  return `<div class="mb-4 p-3 rounded-2xl ${color} border border-slate-200">
    <div class="font-extrabold">حالة السوق: ${label}</div>
    <div class="text-xs mt-1">Market Regime Score: ${r.score}/100</div>
  </div>`;
}


function renderRegimeDecisionHint(data){
  const mr = data?.marketRegime;
  if(!mr) return '';
  const reg = String(mr.regime || '').toUpperCase();
  let badge='bg-slate-100 text-slate-700';
  let text='تعديل حسب حالة السوق: حيادي';
  if(reg==='BULLISH'){badge='bg-emerald-100 text-emerald-700';text='تعديل حسب حالة السوق: صاعد (مرونة أعلى للدخول)';}
  if(reg==='SIDEWAYS'){badge='bg-amber-100 text-amber-700';text='تعديل حسب حالة السوق: تذبذب (شروط دخول أشد)';}
  if(reg==='RISK_OFF'){badge='bg-rose-100 text-rose-700';text='تعديل حسب حالة السوق: دفاعي/خطر (تفضيل التخفيف والحماية)';}
  return `<div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold ${badge} border border-slate-200 mb-2">${escapeHtml(text)}</div>`;
}


function adaptDecisionLevels(data) {
  const d = data?.decision || {};
  const mr = data?.marketRegime || {};
  const mrReg = String(mr.regime || '').toUpperCase();

  const base = {
    entry: Number(d.entry),
    stop: Number(d.stop),
    target1: Number(d.target1),
  };

  // Volatility proxy (0..100) based on abs daily change + exhaustion + early warning
  const ch = Math.abs(Number(data?.quote?.changePercent));
  const volRatio = Number(data?.indicators?.vol_ratio20);
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);

  let volScore = 0;
  if (Number.isFinite(ch)) volScore += Math.min(60, ch * 10);
  if (Number.isFinite(volRatio)) volScore += Math.max(0, Math.min(25, (volRatio - 1) * 20));
  volScore += ew.score * 0.10;
  volScore += ex.score * 0.10;
  volScore = Math.max(0, Math.min(100, volScore));

  // If base levels missing, return as-is
  if (!Number.isFinite(base.entry) || !Number.isFinite(base.stop) || !Number.isFinite(base.target1)) {
    return { ...base, volScore, note: '—', position: { pct: 0, label: '—' } };
  }

  // Adjustments by regime
  let entry = base.entry;
  let stop = base.stop;
  let target1 = base.target1;
  let note = 'بدون تعديل';

  if (mrReg === 'BULLISH') {
    // allow a bit more room + slightly higher target
    stop = stop * 0.995;       // widen stop by 0.5%
    target1 = target1 * 1.01;  // extend target by 1%
    note = 'سوق صاعد: مرونة أعلى (Stop أوسع قليلاً + Target أعلى)';
  } else if (mrReg === 'SIDEWAYS') {
    // tighten risk, lower target
    stop = stop * 1.005;       // tighten stop by 0.5% (closer)
    target1 = target1 * 0.995; // slightly lower target
    note = 'سوق متذبذب: شروط أشد (Stop أقرب + Target أقل)';
  } else if (mrReg === 'RISK_OFF') {
    // defensive: prefer pullback entry + tight stop + conservative target
    entry = entry * 0.995;     // wait for pullback
    stop = stop * 1.01;        // tighter stop
    target1 = target1 * 0.99;  // conservative target
    note = 'سوق دفاعي: حماية أعلى (Entry أقل + Stop أقرب + Target محافظ)';
  }

  // Position size suggestion (0..100% of planned allocation)
  let pct = 60;
  if (mrReg === 'BULLISH') pct += 15;
  if (mrReg === 'SIDEWAYS') pct -= 10;
  if (mrReg === 'RISK_OFF') pct -= 30;

  // penalize for volatility / warnings / exhaustion
  pct -= (volScore * 0.25);     // up to -25
  pct -= (ew.score * 0.15);     // up to -15
  pct -= (ex.score * 0.10);     // up to -10

  pct = Math.max(10, Math.min(85, Math.round(pct)));

  let label = 'متوسط';
  if (pct >= 70) label = 'عالي';
  else if (pct <= 35) label = 'خفيف';

  return {
    entry, stop, target1,
    volScore: Math.round(volScore),
    note,
    position: { pct, label }
  };
}


function ownerDecisionOverride(data, fd){
  const owned = !!data?.position?.owned;
  const exposure = String(data?.position?.exposure || 'MED').toUpperCase(); // LOW/MED/HIGH
  const mr = data?.marketRegime || {};
  const mrReg = String(mr.regime || '').toUpperCase();

  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);
  const conf = computeConfidenceComposite(data);
  const trust = Number(data?.score);
  const traffic = String(data?.traffic || '').toUpperCase();

  const riskHigh = (ew.score >= 70) || (ex.score >= 70) || (mrReg === 'RISK_OFF') || traffic === 'RED';
  const riskMed  = (ew.score >= 40) || (ex.score >= 40) || (mrReg === 'SIDEWAYS') || traffic === 'YELLOW';

  // base action from engine
  const baseAction = String(fd?.action || '').toUpperCase();

  // If user does NOT own the stock, never show TRIM/EXIT as primary; use WAIT/AVOID instead
  if (!owned) {
    if (baseAction === 'TRIM' || baseAction === 'EXIT') {
      return { action: riskHigh ? 'AVOID' : 'WAIT', label: riskHigh ? 'ابتعد' : 'انتظار', note: 'لأنك لا تملك السهم: نعرض قرار دخول/انتظار بدل تخفيف/خروج.' };
    }
    return { action: baseAction, label: null, note: null };
  }

  // Owned logic: TRIM vs EXIT depends on exposure and risk
  if (owned) {
    if (riskHigh) {
      const a = (exposure === 'HIGH') ? 'EXIT' : 'TRIM';
      const l = (a === 'EXIT') ? 'خروج' : 'تخفيف';
      const note = (a === 'EXIT')
        ? 'مخاطر عالية + تعرض عالي: الأفضل حماية رأس المال (خروج).'
        : 'مخاطر عالية: يفضّل تخفيف المركز وتقليل الانكشاف.';
      return { action: a, label: l, note };
    }
    if (riskMed) {
      if (exposure === 'HIGH') return { action: 'TRIM', label: 'تخفيف', note: 'مخاطر متوسطة + تعرض عالي: تخفيف جزئي لتقليل التذبذب.' };
      // Keep HOLD_CAUTION if original is aggressive
      if (baseAction === 'ADD' || baseAction === 'ADD_STRONG' || baseAction === 'ENTER') {
        return { action: 'HOLD_CAUTION', label: 'احتفاظ بحذر', note: 'مخاطر متوسطة: لا نعزز بقوة—نراقب الإشارات.' };
      }
    }
    // Low risk: allow ADD / HOLD; but if already high exposure, cap to HOLD
    if (exposure === 'HIGH' && (baseAction === 'ADD' || baseAction === 'ADD_STRONG')) {
      return { action: 'HOLD_STRONG', label: 'احتفاظ قوي', note: 'تعرضك عالي: نكتفي بالاحتفاظ بدل زيادة المخاطرة.' };
    }
  }

  // default: no override
  return { action: baseAction, label: null, note: null };
}

function riskManagementRecommendation(data){
  const owned = !!data?.position?.owned;
  const exp = String(data?.position?.exposure || 'MED').toUpperCase();
  const mr = String(data?.marketRegime?.regime || '').toUpperCase();
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);
  const ad = adaptDecisionLevels(data);

  const tips = [];

  // Stop management
  if (Number.isFinite(ad.stop) && Number.isFinite(ad.entry)) {
    tips.push(`وقف الخسارة المقترح: ${Number(ad.stop).toLocaleString('ar-SA',{maximumFractionDigits:2})}`);
  }
  if (mr === 'RISK_OFF') tips.push('حالة سوق دفاعية: قلل حجم المركز وتجنب التعزيز المتأخر.');
  if (ew.tag === 'HIGH') tips.push('تحذير انعكاس قوي: ارفع الحماية (تخفيف/خروج تدريجي) خصوصاً عند كسر الدعم.');
  if (ex.tag === 'HIGH') tips.push('إجهاد مرتفع: جني أرباح جزئي قرب المقاومة أفضل من مطاردة السعر.');

  // Owned vs not owned
  if (owned) {
    if (exp === 'HIGH') tips.push('تعرضك عالي: أي إشارة HIGH تعني TRIM فوراً، ومع RISK-OFF الأفضل EXIT.');
    if (exp === 'LOW') tips.push('تعرض خفيف: يمكن الاحتفاظ مع متابعة التحذيرات.');
  } else {
    if (mr !== 'BULLISH') tips.push('للدخول: انتظر تأكيد الاتجاه أو كسر مقاومة مع حجم داعم.');
  }

  // Advanced: TRIM plan
  const trim = computeTrimPlan(data);
  if (trim.enabled) tips.push(`خطة التخفيف: TRIM ${trim.pct}% — ${trim.note}`);

  // Advanced: Trailing Stop
  const ts = computeTrailingStop(data);
  if (ts.enabled && Number.isFinite(ts.stop)) tips.push(`Trailing Stop: ${Number(ts.stop).toLocaleString('ar-SA',{maximumFractionDigits:2})} (${ts.note})`);

  // Advanced: Take Profit plan
  const tp = computeTakeProfitPlan(data);
  if (tp.enabled) tips.push(`جني أرباح: TP1=${Number(tp.tp1).toLocaleString('ar-SA',{maximumFractionDigits:2})} (${tp.tp1Pct}%)، TP2=${Number(tp.tp2).toLocaleString('ar-SA',{maximumFractionDigits:2})} (${tp.tp2Pct}%)`);

  // Return compact 5-8
  return tips.slice(0, 8);
}


function bearActionText(data){
  const owned = !!data?.position?.owned;
  const exp = String(data?.position?.exposure || 'MED').toUpperCase();
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);
  const mr = String(data?.marketRegime?.regime || '').toUpperCase();
  const riskHigh = (ew.score >= 70) || (ex.score >= 70) || (mr === 'RISK_OFF') || String(data?.traffic || '').toUpperCase() === 'RED';
  if (!owned) return riskHigh ? 'ابتعد / انتظر' : 'انتظار تأكيد';
  if (riskHigh) return exp === 'HIGH' ? 'خروج (EXIT)' : 'تخفيف (TRIM)';
  return exp === 'HIGH' ? 'تخفيف احترازي' : 'احتفاظ مع مراقبة';
}


function computeTrimPlan(data){
  const owned = !!data?.position?.owned;
  const exp = String(data?.position?.exposure || 'MED').toUpperCase(); // LOW/MED/HIGH
  const ew = computeEarlyWarning(data);
  const ex = computeExhaustion(data);
  const mr = String(data?.marketRegime?.regime || '').toUpperCase();
  const traffic = String(data?.traffic || '').toUpperCase();

  const riskHigh = (ew.score >= 70) || (ex.score >= 70) || (mr === 'RISK_OFF') || traffic === 'RED';
  const riskMed  = (ew.score >= 40) || (ex.score >= 40) || (mr === 'SIDEWAYS') || traffic === 'YELLOW';

  if (!owned) return { enabled:false, pct:0, note:'—' };

  let pct = 0;
  let note = '—';

  if (riskHigh){
    if (exp === 'HIGH'){ pct = 100; note='مخاطر عالية + تعرض عالي: خروج كامل (EXIT).'; }
    else if (exp === 'MED'){ pct = 50; note='مخاطر عالية: تخفيف قوي 50% لحماية رأس المال.'; }
    else { pct = 25; note='مخاطر عالية: تخفيف 25% مع مراقبة الدعم.'; }
  } else if (riskMed){
    if (exp === 'HIGH'){ pct = 25; note='مخاطر متوسطة + تعرض عالي: تخفيف 25% لتقليل التذبذب.'; }
    else if (ex.tag === 'HIGH'){ pct = 25; note='إجهاد مرتفع: جني أرباح جزئي 25% قرب المقاومة.'; }
    else { pct = 0; note='لا حاجة لتخفيف الآن، فقط مراقبة.'; }
  } else {
    // low risk
    if (ex.tag === 'HIGH' && exp !== 'LOW'){ pct = 15; note='إجهاد مرتفع رغم انخفاض التحذير: جني جزئي 15%.'; }
    else { pct = 0; note='الوضع مستقر: احتفاظ.'; }
  }

  return { enabled: pct>0, pct, note };
}

function computeTrailingStop(data){
  // trailing stop based on volatility proxy (volScore) and regime
  const ad = adaptDecisionLevels(data);
  const price = Number(data?.quote?.price);
  if(!Number.isFinite(price)) return { enabled:false, stop:null, trailPct:null, note:'—' };

  const mr = String(data?.marketRegime?.regime || '').toUpperCase();
  let trailPct = 3.0; // default
  // higher vol => wider trailing
  if (ad.volScore >= 70) trailPct = 5.0;
  else if (ad.volScore >= 40) trailPct = 4.0;

  if (mr === 'BULLISH') trailPct += 0.5;
  if (mr === 'RISK_OFF') trailPct -= 0.5;

  trailPct = Math.max(2.0, Math.min(6.0, trailPct));

  const stop = price * (1 - trailPct/100);
  const note = `Trailing Stop ≈ ${trailPct.toLocaleString('ar-SA',{maximumFractionDigits:1})}% تحت السعر الحالي.`;
  return { enabled:true, stop, trailPct, note };
}

function computeTakeProfitPlan(data){
  const ad = adaptDecisionLevels(data);
  const entry = Number(ad.entry);
  const t1 = Number(ad.target1);
  const stop = Number(ad.stop);
  if (!Number.isFinite(entry) || !Number.isFinite(t1) || !Number.isFinite(stop)) return { enabled:false };

  // Derive TP2 from RR heuristic: extend by 1R from TP1
  const risk = entry - stop;
  const tp1 = t1;
  const tp2 = tp1 + Math.max(0, risk * 1.0);

  // allocations depend on exhaustion/warnings
  const ex = computeExhaustion(data);
  const ew = computeEarlyWarning(data);
  let tp1Pct = 30, tp2Pct = 30;
  if (ex.tag === 'HIGH' || ew.tag === 'HIGH') { tp1Pct = 50; tp2Pct = 25; }
  else if (ex.tag === 'MED' || ew.tag === 'MED') { tp1Pct = 40; tp2Pct = 30; }

  return {
    enabled:true,
    tp1, tp2,
    tp1Pct, tp2Pct,
    note:`جني أرباح مرحلي: TP1 ثم TP2. النسب تتغير حسب الإجهاد/التحذير.`
  };
}


function renderExecutionPlan(data){
  const owned = !!data?.position?.owned;
  const trim = computeTrimPlan(data);
  const tp = computeTakeProfitPlan(data);
  const ts = computeTrailingStop(data);

  const fmt = (x) => (x === null || x === undefined || !Number.isFinite(Number(x))) ? '—' : Number(x).toLocaleString('ar-SA',{maximumFractionDigits:2});

  const rows = [];
  if (owned && trim.enabled) rows.push(`<div class="text-[12px] text-slate-700">• <span class="font-extrabold">TRIM:</span> ${trim.pct}% — ${escapeHtml(trim.note)}</div>`);
  if (tp.enabled) rows.push(`<div class="text-[12px] text-slate-700">• <span class="font-extrabold">TP1:</span> ${fmt(tp.tp1)} (${tp.tp1Pct}%) — <span class="font-extrabold">TP2:</span> ${fmt(tp.tp2)} (${tp.tp2Pct}%)</div>`);
  if (ts.enabled) rows.push(`<div class="text-[12px] text-slate-700">• <span class="font-extrabold">Trailing Stop:</span> ${fmt(ts.stop)} (${ts.trailPct.toLocaleString('ar-SA',{maximumFractionDigits:1})}%)</div>`);

  if (!rows.length) return `<div class="text-[12px] text-slate-600">—</div>`;
  return rows.join('');
}


/* =========================
   v3.1 Performance Tracker
   ========================= */

function perfKey(){ return 'ms_perf_history'; }

function loadPerfHistory(){
  try{
    const raw = localStorage.getItem(perfKey());
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

function savePerfHistory(arr){
  try{ localStorage.setItem(perfKey(), JSON.stringify(arr)); }catch(e){}
}

function recordDecisionSnapshot(data){
  if (!data?.symbol) return;
  const history = loadPerfHistory();

  const entry = adaptDecisionLevels(data).entry;
  const action = (data?.finalDecision?.action || '').toUpperCase();

  history.push({
    symbol: data.symbol,
    market: data.market,
    date: new Date().toISOString(),
    entry,
    action,
    confidence: computeConfidenceComposite(data)?.score || 0
  });

  savePerfHistory(history);
}

function evaluatePerformance(currentData){
  const history = loadPerfHistory();
  if (!history.length) return { total:0, winRate:0 };

  let wins=0, total=0;

  history.forEach(h=>{
    if (h.symbol !== currentData.symbol) return;
    total++;
    const price = currentData?.quote?.price;
    if (!price || !h.entry) return;

    if (h.action === 'ENTER' || h.action === 'ADD' || h.action === 'ADD_STRONG'){
      if (price > h.entry) wins++;
    }
    if (h.action === 'EXIT'){
      if (price < h.entry) wins++;
    }
  });

  const winRate = total ? Math.round((wins/total)*100) : 0;
  return { total, winRate };
}

function renderPerformanceBox(data){
  const stats = evaluatePerformance(data);
  return `
  <div class="p-3 rounded-2xl border border-slate-200 bg-white mt-4">
    <div class="flex items-center justify-between">
      <div class="font-extrabold">حاسب نسبة نجاح قراراتي</div>
      <div class="text-xs text-slate-500">يعتمد على أداء السعر بعد القرار</div>
    </div>
    <div class="mt-2 text-sm">
      إجمالي القرارات: <span class="font-extrabold">${stats.total}</span><br/>
      نسبة النجاح: <span class="font-extrabold">${stats.winRate}%</span>
    </div>
  </div>
  `;
}


/* =========================
   System Catalog (v3.1.1)
   ========================= */

function getSystemCatalogItems(){
  // Keep short, clear, Arabic; grouped
  return [
    { group:"التبويبات", items:[
      { key:"dashboard", title:"لوحة المتابعة", desc:"قائمة المراقبة: تعرض الأسهم، Trust Score، المرور، SMF، وإشارة القرار السريع." },
      { key:"add", title:"إضافة سهم", desc:"إضافة سهم أمريكي/سعودي لقائمة المراقبة، مع دعم Demo Mode." },
      { key:"alerts", title:"التنبيهات", desc:"قائمة تنبيهات المخاطر (A01..A05) مع السبب والحدة." },
      { key:"settings", title:"الإعدادات", desc:"اختيار مزود البيانات (Free/Pro) وإعدادات عامة." },
      { key:"screener", title:"ماسح خارجي", desc:"روابط/استيراد/أدوات مساعدة للمسح الخارجي (بدون اعتماد كمصدر بيانات مباشر)." },
      { key:"catalog", title:"كتالوج النظام", desc:"شرح سريع لكل مؤشر/فلتر/محرك داخل النظام." },
    ]},
    { group:"المؤشرات الفنية", items:[
      { key:"rsi14", title:"RSI(14)", desc:"يقيس الزخم. أعلى من 70 = تشبع شراء/خطر مطاردة، أقل من 30 = تشبع بيع (ليس فرصة مؤكدة). يستخدم مع الاتجاه." },
      { key:"sma20", title:"SMA20", desc:"متوسط 20 يوم. يقيس الاتجاه القصير. البعد الكبير عنه قد يعني إجهاد (Overextended)." },
      { key:"sma200", title:"SMA200", desc:"متوسط 200 يوم. فلتر اتجاه طويل. التداول فوقه = قوة هيكلية؛ تحته = خصم كبير للثقة." },
      { key:"volratio", title:"Volume Ratio (20D)", desc:"الحجم الحالي مقارنة بمتوسط 20 يوم. يساعد في كشف سيولة كاذبة أو تأكيد حركة." },
    ]},
    { group:"السيولة والتدفق", items:[
      { key:"smf", title:"Smart Money Flow (SMF)", desc:"رادار التجميع/التصريف. Lite يعمل من بيانات يومية، Pro يتفعل مع Intraday. يدعم Trust Score ويطلق A05." },
      { key:"instflow", title:"Institutional Flow", desc:"قياس مبدئي لتدفق مؤسسي (إيجابي/سلبي) حسب السلوك والحجم/الحركة. يزيد قوة القرار إذا وافق الاتجاه." },
    ]},
    { group:"محركات القرار", items:[
      { key:"regime", title:"Market Regime Engine", desc:"يحدد حالة السوق (صاعد/متذبذب/دفاعي). نفس السهم يتصرف بشكل مختلف حسب الحالة، لذلك يغيّر منطق القرار." },
      { key:"confluence", title:"Confluence Engine", desc:"بدل مؤشرات منفصلة: يحسب عدد الأدلة المتوافقة على نفس الاتجاه ويعطي قوة إعداد (Strong/Medium/Weak)." },
      { key:"earlywarning", title:"Early Warning", desc:"تحذير انعكاس مبكر قبل الهبوط الكبير عبر ضعف الزخم/هيكل الحركة. مفيد للملاك." },
      { key:"exhaustion", title:"Exhaustion Model", desc:"قياس إجهاد السعر (مطاردة/تشبع) عبر البعد عن المتوسط + RSI + قرب مقاومة. ممتاز لتوقيت الخروج الجزئي." },
      { key:"relstrength", title:"Relative Strength", desc:"يقارن أداء السهم بالسوق/المؤشر. سهم ضعيف داخل سوق قوي = تحذير (فرصة بديلة أفضل)." },
    ]},
    { group:"التنبيهات", items:[
      { key:"A01", title:"A01 فخ الصعود الكاذب", desc:"صعود قوي بسعر/نسبة لكن الحجم أقل من متوسط 20 يوم → حركة غير مدعومة بسيولة." },
      { key:"A02", title:"A02 Bearish Divergence", desc:"السعر يصنع قمة أعلى بينما RSI يصنع قمة أقل → ضعف زخم قد يسبق انعكاس." },
      { key:"A03", title:"A03 Overextended", desc:"السعر أعلى من SMA20 بأكثر من ~15% → مطاردة/إجهاد مرتفع." },
      { key:"A04", title:"A04 ضجيج بلا إفصاح", desc:"وضع MVP: إدخال يدوي/مؤشرات ضجيج اجتماعي بدون خبر رسمي → تحذير." },
      { key:"A05", title:"A05 Smart Money", desc:"تصريف قوي من SMF-Pro أو SMF-Lite مع إشارات سلبية داعمة → تحذير سيولة ذكية." },
    ]},
    { group:"خطة التنفيذ", items:[
      { key:"plan", title:"خطة الصفقة", desc:"مولد تلقائي (Entry/Stop/Targets/Trailing Stop/TRIM%) + ملخص مخاطر جاهز للنسخ." },
      { key:"pos", title:"أملك السهم + Exposure", desc:"يغيّر القرار: دخول/انتظار إذا لا تملك، أو احتفاظ/تخفيف/خروج إذا تملك، حسب نسبة التعرض." },
      { key:"tp", title:"TP1/TP2", desc:"جني أرباح مرحلي بنسب تلقائية حسب الإجهاد والتحذيرات." },
      { key:"ts", title:"Trailing Stop", desc:"وقف متحرك مبني على التقلب للمحافظة على الأرباح وتقليل الارتداد." },
      { key:"trim", title:"TRIM%", desc:"اقتراح نسبة تخفيف (15/25/50/100) حسب المخاطر + التعرض + حالة السوق." },
    ]},
    { group:"قياس الأداء", items:[
      { key:"perf", title:"حاسب نسبة نجاح قراراتي", desc:"يسجل قراراتك محلياً ويحسب Win Rate% بمقارنة السعر الحالي بسعر القرار (مرحلة أولى)." },
    ]},
  ];
}

function renderCatalogView(){
  const groups = getSystemCatalogItems();
  return `
  <div class="bg-white rounded-2xl border border-slate-200 p-4">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <div class="text-xl font-extrabold">كتالوج النظام</div>
        <div class="text-sm text-slate-600 mt-1">ابحث عن أي مؤشر أو فلتر أو تبويب لمعرفة وظيفته بسرعة.</div>
      </div>
      <div class="flex items-center gap-2">
        <input id="catalogSearch" class="w-full md:w-80 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="ابحث: RSI، SMF، A01، Market Regime..." />
        <button id="catalogExpandAll" class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold hover:bg-slate-100">فتح الكل</button>
        <button id="catalogCollapseAll" class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold hover:bg-slate-100">إغلاق الكل</button>
      </div>
    </div>

    <div id="catalogList" class="mt-4 space-y-3">
      ${groups.map(g => `
        <div class="rounded-2xl border border-slate-200 overflow-hidden">
          <button class="cat-group w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100" data-open="0">
            <span class="font-extrabold">${escapeHtml(g.group)}</span>
            <span class="text-slate-500 text-xs">عرض/إخفاء</span>
          </button>
          <div class="cat-body hidden px-4 py-3 space-y-2 bg-white">
            ${g.items.map(it => `
              <div class="cat-item p-3 rounded-2xl border border-slate-200 bg-white" data-text="${escapeHtml((it.title+' '+it.key+' '+it.desc).toLowerCase())}">
                <div class="flex items-center justify-between gap-2">
                  <div class="font-extrabold">${escapeHtml(it.title)}</div>
                  <div class="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(it.key)}</div>
                </div>
                <div class="text-sm text-slate-700 mt-1 leading-6">${escapeHtml(it.desc)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="mt-4 text-xs text-slate-500">
      ملاحظة: هذا الكتالوج يشرح منطق النظام. لا يعتبر توصية استثمارية قطعية.
    </div>
  </div>`;
}

function bindCatalogUI(container){
  const q = container.querySelector('#catalogSearch');
  const list = container.querySelector('#catalogList');
  if (!list) return;

  const setAll = (open) => {
    list.querySelectorAll('.cat-group').forEach(btn => {
      const body = btn.parentElement.querySelector('.cat-body');
      if (!body) return;
      if (open){ body.classList.remove('hidden'); btn.dataset.open='1'; }
      else { body.classList.add('hidden'); btn.dataset.open='0'; }
    });
  };

  list.querySelectorAll('.cat-group').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = btn.parentElement.querySelector('.cat-body');
      if (!body) return;
      const open = btn.dataset.open === '1';
      if (open){ body.classList.add('hidden'); btn.dataset.open='0'; }
      else { body.classList.remove('hidden'); btn.dataset.open='1'; }
    });
  });

  const expandBtn = container.querySelector('#catalogExpandAll');
  const collapseBtn = container.querySelector('#catalogCollapseAll');
  if (expandBtn) expandBtn.addEventListener('click', () => setAll(true));
  if (collapseBtn) collapseBtn.addEventListener('click', () => setAll(false));

  if (q){
    q.addEventListener('input', () => {
      const term = (q.value || '').trim().toLowerCase();
      // If searching, expand all and filter items
      setAll(true);
      list.querySelectorAll('.cat-item').forEach(card => {
        const t = (card.getAttribute('data-text') || '').toLowerCase();
        card.classList.toggle('hidden', term && !t.includes(term));
      });
    });
  }
}


export function dashboardCardsHtml(rows) {
  return (rows || []).map(r => {
    const traffic = badgeTraffic(r.traffic || 'YELLOW');
    const smf = smfBadge(r);
    return `
      <div class="bg-white border border-slate-200 rounded-2xl p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-extrabold text-lg">${escapeHtml(r.symbol)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(r.name || '')}</div>
            <div class="text-[11px] text-slate-500 mt-1">${r.market === 'SA' ? 'السوق السعودي' : 'السوق الأمريكي'}</div>
          </div>
          <div class="text-left">
            <div class="text-sm font-extrabold">${fmtNumber(r.price, 2)} ${escapeHtml(r.currency || '')}</div>
            <div class="text-xs text-slate-500">% ${fmtNumber(r.changePercent, 2)} • حجم ${fmtInt(r.volume)}</div>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2 items-center">
          ${scorePill(r.trustScore ?? 0)}
          ${traffic}
          <span class="inline-flex items-center gap-1 text-xs font-extrabold px-2 py-1 rounded-full bg-slate-100 text-slate-800">SMF: ${smf}</span>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <span class="text-xs">${opportunityBadge(r)}</span>
          <span class="text-xs">${exitBadge(r)}</span>
          <span class="text-xs">${decisionBadge(r)}</span>
        </div>

        <div class="mt-4 flex gap-2">
          <a class="flex-1 text-center px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold" href="#/details?symbol=${encodeURIComponent(r.symbol)}&market=${encodeURIComponent(r.market)}">تفاصيل</a>
        </div>
      </div>
    `;
  }).join('');
}


export function sectorHeatmapHtml(blocks = []) {
  // blocks: [{ title_ar, sectors:[{sector,change_pct,regime}] }]
  const pill = (regime) => {
    const r = String(regime||'').toUpperCase();
    if (r === 'UPTREND') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (r === 'DOWNTREND') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (r === 'RANGE') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-50 text-slate-600 border-slate-200';
  };
  const fmt = (x) => (x===null || x===undefined) ? '—' : `${fmtNumber(x)}%`;
  return `
    <div class="grid gap-3">
      ${blocks.map(b => `
        <div class="bg-white border border-slate-200 rounded-2xl p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="font-extrabold text-sm">${escapeHtml(b.title_ar||'خارطة القطاعات')}</div>
            <div class="text-[11px] text-slate-500">Rotation Heatmap</div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-6 gap-2">
            ${(b.sectors||[]).slice(0,8).map(s => `
              <div class="rounded-2xl border p-2 ${pill(s.regime)}">
                <div class="text-[11px] font-extrabold">${escapeHtml(String(s.sector||''))}</div>
                <div class="text-sm font-extrabold mt-0.5">${escapeHtml(fmt(s.change_pct))}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}