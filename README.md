MARKET SENTINEL AR v3.12.4

تطبيق عربي RTL لفلترة مخاطر الأسهم (US + SA) عبر **Trust Score** وتنبيهات قابلة للتفسير — **بدون توصيات شراء/بيع**.

## ✅ التقنية
- Frontend: **HTML + Tailwind CDN + Vanilla JS (ES Modules)** داخل `/public`
- Backend: Node.js + Express داخل `/server`
- Database: PostgreSQL (مطلوب فعليًا) عبر `DATABASE_URL`

## 1) التشغيل محليًا
1) أنشئ قاعدة PostgreSQL وضع رابط الاتصال في `.env`:
   - انسخ `.env.example` إلى `.env`
   - ضع `DATABASE_URL`
2) ثبّت الحزم:
```bash
npm i
```
3) طبّق الجداول:
> افتراضيًا يتم تطبيق `server/schema.sql` تلقائيًا عند تشغيل السيرفر (idempotent).
> إذا رغبت بإيقاف ذلك: `AUTO_MIGRATE=false`.
4) شغّل السيرفر:
```bash
npm start
```
ثم افتح:
`http://localhost:3000`

## 2) التشغيل على Replit
1) ضع المتغيرات في **Replit Secrets**:
- `DATABASE_URL` (إجباري)
- `PORT` (اختياري)

2) شغّل المشروع (Run). ثم من الواجهة اضغط:
- **وضع تجريبي** → ينشئ AAPL و 2222.SR و DUMP + Snapshots + Alerts (A01..A07)

## 3) API Endpoints
- `GET /api/stocks?market=US|SA&search=`
- `GET /api/stocks/:id`
- `GET /api/watchlist`
- `POST /api/watchlist` body: `{ "symbol": "AAPL", "market": "US" }`
- `GET /api/alerts?stockId=`
- `GET /api/snapshots?stockId=&limit=`
- `GET /api/analyze?symbol=AAPL&market=US&tf=D`
- `POST /api/demo/seed`

## 6) ما الجديد في v1.8
- تحسين **Smart Money Flow** ليعمل كنظام مزدوج (Lite دائمًا + Pro عند توفر Intraday حقيقي).
- إضافة/تحسين **Institutional Flow**: دمج SMF + (VWAP/دلتا سيولة Intraday عند توفرها) + اتجاه SMA200 + سياق الحجم.
- إضافة **Earnings Growth Trend** (ربع سنوي) لفلترة الشركات ذات اتجاه نمو سلبي (أقوى في التقييم من MACD).
- تحديث **Trust Score** بأوزان جديدة مع إعادة وزن ديناميكي تلقائي عند غياب أي طبقة بيانات.
- بدون أي تغيير على منهج الواجهة: Vanilla + Tailwind، وبدون كسر Demo Mode.

### Manual Sentiment (Placeholder)
يمكن تمرير معاملات اختيارية في analyze:
- `newsText=`
- `hype=1`
- `noOfficial=1`

## 4) ملاحظات أمنية
- لا توجد أي مفاتيح API داخل `/public`.
- أي مفاتيح مستقبلية (Finnhub/AlphaVantage/EOD) يجب وضعها في Secrets واستخدامها داخل السيرفر فقط.

## 5) مزوّد البيانات (مجاني/اشتراك)
**افتراضيًا:** `yahoo_free` (بدون مفتاح) — يغطي US + SA (مثل 2222.SR) لكن عادةً بياناته متأخرة.

يمكن تغيير المزود من داخل تبويب **الإعدادات** (يُحفظ في DB داخل جدول `app_settings`):
- US: `yahoo_free` / `alphavantage_free` / `finnhub_paid` / `demo`
- SA: `yahoo_free` / `demo`

متغير البيئة (اختياري) — يستخدم كافتراضي عام إذا لم تستخدم صفحة الإعدادات:
- `STOCK_PROVIDER=auto|yahoo_free|alphavantage_free|finnhub_paid|demo`

المفاتيح (إن لزم):
- `FINNHUB_API_KEY`
- `ALPHAVANTAGE_API_KEY`


## v1.9 — Decision Support Layer
- أضيف حقل decision في /api/analyze (CONSIDER/WATCH/REDUCE_RISK/AVOID) مع أسباب مختصرة.
- أضيف خيار نمط المخاطر risk_profile داخل الإعدادات (conservative/balanced/aggressive).


## تنبيه مهم
هذا التطبيق أداة مساعدة لتحليل المخاطر والقرارات بشكل منهجي، ولا يُعد توصية استثمارية أو دعوة للشراء/البيع. القرار النهائي ومسؤولية المخاطر تقع على المستخدم.


## v2.6.1
- شموع احترافية + حجم مدمج
- إشارات التنبيهات على توقيت أقرب شمعة (Best-effort)
- دعم/مقاومة أكثر ذكاءً (Pivot clustering)


## v2.6.1 — وضع المستثمر الذكي
- صفحة تقييم شامل في بطاقة واحدة
- ملخص قرار نهائي (دخول / احتفاظ / تخفيف / خروج)
- حساب درجة دخول مثالية بناءً على دعم + RSI + سيولة
- حساب درجة خروج مثالية بناءً على مقاومة + توزيع سيولة
- نسبة ثقة بالقرار % (اعتمادًا على توافق المؤشرات)


## v2.6.1 — نظام السيناريوهين (Bull / Bear)
- توليد سيناريو أفضل حالة (Bull Case) مع:
  Entry / Stop / Target / Risk-Reward
  نسبة احتمال Bull %
- توليد سيناريو أسوأ حالة (Bear Case) مع:
  Exit Trigger / Downside Level
  نسبة احتمال Bear %
- حساب Risk/Reward Ratio تلقائياً
- عرض السيناريوهين داخل وضع المستثمر الذكي في بطاقة واحدة


## v2.6.1 — Confluence Engine + Relative Strength + Investor Profile

### Confluence Engine
- حساب درجة توافق المؤشرات (Trend + Smart Money + Institutional + RSI + Alerts)
- تصنيف الإشارة: Strong / Moderate / Weak / Conflicted

### Relative Strength
- مقارنة أداء السهم مقابل:
  - S&P 500 للأسهم الأمريكية
  - TASI للأسهم السعودية
- تصنيف: Outperforming / Neutral / Underperforming

### Investor Profile
- محافظ / متوسط / جريء
- تعديل شروط الدخول والخروج حسب مستوى المخاطرة
- رفع أو خفض نسبة الثقة المطلوبة لاتخاذ القرار


## v3.1.1 — Market Regime Engine
- كشف حالة السوق (Bullish / Sideways / Risk-Off)
- إدخال Market Regime في التحليل
- عرض بانر حالة السوق داخل صفحة السهم


## Render Deployment (استضافة عامة)

### 1) إنشاء Postgres على Render
- أنشئ PostgreSQL Database على Render.
- انسخ `DATABASE_URL` وضعه كمتغير بيئة في خدمة الويب.

### 2) إنشاء Web Service (Node)
- ارفع المشروع إلى GitHub ثم اربطه بـ Render Web Service.
- ضع المتغيرات التالية في Environment:
  - `DATABASE_URL` (إجباري)
  - `PORT` (Render يحددها تلقائياً غالباً)
  - `AUTO_MIGRATE=true` (يطبق `server/schema.sql` عند الإقلاع)
  - (اختياري Pro) مفاتيح المزودات:
    - `FINNHUB_KEY` أو `FINNHUB_API_KEY`
    - `ALPHA_VANTAGE_KEY` أو `ALPHAVANTAGE_API_KEY`
    - `EODHD_KEY`

### 3) أوامر Build/Start
اعتمد على package.json:
- Build Command: `npm install`
- Start Command: `npm start`

### 4) CORS للإصدار العام (موصى به)
ضع:
- `CORS_ORIGIN=https://your-domain.com`
(يمكن تمرير أكثر من origin بفواصل)



## API Response Contract

### GET /api/analyze?symbol=...&market=US|SA&tf=D
يرجع دائماً JSON بصيغة ثابتة (قد تكون بعض الحقول فارغة إذا لم تتوفر بيانات):

```json
{
  "ok": true,
  "stockId": 1,
  "symbol": "AAPL",
  "market": "US",
  "tf": "D",
  "quote": { "price": 0, "changePercent": 0, "volume": 0 },
  "indicators": {},
  "fundamentals": {},
  "score": 0,
  "traffic": "GREEN",
  "decision": {},
  "finalDecision": {},
  "alerts": [{ "code":"A01", "severity":"HIGH", "title_ar":"", "message_ar":"" }],
  "reasons": [],
  "scoreBreakdown": {},
  "meta": {}
}
```

### أخطاء شائعة (Error JSON)
- `RATE_LIMIT`: تم تجاوز حد الطلبات.
- `NO_DATA`: لا توجد بيانات كافية للرمز/الإطار الزمني.
- `PROVIDER_KEY_MISSING`: وضع Pro مفعل لكن مفتاح المزود غير موجود.
- `INVALID_SYMBOL_OR_MARKET`: إدخال غير صحيح.


## ملاحظة الإطارات الزمنية (Timeframes)
في v3.2.x التحليل السياقي (Context + Dynamic Weights + Fusion) مضبوط للإطار اليومي فقط: `tf=D`.
دعم الإطار الأسبوعي `tf=W` سيتم إضافته في v3.3.


## Assistant Output (Manager + Analyst)
يُرجع /api/analyze حقلًا اختياريًا `assistant` يقدّم ملخصًا حازمًا (بدون توصية شراء/بيع) مع أوامر عملية وأسباب رقمية قصيرة.


## v3.3.0 — Relative Strength + Sector Guard + W TF + Social Truth Proxy
- Relative Strength: مقارنة أداء السهم مقابل مؤشر السوق (S&P/TASI).
- Sector Guard: مقارنة اختيارية مقابل benchmark قطاع (sectorSymbol).
- دعم الإطار الأسبوعي W (تجميع أسبوعي).
- A04 Social Truth Detector: بروكسي (بدون scraping).


## v3.4.0 — Snapshotting Engine (Decision History)
- حفظ تحليل كل سهم (يومي/أسبوعي) في جدول analysis_snapshots.
- استخراج إحصاء سريع: ماذا حدث تاريخياً بعد ظهور نفس النمط (Pattern Key) خلال 7 أيام (D) أو 4 أسابيع (W).
- Endpoint جديد: GET /api/history?symbol=...&market=US|SA&tf=D|W
- الحفظ لا يغيّر الواجهة (UI) ويضيف حقول history اختيارية في /api/analyze.


## v3.4.1 — Snapshot Similarity (Fuzzy) + Faster Stats
- تحسين حساب إحصاء النمط دون استعلامات متكررة (حساب في الذاكرة).
- عند عدم توفر سجل كافٍ للنمط EXACT، ينتقل النظام تلقائيًا إلى FUZZY Similarity (تشابه بالـ traffic/regime + Jaccard على alerts/clusters).
- الهدف: تقليل مشكلة Cold-Start ورفع موثوقية "ماذا حدث سابقًا".


## v3.4.2 — Snapshot Intelligence + Decision Backtester
- جدول decision_journal لتسجيل قرارات النظام ونتائجها بعد N أيام.
- Endpoint: POST /api/journal/log لتسجيل نتيجة /api/analyze كما هي.
- Cron يومي (JOURNAL_CRON=true) يحدّث checked_at/future_change_pct/outcome_label.
- Endpoint: GET /api/journal/stats?days=30 لقياس دقة C01/A01 وتقليل false positives.
- إضافة history_analogies (آخر نتائج C01/A01) داخل /api/analyze (اختياري/غير كاسر).


## v3.4.3 — تفعيل A04 (Sentiment vs Reality) بدون Scraping
- A04 لم يعد Placeholder: يعمل فورًا عبر Manual Sentiment (hype_score/news_severity) من query أو من DB.
- Endpoint: GET /api/sentiment?symbol=...&market=... (manual/provider placeholder).
- Endpoint: POST /api/sentiment/manual لتحديث قيم manual داخل DB.
- /api/analyze يدعم query: hype_score, news_severity, sentiment_mode=manual|provider.
- الأسباب عربية قصيرة (Explainable) داخل alert A04.


## v3.5.0 — Data Integrity Engine + Failover + Freshness-aware Confidence
- meta.data_quality: provider_used, lag_minutes, missing_days_ratio, integrity_flags.
- Free/Pro validation: DATA_MISMATCH_FREE_PRO عند اختلاف الإغلاق بين المزودين.
- Failover تلقائي من Pro إلى Free عند فشل المزود (PROVIDER_FAILOVER_TO_FREE).
- خفض الثقة تلقائيًا عند تأخر البيانات (DATA_STALE) أو فجوات (DATA_GAPS).
- Low Confidence Shield: يخفف أحكام RED و A01 HIGH عند ضعف البيانات.
- حفظ data_quality_json داخل stock_snapshots و decision_journal.
- ENV اختياري: DATA_MISMATCH_THRESHOLD_PCT (default 0.8).


## v3.10.0 — Data Housekeeping (Smart Retention)
- AUTO_HOUSEKEEPING, SNAPSHOT_RETENTION_DAYS
- Monthly summaries in monthly_performance_summary
- Deletes old analysis_snapshots after summarizing
