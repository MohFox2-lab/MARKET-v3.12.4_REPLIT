import { API } from './api.js';
import {
  setBanner,
  renderDashboard,
  dashboardRowsHtml,
  dashboardCardsHtml,
  escapeHtml,
  fmtNumber,
  fmtInt,
  scorePill,
  badgeTraffic,
  renderAdd,
  renderDetails,
  renderAlerts,
  renderSettings,
  sectorHeatmapHtml
} from './ui.js';

const views = {
  dashboard: document.getElementById('view-dashboard'),
  add: document.getElementById('view-add'),
  details: document.getElementById('view-details'),
  liquidity: document.getElementById('view-liquidity'),
  news: document.getElementById('view-news'),
  alerts: document.getElementById('view-alerts'),
  settings: document.getElementById('view-settings'),
  screener: document.getElementById('view-screener'),
  catalog: document.getElementById('view-catalog')
};

// Last analyzed context (for Liquidity/News tabs)
let LAST_ANALYSIS = null;
let LAST_SYMBOL = null;
let LAST_MARKET = null;

function pickActionText(liq) {
  if (!liq) return 'لا توجد نتيجة سيولة بعد.';
  const flags = new Set(liq.flags || []);
  const g = String(liq.liquidity_grade || 'D').toUpperCase();
  const risky = flags.has('LIQ_PUMP_RISK') || flags.has('LIQ_DUMP_RISK') || flags.has('LIQ_VOLUME_SPIKE') || flags.has('LIQ_GAP_RISK');
  if (g === 'D' || risky) return 'مخاطر سيولة مرتفعة: تجنّب زيادة الكمية قبل استقرار الحجم وتراجع الإشارات.';
  if (g === 'A' || g === 'B') return 'سيولة قوية: المخاطر التشغيلية أقل (مع بقاء مخاطر السوق/السهم).';
  return 'سيولة متوسطة: راقب الحجم والفجوات قبل أي قرار تشغيلي.';
}

function renderLiquidityView(container, analysis) {
  const liq = analysis?.liquidity || null;
  const sym = analysis?.symbol ? `${escapeHtml(analysis.symbol)} <span class="text-xs text-slate-500">(${escapeHtml(analysis.market || '')})</span>` : '<span class="text-slate-500">—</span>';

  if (!liq) {
    container.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-2xl p-6">
        <div class="font-extrabold text-lg">💧 السيولة والتدفق</div>
        <div class="text-sm text-slate-600 mt-2 leading-7">افتح <span class="font-bold">تفاصيل سهم</span> أولاً ليتم التحليل، ثم ارجع هنا لعرض السيولة.</div>
      </div>
    `;
    return;
  }

  const flags = (liq.flags || []).slice(0, 10);
  const reasons = (liq.reasons || []).slice(0, 3);

  const flagLabel = (f) => {
    const map = {
      LIQ_VOLUME_SPIKE: 'قفزة حجم (Volume Spike)',
      LIQ_THIN_LIQUIDITY: 'سيولة ضعيفة جدًا (Thin Liquidity)',
      LIQ_PUMP_RISK: 'اشتباه Pump',
      LIQ_DUMP_RISK: 'اشتباه Dump',
      LIQ_GAP_RISK: 'مخاطر فجوة سعرية (Gap Risk)',
    };
    return map[f] || f;
  };

  container.innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <div class="font-extrabold text-xl">💧 السيولة والتدفق</div>
        <div class="text-sm text-slate-500 mt-1">السهم: ${sym}</div>
      </div>
      <a class="px-3 py-2 rounded-xl border bg-white text-sm font-bold hover:bg-slate-50" href="#/details?symbol=${encodeURIComponent(analysis.symbol)}&market=${encodeURIComponent(analysis.market)}">فتح التفاصيل</a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <div class="font-extrabold">Card A — Liquidity Grade</div>
        <div class="mt-3 flex items-center gap-3">
          <div class="text-3xl font-black">${escapeHtml(liq.liquidity_grade || 'D')}</div>
          <div class="text-sm text-slate-600">Score: <span class="font-bold">${fmtInt(liq.liquidity_score || 0)}</span>/100</div>
        </div>
        <div class="mt-4 text-sm text-slate-700 leading-7">
          <div>Dollar Volume (آخر يوم): <span class="font-bold">${fmtNumber(liq.dollar_volume || 0)}</span></div>
          <div>Avg Dollar Volume (20 يوم): <span class="font-bold">${fmtNumber(liq.avg_dollar_volume20 || 0)}</span></div>
          <div>Vol Ratio 20: <span class="font-bold">${(Number(liq.vol_ratio20 || 0)).toFixed(2)}</span></div>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <div class="font-extrabold">Card B — Manipulation Flags</div>
        <div class="mt-3">
          ${flags.length ? `
            <ul class="list-disc pr-6 text-sm text-slate-700 leading-7">
              ${flags.map(f => `<li><span class="font-bold">${escapeHtml(f)}</span> — ${escapeHtml(flagLabel(f))}</li>`).join('')}
            </ul>
          ` : `<div class="text-sm text-slate-600">لا توجد Flags حالياً.</div>`}
        </div>
        <div class="mt-4 text-sm text-slate-600">
          <div class="font-extrabold text-slate-700 mb-1">لماذا؟</div>
          ${reasons.length ? `<ul class="list-disc pr-6 leading-7">${reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '<div class="text-slate-500">—</div>'}
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <div class="font-extrabold">Card C — Suggested Risk Action</div>
        <div class="mt-3 text-sm text-slate-700 leading-7">${escapeHtml(pickActionText(liq))}</div>
        <div class="mt-3 text-xs text-slate-500">ملاحظة: هذا توصيف مخاطر تشغيلية/سيولة فقط — ليس توصية شراء/بيع.</div>
      </div>
    </div>
  `;
}

function newsStoreKey(symbol, market) {
  return `ms_news_checks_v1::${String(symbol || '').toUpperCase()}::${String(market || '').toUpperCase()}`;
}

function loadNews(symbol, market) {
  try {
    const raw = localStorage.getItem(newsStoreKey(symbol, market));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function saveNews(symbol, market, items) {
  try {
    localStorage.setItem(newsStoreKey(symbol, market), JSON.stringify(items || []));
  } catch (_) {}
}

function renderNewsView(container, analysis) {
  const symbol = (analysis?.symbol || LAST_SYMBOL || '').toUpperCase();
  const market = (analysis?.market || LAST_MARKET || 'SA').toUpperCase();
  const items = symbol ? loadNews(symbol, market) : [];

  container.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-2xl p-6">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div class="font-extrabold text-xl">📰 تقصّي الخبر (يدوي)</div>
          <div class="text-sm text-slate-600 mt-1">بدون AI وبدون نسخ محتوى — فقط رابط + ملخصك + توثيق التحقق.</div>
        </div>
        <div class="text-sm text-slate-500">السهم الحالي: <span class="font-bold">${escapeHtml(symbol || '—')}</span> <span class="text-xs">(${escapeHtml(market)})</span></div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
        <div>
          <label class="text-xs font-bold text-slate-600">الرمز</label>
          <input id="nc_symbol" class="mt-1 w-full px-3 py-2 rounded-xl border" value="${escapeHtml(symbol)}" placeholder="مثال: 2222.SR أو AAPL" />
        </div>
        <div>
          <label class="text-xs font-bold text-slate-600">السوق</label>
          <select id="nc_market" class="mt-1 w-full px-3 py-2 rounded-xl border">
            <option value="SA" ${market==='SA'?'selected':''}>SA</option>
            <option value="US" ${market==='US'?'selected':''}>US</option>
          </select>
        </div>
        <div class="lg:col-span-1">
          <label class="text-xs font-bold text-slate-600">نوع الخبر</label>
          <select id="nc_type" class="mt-1 w-full px-3 py-2 rounded-xl border">
            <option value="EARNINGS">أرباح</option>
            <option value="DIVIDEND">توزيع</option>
            <option value="CONTRACT">عقد</option>
            <option value="INVESTIGATION">تحقيق</option>
            <option value="MGMT_CHANGE">تغيير إدارة</option>
            <option value="RUMOR">إشاعة</option>
            <option value="OTHER">أخرى</option>
          </select>
        </div>
        <div class="lg:col-span-2">
          <label class="text-xs font-bold text-slate-600">رابط الخبر</label>
          <input id="nc_url" class="mt-1 w-full px-3 py-2 rounded-xl border" placeholder="ضع الرابط هنا" />
        </div>
        <div>
          <label class="text-xs font-bold text-slate-600">تم التحقق من مصدر رسمي</label>
          <div class="mt-2 flex items-center gap-2">
            <input id="nc_verified" type="checkbox" class="w-5 h-5" />
            <span class="text-sm text-slate-600">نعم</span>
          </div>
        </div>
        <div class="lg:col-span-3">
          <label class="text-xs font-bold text-slate-600">ملخص يدوي (سطرين)</label>
          <textarea id="nc_summary" class="mt-1 w-full px-3 py-2 rounded-xl border" rows="2" placeholder="اكتب ملخصًا مختصرًا منك"></textarea>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2 flex-wrap">
        <button id="nc_save" class="px-4 py-2 rounded-xl bg-slate-900 text-white font-extrabold">حفظ</button>
        <button id="nc_clear" class="px-4 py-2 rounded-xl border bg-white font-bold">مسح الحقول</button>
        <div class="text-xs text-slate-500">يتم حفظ السجل محليًا على هذا الجهاز (localStorage).</div>
      </div>
    </div>

    <div class="bg-white border border-slate-200 rounded-2xl p-6 mt-4">
      <div class="font-extrabold">سجل الأخبار (آخر 10)</div>
      <div class="mt-3" id="nc_list">
        ${items.length ? `
          <div class="grid grid-cols-1 gap-3">
            ${items.slice(0,10).map(it => {
              const dt = it?.ts ? new Date(it.ts) : null;
              const when = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleString('ar-SA') : '';
              return `
                <div class="border border-slate-200 rounded-2xl p-4">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="font-extrabold text-sm">${escapeHtml(it.type_ar || it.type || '—')}</div>
                    <div class="text-xs text-slate-500">${escapeHtml(when)}</div>
                  </div>
                  <div class="text-sm text-slate-700 mt-2 leading-7">${escapeHtml(it.summary || '')}</div>
                  <div class="mt-2 flex items-center gap-2 flex-wrap">
                    <a class="text-sm font-bold text-sky-700 underline" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">فتح الرابط</a>
                    ${it.verified ? '<span class="ms-chip green">مصدر رسمي</span>' : '<span class="ms-chip">غير موثق</span>'}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `<div class="text-sm text-slate-600">لا يوجد سجل لهذا السهم بعد.</div>`}
      </div>
    </div>
  `;

  const elSym = container.querySelector('#nc_symbol');
  const elMkt = container.querySelector('#nc_market');
  const elType = container.querySelector('#nc_type');
  const elUrl = container.querySelector('#nc_url');
  const elSum = container.querySelector('#nc_summary');
  const elVer = container.querySelector('#nc_verified');
  const btnSave = container.querySelector('#nc_save');
  const btnClear = container.querySelector('#nc_clear');

  const typeAr = (t) => ({
    EARNINGS:'أرباح', DIVIDEND:'توزيع', CONTRACT:'عقد', INVESTIGATION:'تحقيق', MGMT_CHANGE:'تغيير إدارة', RUMOR:'إشاعة', OTHER:'أخرى'
  }[t] || 'أخرى');

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (elUrl) elUrl.value = '';
      if (elSum) elSum.value = '';
      if (elVer) elVer.checked = false;
      if (elType) elType.value = 'OTHER';
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const s = String(elSym?.value || '').trim().toUpperCase();
      const m = String(elMkt?.value || 'SA').toUpperCase();
      const url = String(elUrl?.value || '').trim();
      const summary = String(elSum?.value || '').trim();
      const type = String(elType?.value || 'OTHER').toUpperCase();
      const verified = !!elVer?.checked;

      if (!s) { setBanner('warn', 'تنبيه', 'أدخل رمز السهم.'); return; }
      if (!url) { setBanner('warn', 'تنبيه', 'أدخل رابط الخبر.'); return; }
      if (!/^https?:\/\//i.test(url)) { setBanner('warn', 'تنبيه', 'الرابط يجب أن يبدأ بـ http:// أو https://'); return; }
      if (!summary) { setBanner('warn', 'تنبيه', 'اكتب ملخصًا يدويًا مختصرًا.'); return; }

      const arr = loadNews(s, m);
      const item = { url, summary, type, type_ar: typeAr(type), verified, ts: Date.now() };
      const next = [item, ...arr].slice(0, 10);
      saveNews(s, m, next);
      LAST_SYMBOL = s; LAST_MARKET = m;
      setBanner('ok', 'تم الحفظ', 'تم حفظ سجل الخبر محليًا.');
      // Re-render list quickly
      renderNewsView(container, { symbol: s, market: m });
    });
  }
}

async function loadSettingsModel() {
  const [p, s] = await Promise.all([API.providers(), API.settings()]);
  return {
    providers: p?.providers || [],
    settings: s?.settings || { data_mode: 'free', provider_us: 'yahoo_free', provider_sa: 'yahoo_free', risk_profile: 'balanced', silent_mode: false, min_severity_to_show: 'MED' }
  };
}


function severityRank(s) {
  const v = String(s || '').toUpperCase();
  if (v === 'HIGH') return 3;
  if (v === 'MED') return 2;
  if (v === 'LOW') return 1;
  return 0;
}

function filterAlertsForSilentMode(alerts = [], settings = {}) {
  const silent = !!settings.silent_mode;
  const min = severityRank(settings.min_severity_to_show || 'MED');
  if (!silent) return { visible: alerts, hiddenCount: 0 };
  const visible = [];
  let hidden = 0;
  for (const a of (alerts || [])) {
    const r = severityRank(a?.severity || a?.sev || a?.level || 'LOW');
    if (r >= min) visible.push(a);
    else hidden++;
  }
  return { visible, hiddenCount: hidden };
}

async function renderSectorHeatmapBar(container) {
  const box = container.querySelector('#ms_sector_heatmap');
  if (!box) return;
  try {
    const [us, sa] = await Promise.all([
      API.sectorHeatmap('US','D'),
      API.sectorHeatmap('SA','D')
    ]);
    const blocks = [];
    if (us?.ok) blocks.push({ title_ar: 'دوران السيولة — أمريكا (US)', sectors: us.sectors || [] });
    if (sa?.ok) blocks.push({ title_ar: 'دوران السيولة — السعودية (SA)', sectors: sa.sectors || [] });
    box.innerHTML = sectorHeatmapHtml(blocks.length ? blocks : []);
  } catch (e) {
    box.innerHTML = '';
  }
}
function bindSettingsUI(container) {
  const status = container.querySelector('#ms_settings_status');
  const btnSave = container.querySelector('#ms_save_settings');
  const selMode = container.querySelector('#ms_data_mode');
  const selUS = container.querySelector('#ms_provider_us');
  const selSA = container.querySelector('#ms_provider_sa');
  const selRisk = container.querySelector('#ms_risk_profile');

  const chkSilent = container.querySelector('#ms_silent_mode');
  const selMinSev = container.querySelector('#ms_min_severity');
  const btnTestUS = container.querySelector('#ms_test_us');
  const btnTestSA = container.querySelector('#ms_test_sa');

  // Fill current values
  (async () => {
    try {
      const cur = await API.settings();
      const st = cur?.settings || {};
      if (selMode && st.data_mode) selMode.value = st.data_mode;
      if (selUS && st.provider_us) selUS.value = st.provider_us;
      if (selSA && st.provider_sa) selSA.value = st.provider_sa;
      if (selRisk && st.risk_profile) selRisk.value = st.risk_profile;
  if (chkSilent) chkSilent.checked = !!(st.silent_mode);
  if (selMinSev) selMinSev.value = String(st.min_severity_to_show || 'MED').toUpperCase();
    } catch (_) {}
  })();

  const setStatus = (t) => { if (status) status.textContent = t || ''; };

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      try {
        setStatus('...جاري الحفظ');
        await API.saveSettings({
          data_mode: selMode?.value || 'free',
          provider_us: selUS?.value || 'yahoo_free',
          provider_sa: selSA?.value || 'yahoo_free',
          risk_profile: selRisk?.value || 'balanced',
          silent_mode: chkSilent ? !!chkSilent.checked : false,
          min_severity_to_show: selMinSev ? String(selMinSev.value || 'MED').toUpperCase() : 'MED'
        });
        setStatus('✅ تم الحفظ');
        setBanner('✅ تم حفظ الإعدادات', 'success');
      } catch (e) {
        setStatus('❌ فشل الحفظ');
        setBanner('❌ فشل حفظ الإعدادات', 'danger');
      }
    });
  }

  const runTest = async (market, symbol) => {
    try {
      setStatus('...جاري الاختبار');
      const provider = market === 'SA' ? (selSA?.value || '') : (selUS?.value || '');
      const data_mode = selMode?.value || 'free';
      const out = await API.analyze(symbol, market, { provider, data_mode });
      if (out?.ok === false) throw new Error(out?.error || 'failed');
      setStatus('✅ نجح الاختبار');
      setBanner(`✅ نجح الاختبار: ${symbol} عبر ${provider || 'auto'}`, 'success');
    } catch (e) {
      setStatus('⚠️ فشل الاختبار');
      setBanner('⚠️ تعذّر جلب البيانات الآن (قد يكون Rate Limit) — جرّب لاحقاً أو استخدم Demo.', 'warn');
    }
  };

  if (btnTestUS) btnTestUS.addEventListener('click', () => runTest('US', 'AAPL'));
  if (btnTestSA) btnTestSA.addEventListener('click', () => runTest('SA', '2222.SR'));
}

const demoBtn = document.getElementById('demoBtn');
const refreshBtn = document.getElementById('refreshBtn');

demoBtn.addEventListener('click', async () => {
  try {
    setBanner('info', 'تشغيل الوضع التجريبي', 'جارٍ إنشاء بيانات Demo (AAPL, 2222.SR, DUMP) + Snapshots + Alerts...');
    await API.demoSeed();
    setBanner('ok', 'تم', 'تم إنشاء بيانات Demo بنجاح. افتح لوحة المتابعة أو التنبيهات.');
    await navigateTo('#/dashboard', true);
  } catch (e) {
    showError(e);
  }
});

refreshBtn.addEventListener('click', async () => {
  await navigateTo(location.hash || '#/dashboard', true);
});

window.addEventListener('hashchange', () => navigateTo(location.hash));


function startActiveUsersPoll() {
  const el = document.getElementById('activeUsers');
  if (!el) return;
  const tick = async () => {
    try {
      const out = await API.activeUsers();
      if (out && typeof out.activeUsers === 'number') el.textContent = out.activeUsers.toLocaleString('ar-SA');
      else if (out && typeof out.count === 'number') el.textContent = out.count.toLocaleString('ar-SA');
      else el.textContent = '—';
    } catch (_) {
      el.textContent = '—';
    }
  };
  tick();
  setInterval(tick, 30_000);
}

init();

async function init() {
  // render base views
  renderAdd(views.add);
  try {
    const model = await loadSettingsModel();
    renderSettings(views.settings, model);
    bindSettingsUI(views.settings);
  } catch (e) {
    // Fallback: render without model
    renderSettings(views.settings, { providers: [], settings: { provider_us: 'yahoo_free', provider_sa: 'yahoo_free', risk_profile: 'balanced' } });
  }

  // Render screener view
  renderScreener(views.screener);
  bindScreenerUI();

  // Validate DB/health
  try {
    await API.health();
    setBanner(null);
  } catch (e) {
    setBanner('warn', 'قاعدة البيانات غير جاهزة', 'ضع DATABASE_URL في Replit Secrets أو شغّل Postgres محلياً. الواجهة ستعمل لكن الـ API سيُرجع خطأ حتى تجهّز DB.');
  }

  await navigateTo(location.hash || '#/dashboard');

  // Active users (last 10 minutes)
  startActiveUsersPoll();

  // Bind add view actions
  bindAddForm();
}

function showOnly(name) {
  for (const [k, el] of Object.entries(views)) {
    el.classList.toggle('hidden', k !== name);
  }
  for (const a of document.querySelectorAll('.tab')) {
    const route = a.getAttribute('data-route');
    const active = route === name;
    a.className = `tab px-3 py-2 rounded-xl text-sm font-bold border ${active ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`;
  }
}

async function navigateTo(hash, forceReload = false) {
  const { route, params } = parseRoute(hash);

  if (route === 'dashboard') {
    showOnly('dashboard');
    if (!forceReload && views.dashboard.dataset.loaded === '1') return;

    try {
      const resp = await API.listWatchlist();
      const rows = resp.data || [];
      renderDashboard(views.dashboard, rows);
      bindDashboardControls(rows);
      bindScanControls();
      await renderSectorHeatmapBar(views.dashboard);
      views.dashboard.dataset.loaded = '1';
      setBanner(null);
    } catch (e) {
      views.dashboard.innerHTML = emptyStateDB();
      showError(e);
    }
    return;
  }

  if (route === 'add') {
    showOnly('add');
    return;
  }

  if (route === 'alerts') {
    showOnly('alerts');
    try {
      const [resp, s] = await Promise.all([API.listAlerts(), API.settings()]);
      const settings = s?.settings || {};
      const { visible, hiddenCount } = filterAlertsForSilentMode(resp.data || [], settings);
      renderAlerts(views.alerts, visible, { hiddenCount, silent: !!settings.silent_mode });
      setBanner(null);
    } catch (e) {
      views.alerts.innerHTML = emptyStateDB();
      showError(e);
    }
    return;
  }

  if (route === 'liquidity') {
    showOnly('liquidity');
    // Use latest analysis if available
    renderLiquidityView(views.liquidity, LAST_ANALYSIS);
    setBanner(null);
    return;
  }

  if (route === 'news') {
    showOnly('news');
    renderNewsView(views.news, LAST_ANALYSIS);
    setBanner(null);
    return;
  }

  if (route === 'screener') {
    showOnly('screener');
    return;
  }

    if (route === 'catalog') {
    showOnly('catalog');
    views.catalog.innerHTML = (typeof renderCatalogView === 'function') ? renderCatalogView() : '<div class="text-sm text-slate-500">كتالوج غير متاح.</div>';
    if (typeof bindCatalogUI === 'function') bindCatalogUI(views.catalog);
    return;
  }

if (route === 'settings') {
    showOnly('settings');
    return;
  }

  if (route === 'details') {
    showOnly('details');
    const symbol = params.symbol;
    const market = params.market;
    if (!symbol || !market) {
      views.details.innerHTML = '<div class="text-sm text-slate-500">لم يتم تحديد السهم.</div>';
      return;
    }

    try {
      const data = await API.analyze(symbol, market, {
        owned: getOwned(symbol, market) ? '1' : '0',
        exposure: getExposure(symbol, market)
      });
      // Save latest context for Liquidity/News tabs
      LAST_ANALYSIS = data;
      LAST_SYMBOL = symbol;
      LAST_MARKET = market;
      let snaps = [];
      try {
        if (data?.stockId) {
          const sresp = await API.listSnapshots(data.stockId, 20);
          snaps = sresp?.data || [];
        }
      } catch (_) {}
      // Silent Mode filtering for details
      let hiddenCount = 0;
      try {
        const s = await API.settings();
        const settings = s?.settings || {};
        const f = filterAlertsForSilentMode(data?.alerts || [], settings);
        data.alerts = f.visible;
        hiddenCount = f.hiddenCount;
        // Portfolio psychological guard (optional display in assistant panel)
        try {
          const ph = await API.portfolioHealth();
          if (ph?.ok) data.portfolio_health = ph;
        } catch (_) {}
        renderDetails(views.details, data, snaps, { hiddenCount, silent: !!settings.silent_mode });
      } catch (_) {
        renderDetails(views.details, data, snaps, { hiddenCount: 0, silent: false });
      }
      if (typeof recordDecisionSnapshot === 'function') recordDecisionSnapshot(data);
      bindReanalyze(symbol, market);
      bindPositionToggle(symbol, market);
      bindCopyPlan();
      setBanner(null);
    } catch (e) {
      views.details.innerHTML = emptyStateDB();
      showError(e);
    }
    return;
  }

  // default
  location.hash = '#/dashboard';
}



function bindScreenerUI() {
  const el = views.screener;
  if (!el) return;

  const file = el.querySelector('#ms_csv_file');
  const btnImport = el.querySelector('#ms_csv_import');
  const out = el.querySelector('#ms_csv_out');

  const parse = async () => {
    out.innerHTML = '';
    const f = file?.files?.[0];
    if (!f) {
      out.innerHTML = '<div class="text-sm text-slate-500">اختر ملف CSV أولاً.</div>';
      return;
    }
    const txt = await f.text();
    const rows = csvParse(txt);

    // Extract symbols from common columns
    const symbols = [];
    const seen = new Set();
    for (const r of rows) {
      const cand = (r.Symbol || r.symbol || r.Ticker || r.ticker || r['رمز'] || r['الرمز'] || '').toString().trim();
      if (!cand) continue;
      const norm = cand.replace(/\s+/g,'');
      if (seen.has(norm)) continue;
      seen.add(norm);
      symbols.push(norm);
      if (symbols.length >= 50) break;
    }

    if (!symbols.length) {
      out.innerHTML = '<div class="text-sm text-rose-600 font-bold">لم أستطع العثور على عمود Symbol/Ticker داخل CSV.</div>';
      return;
    }

    // Show list with quick analyze links
    out.innerHTML = `
      <div class="font-extrabold mb-2">تم استيراد ${symbols.length} رمز</div>
      <div class="text-xs text-slate-500 mb-3">اضغط على أي رمز لتحليله فورًا داخل التطبيق.</div>
      <div class="flex flex-wrap gap-2">
        ${symbols.map(s => {
          const { market, symbol } = inferMarketAndNormalizeSymbol(s);
          return `<a class="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold" href="#/details/${encodeURIComponent(symbol)}/${encodeURIComponent(market)}">${escapeHtmlLocal(symbol)}</a>`;
        }).join('')}
      </div>
    `;
  };

  btnImport?.addEventListener('click', parse);
}

function csvParse(text) {
  // Minimal CSV parser (handles commas + quoted fields)
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const out = [];
  for (let i=1;i<lines.length;i++){
    const cols = splitCsvLine(lines[i]);
    const obj = {};
    for (let c=0;c<header.length;c++){
      obj[header[c] || `c${c}`] = (cols[c] ?? '').trim();
    }
    out.push(obj);
    if (out.length>=5000) break;
  }
  return out;
}

function splitCsvLine(line) {
  const res = [];
  let cur = '';
  let q = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i+1] === '"') { cur += '"'; i++; }
      else q = !q;
      continue;
    }
    if (ch === ',' && !q) { res.push(cur); cur=''; continue; }
    cur += ch;
  }
  res.push(cur);
  return res;
}

function escapeHtmlLocal(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function inferMarketAndNormalizeSymbol(input) {
  const raw = String(input || '').trim().toUpperCase();
  if (!raw) return { symbol: '', market: '' };
  if (raw.endsWith('.SR')) return { symbol: raw, market: 'SA' };
  if (/^\d{3,6}$/.test(raw)) return { symbol: `${raw}.SR`, market: 'SA' };
  return { symbol: raw, market: 'US' };
}

// v2.1.3: Position-aware decision + Exposure level (Owned vs Not Owned)
function ownedKey(symbol, market) {
  const s = String(symbol || '').toUpperCase();
  const m = String(market || '').toUpperCase();
  return `ms_owned_${m}_${s}`;
}

function getOwned(symbol, market) {
  try {
    return localStorage.getItem(ownedKey(symbol, market)) === '1';
  } catch (_) {
    return false;
  }
}

function setOwned(symbol, market, owned) {
  try {
    localStorage.setItem(ownedKey(symbol, market), owned ? '1' : '0');
  } catch (_) {}
}

// v2.1.3: Exposure level (LOW/MED/HIGH) to refine TRIM vs EXIT
function exposureKey(symbol, market) {
  const s = String(symbol || '').toUpperCase();
  const m = String(market || '').toUpperCase();
  return `ms_exposure_${m}_${s}`;
}

function getExposure(symbol, market) {
  try {
    const v = String(localStorage.getItem(exposureKey(symbol, market)) || '').toUpperCase();
    return (v === 'LOW' || v === 'HIGH') ? v : 'MED';
  } catch (_) {
    return 'MED';
  }
}

function setExposure(symbol, market, exposure) {
  try {
    const v = String(exposure || 'MED').toUpperCase();
    localStorage.setItem(exposureKey(symbol, market), (v === 'LOW' || v === 'HIGH') ? v : 'MED');
  } catch (_) {}
}

function bindPositionToggle(symbol, market) {
  const yes = document.getElementById('ms_pos_owned');
  const no = document.getElementById('ms_pos_notowned');
  const expSel = document.getElementById('ms_exposure');
  if (!yes || !no) return;

  const apply = async (owned) => {
    setOwned(symbol, market, owned);
    const exposure = expSel ? String(expSel.value || getExposure(symbol, market)).toUpperCase() : getExposure(symbol, market);
    setExposure(symbol, market, exposure);
    const newsText = document.getElementById('newsText')?.value || '';
    const hype = document.getElementById('hype')?.checked;
    const noOfficial = document.getElementById('noOfficial')?.checked;
    try {
      const data = await API.analyze(symbol, market, {
        owned: owned ? '1' : '0',
        exposure,
        newsText,
        hype: hype ? '1' : '0',
        noOfficial: noOfficial ? '1' : '0'
      });
      // Save latest context for Liquidity/News tabs
      LAST_ANALYSIS = data;
      LAST_SYMBOL = symbol;
      LAST_MARKET = market;
      let snaps = [];
      try {
        if (data?.stockId) {
          const sresp = await API.listSnapshots(data.stockId, 20);
          snaps = sresp?.data || [];
        }
      } catch (_) {}
      // Silent Mode filtering for details
      let hiddenCount = 0;
      try {
        const s = await API.settings();
        const settings = s?.settings || {};
        const f = filterAlertsForSilentMode(data?.alerts || [], settings);
        data.alerts = f.visible;
        hiddenCount = f.hiddenCount;
        // Portfolio psychological guard (optional display in assistant panel)
        try {
          const ph = await API.portfolioHealth();
          if (ph?.ok) data.portfolio_health = ph;
        } catch (_) {}
        renderDetails(views.details, data, snaps, { hiddenCount, silent: !!settings.silent_mode });
      } catch (_) {
        renderDetails(views.details, data, snaps, { hiddenCount: 0, silent: false });
      }
      if (typeof recordDecisionSnapshot === 'function') recordDecisionSnapshot(data);
      bindReanalyze(symbol, market);
      bindPositionToggle(symbol, market);
      bindCopyPlan();
      setBanner('ok', 'تم تحديث القرار', owned ? 'تم تفعيل وضع: أملك السهم.' : 'تم تفعيل وضع: لا أملك السهم.');
    } catch (e) {
      showError(e);
    }
  };

  yes.addEventListener('change', () => { if (yes.checked) apply(true); });
  no.addEventListener('change', () => { if (no.checked) apply(false); });

  if (expSel) {
    expSel.addEventListener('change', () => {
      // exposure only meaningful when owned, but we persist it anyway
      const ownedNow = !!document.getElementById('ms_pos_owned')?.checked;
      apply(ownedNow);
    });
  }
}



async function bindCopyPlan() {
  const btn = document.getElementById('btnCopyPlan');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const data = (typeof window !== 'undefined') ? (window.__ms_lastDetailData || null) : null;
    if (!data) {
      setBanner('warn', 'لا توجد بيانات', 'قم بتحليل السهم أولاً.'); 
      return;
    }
    const txt = (typeof buildTradePlanText === 'function') ? buildTradePlanText(data) : '';
    if (!String(txt || '').trim()) {
      setBanner('warn', 'لا توجد خطة للنسخ', 'قم بتحليل السهم أولاً.'); 
      return;
    }
    try {
      const ok = await (typeof copyTextToClipboard === 'function' ? copyTextToClipboard(txt) : (navigator.clipboard.writeText(txt).then(()=>true).catch(()=>false)));
      if (ok) setBanner('ok', 'تم نسخ خطة الصفقة', 'الصقها في الملاحظات أو أرسلها لنفسك.');
      else setBanner('warn', 'تعذر النسخ', 'جرّب النسخ اليدوي من صندوق الخطة.');
    } catch (e) {
      setBanner('warn', 'تعذر النسخ', 'جرّب النسخ اليدوي من صندوق الخطة.');
    }
  });
}


function bindScanControls() {
  const inp = document.getElementById('ms_scan_symbol');
  const btn = document.getElementById('ms_scan_btn');
  const add = document.getElementById('ms_scan_add');
  if (!inp || !btn) return;

  const goDetails = (value) => {
    const { symbol, market } = inferMarketAndNormalizeSymbol(value);
    if (!symbol || !market) return;
    location.hash = `#/details?symbol=${encodeURIComponent(symbol)}&market=${encodeURIComponent(market)}`;
  };

  btn.addEventListener('click', () => {
    const v = inp.value;
    if (!String(v || '').trim()) {
      setBanner('warn', 'أدخل رمز/رقم السهم', 'مثال: AAPL أو 2222 أو 2222.SR');
      return;
    }
    goDetails(v);
  });

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btn.click();
    }
  });

  if (add) {
    add.addEventListener('click', async () => {
      const v = inp.value;
      const { symbol, market } = inferMarketAndNormalizeSymbol(v);
      if (!symbol || !market) {
        setBanner('warn', 'أدخل رمز/رقم السهم', 'مثال: AAPL أو 2222 أو 2222.SR');
        return;
      }
      try {
        await API.addWatch(symbol, market);
        setBanner('ok', 'تمت الإضافة', `تمت إضافة ${symbol} إلى قائمة المراقبة.`);
        // reload dashboard list
        views.dashboard.dataset.loaded = '0';
        location.hash = '#/dashboard';
      } catch (e) {
        showError(e);
      }
    });
  }
}

function bindDashboardControls(rows) {
  const input = document.getElementById('ms_dash_search');
  const selSort = document.getElementById('ms_dash_sort');
  const selTraffic = document.getElementById('ms_dash_traffic');
  const pills = Array.from(views.dashboard.querySelectorAll('.ms_mode_pill'));
  const tbody = views.dashboard.querySelector('tbody');
  const cards = document.getElementById('ms_watchlist_cards');
  if (!input || !selSort || !selTraffic || !tbody || !cards) return;

  const norm = (s) => String(s || '').toLowerCase();
  let mode = 'ALL';

  const renderBody = (list) => {
    tbody.innerHTML = dashboardRowsHtml(list);
    cards.innerHTML = dashboardCardsHtml(list);
  };

  const apply = () => {
    const q = norm(input.value).trim();
    const traffic = selTraffic.value;
    const sort = selSort.value;

    let list = [...rows];
    if (q) {
      list = list.filter(r => norm(r.symbol).includes(q) || norm(r.name).includes(q));
    }
    if (traffic !== 'ALL') {
      list = list.filter(r => String(r.traffic || 'YELLOW') === traffic);
    }
    if (mode !== 'ALL') {
      if (mode === 'WATCH') list = list.filter(r => String(r.decisionTag || '').toUpperCase() === 'WATCH');
      else if (mode === 'AVOID') list = list.filter(r => String(r.decisionTag || '').toUpperCase() === 'AVOID' || String(r.traffic||'') === 'RED');
      else if (mode === 'OPPORTUNITY') list = list.filter(r => String(r.opportunityTag || '').toUpperCase() === 'HIGH_OPPORTUNITY' && Number(r.exitScore||0) <= 35 && String(r.traffic||'') !== 'RED');
      else if (mode === 'EXIT') list = list.filter(r => String(r.exitTag || '').toUpperCase() === 'HIGH_EXIT_RISK' || Number(r.exitScore||0) >= 70 || String(r.decisionTag||'').toUpperCase() === 'REDUCE_RISK');
    }
    if (sort === 'score_desc') list.sort((a,b) => (b.trustScore||0) - (a.trustScore||0));
    else if (sort === 'score_asc') list.sort((a,b) => (a.trustScore||0) - (b.trustScore||0));
    else if (sort === 'change_desc') list.sort((a,b) => (b.changePercent||0) - (a.changePercent||0));
    else if (sort === 'change_asc') list.sort((a,b) => (a.changePercent||0) - (b.changePercent||0));
    // added_desc keeps original order from API

    renderBody(list);
  };

  // Mobile filters (drawer/bottom-sheet): sync to desktop inputs
  const mSearch = document.getElementById('ms_dash_search_m');
  const mSort = document.getElementById('ms_dash_sort_m');
  const mTraffic = document.getElementById('ms_dash_traffic_m');
  const sheet = document.getElementById('ms_filters_sheet');
  const openBtn = document.getElementById('ms_filters_open');
  const applyBtn = document.getElementById('ms_filters_apply');

  const openSheet = () => { if (sheet) sheet.classList.remove('hidden'); };
  const closeSheet = () => { if (sheet) sheet.classList.add('hidden'); };

  if (openBtn && sheet) {
    openBtn.addEventListener('click', openSheet);
    sheet.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') closeSheet();
    });
  }

  const syncMobileToDesktop = () => {
    if (mSearch) input.value = mSearch.value;
    if (mSort) selSort.value = mSort.value;
    if (mTraffic) selTraffic.value = mTraffic.value;
  };

  const syncDesktopToMobile = () => {
    if (mSearch) mSearch.value = input.value;
    if (mSort) mSort.value = selSort.value;
    if (mTraffic) mTraffic.value = selTraffic.value;
  };

  // Init mobile controls with current desktop values
  syncDesktopToMobile();

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      syncMobileToDesktop();
      apply();
      closeSheet();
    });
  }


  input.addEventListener('input', () => { apply(); syncDesktopToMobile(); });
  selSort.addEventListener('change', () => { apply(); syncDesktopToMobile(); });
  selTraffic.addEventListener('change', () => { apply(); syncDesktopToMobile(); });

  for (const p of pills) {
    p.addEventListener('click', () => {
      mode = (p.getAttribute('data-mode') || 'ALL').toUpperCase();
      for (const x of pills) {
        const active = (x.getAttribute('data-mode') || 'ALL').toUpperCase() === mode;
        x.className = `ms_mode_pill px-3 py-2 rounded-xl border text-sm font-extrabold ${active ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'}`;
      }
      apply();
    });
  }
}

function parseRoute(hash) {
  const h = (hash || '#/dashboard').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const route = path || 'dashboard';
  const params = {};
  if (qs) {
    const u = new URLSearchParams(qs);
    for (const [k, v] of u.entries()) params[k] = v;
  }
  return { route, params };
}

function bindAddForm() {
  const btn = document.getElementById('addBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const symbol = document.getElementById('addSymbol').value.trim();
    const market = document.getElementById('addMarket').value;
    if (!symbol) {
      setBanner('warn', 'تنبيه', 'أدخل رمز السهم أولاً.');
      return;
    }

    try {
      await API.addWatch(symbol, market);
      setBanner('ok', 'تمت الإضافة', `تمت إضافة ${symbol.toUpperCase()} إلى قائمة المراقبة.`);
      document.getElementById('addSymbol').value = '';
      await navigateTo('#/dashboard', true);
      location.hash = '#/dashboard';
    } catch (e) {
      showError(e);
    }
  });
}

function bindReanalyze(symbol, market) {
  const btn = document.getElementById('reanalyzeBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const newsText = document.getElementById('newsText').value;
    const hype = document.getElementById('hype').checked;
    const noOfficial = document.getElementById('noOfficial').checked;
    const owned = document.getElementById('ms_pos_owned')?.checked;
    const exposure = String(document.getElementById('ms_exposure')?.value || getExposure(symbol, market)).toUpperCase();
    setExposure(symbol, market, exposure);

    try {
      const data = await API.analyze(symbol, market, {
        owned: owned ? '1' : '0',
        exposure,
        newsText,
        hype: hype ? '1' : '0',
        noOfficial: noOfficial ? '1' : '0'
      });
      let snaps = [];
      try {
        if (data?.stockId) {
          const sresp = await API.listSnapshots(data.stockId, 20);
          snaps = sresp?.data || [];
        }
      } catch (_) {}
      // Silent Mode filtering for details
      let hiddenCount = 0;
      try {
        const s = await API.settings();
        const settings = s?.settings || {};
        const f = filterAlertsForSilentMode(data?.alerts || [], settings);
        data.alerts = f.visible;
        hiddenCount = f.hiddenCount;
        // Portfolio psychological guard (optional display in assistant panel)
        try {
          const ph = await API.portfolioHealth();
          if (ph?.ok) data.portfolio_health = ph;
        } catch (_) {}
        renderDetails(views.details, data, snaps, { hiddenCount, silent: !!settings.silent_mode });
      } catch (_) {
        renderDetails(views.details, data, snaps, { hiddenCount: 0, silent: false });
      }
      if (typeof recordDecisionSnapshot === 'function') recordDecisionSnapshot(data);
      bindReanalyze(symbol, market);
      bindPositionToggle(symbol, market);
      bindCopyPlan();
      setBanner('ok', 'تم التحديث', 'تمت إعادة التحليل بناءً على الخبر/الخيارات.');
    } catch (e) {
      showError(e);
    }
  });
}

function showError(e) {
  const msg = e?.data?.message || e?.message || 'حدث خطأ غير متوقع';
  if (e?.data?.error === 'DB_NOT_READY') {
    setBanner('warn', 'قاعدة البيانات غير جاهزة', 'ضع DATABASE_URL في Secrets ثم أعد التشغيل.');
  } else {
    setBanner('error', 'خطأ', msg);
  }
}

function emptyStateDB() {
  return `
    <div class="bg-white border border-slate-200 rounded-2xl p-6">
      <div class="font-extrabold text-lg">لا يمكن جلب البيانات</div>
      <div class="text-sm text-slate-600 mt-2 leading-7">
        هذا الإصدار يتطلب PostgreSQL فعلي.
        <br/>ضع <span class="font-bold">DATABASE_URL</span> في Replit Secrets ثم أعد التشغيل.
        <br/>بعدها اضغط <span class="font-bold">وضع تجريبي</span> لإنشاء بيانات مباشرة.
      </div>
    </div>
  `;
}
