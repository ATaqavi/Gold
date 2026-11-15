import { useState, useEffect, useCallback } from 'react';

// Constants
const TROY_OUNCE_GRAMS = 31.1035;

interface MarketQuote {
  bid: number;
  ask: number;
  change: number;
  change_pct: number;
  high: number;
  low: number;
  digits: number;
}

function App() {
  const [goldPriceUSD, setGoldPriceUSD] = useState<number | null>(null);
  const [goldPricePerGramIRR, setGoldPricePerGramIRR] = useState<number | null>(null);
  const [goldPrice18k, setGoldPrice18k] = useState<number | null>(null);
  const [calculatedDollarRate, setCalculatedDollarRate] = useState<number | null>(null);
  const [officialDollarRate, setOfficialDollarRate] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<Record<string, MarketQuote> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [dataSource, setDataSource] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch live quotes for XAU/USD (global gold price)
      const quotesRes = await fetch('https://crystalballmarkets.com/markets/api/v1/quotes.json');
      const quotesJson = await quotesRes.json();
      const quotesData = quotesJson.data;
      setQuotes(quotesData);

      if (quotesData['XAUUSD']) {
        setGoldPriceUSD(quotesData['XAUUSD'].bid);
      }

      // 2. Fetch gold prices by country (includes Iran)
      const goldRes = await fetch('https://crystalballmarkets.com/markets/api/v1/gold.json');
      const goldJson = await goldRes.json();
      const goldData = goldJson.data;

      // Find Iran's gold price
      const iranGold = goldData.countries.find((c: { country: string }) => c.country === 'IR');
      if (iranGold) {
        // This is the price of gold in Iran (per gram, 24K)
        setGoldPricePerGramIRR(iranGold.price);
        setDataSource('Crystal Ball Markets');
      } else {
        // Fallback: calculate from global price
        setDataSource('محاسبه از نرخ جهانی');
      }

      // 3. Fetch exchange rates for IRR
      const ratesRes = await fetch('https://crystalballmarkets.com/markets/api/v1/rates.json');
      const ratesJson = await ratesRes.json();
      const irrRate = ratesJson.data.rates['IRR'];
      if (irrRate) {
        // This is the official rate: how many IRR per 1 USD
        setOfficialDollarRate(irrRate.rate);
      }

      setLastUpdate(new Date().toLocaleString('fa-IR'));
    } catch (err) {
      console.error('Primary API failed, trying fallback...', err);
      
      // Fallback: Use alternative free APIs
      try {
        // Try frankfurter for exchange rates
        const frankRes = await fetch('https://api.frankfurter.dev/v1/latest?base=USD');
        const frankJson = await frankRes.json();
        if (frankJson.rates && frankJson.rates.IRR) {
          setOfficialDollarRate(frankJson.rates.IRR);
        }

        // Try alternative gold API
        const goldAltRes = await fetch('https://api.metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XAU');
        if (goldAltRes.ok) {
          const goldAltJson = await goldAltRes.json();
          if (goldAltJson.rates && goldAltJson.rates.XAU) {
            // XAU rate means how many ounces per USD
            setGoldPriceUSD(1 / goldAltJson.rates.XAU);
          }
        }

        setDataSource('API جایگزین');
        setLastUpdate(new Date().toLocaleString('fa-IR'));
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
        setError('خطا در دریافت اطلاعات از تمام منابع. لطفاً اتصال اینترنت خود را بررسی کنید.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate derived values when gold prices change
  useEffect(() => {
    if (goldPriceUSD && goldPricePerGramIRR) {
      // Calculate dollar rate from gold:
      // If 1 gram of 24K gold in Iran = X IRR
      // And 1 troy ounce (31.1035 grams) of gold = Y USD globally
      // Then: Dollar rate (IRR per USD) = (X × 31.1035) / Y
      const rate = (goldPricePerGramIRR * TROY_OUNCE_GRAMS) / goldPriceUSD;
      setCalculatedDollarRate(Math.round(rate));

      // Calculate 18K gold price per gram
      // 18K = 75% of 24K gold value
      const price18k = Math.round(goldPricePerGramIRR * 0.75);
      setGoldPrice18k(price18k);
    } else if (goldPriceUSD && officialDollarRate) {
      // If we have global gold and official rate, calculate expected gold price
      // Expected gold per gram (IRR) = (Gold USD × Official Rate) / 31.1035
      const expectedGoldPerGram = (goldPriceUSD * officialDollarRate) / TROY_OUNCE_GRAMS;
      setGoldPricePerGramIRR(Math.round(expectedGoldPerGram));
      setGoldPrice18k(Math.round(expectedGoldPerGram * 0.75));
      
      // In this case, calculated rate = official rate (they're the same)
      setCalculatedDollarRate(Math.round(officialDollarRate));
    }
  }, [goldPriceUSD, goldPricePerGramIRR, officialDollarRate]);

  useEffect(() => {
    fetchData();
    let interval: ReturnType<typeof setInterval>;
    if (autoRefresh) {
      interval = setInterval(fetchData, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchData, autoRefresh]);

  const formatNumber = (num: number | null, decimals = 0): string => {
    if (num === null || num === undefined) return '---';
    return new Intl.NumberFormat('fa-IR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const formatToman = (num: number | null): string => {
    if (num === null || num === undefined) return '---';
    return new Intl.NumberFormat('fa-IR').format(Math.round(num / 10)) + ' تومان';
  };

  const getChangeColor = (change: number): string => {
    if (change > 0) return 'text-green-400';
    if (change < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getChangeIcon = (change: number): string => {
    if (change > 0) return '▲';
    if (change < 0) return '▼';
    return '●';
  };

  const getChangeBg = (change: number): string => {
    if (change > 0) return 'bg-green-500/10 border-green-500/20';
    if (change < 0) return 'bg-red-500/10 border-red-500/20';
    return 'bg-gray-500/10 border-gray-500/20';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 text-white">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="relative bg-black/40 backdrop-blur-xl border-b border-yellow-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <span className="text-2xl">💰</span>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-amber-300 bg-clip-text text-transparent">
                سامانه نرخ لحظه‌ای
              </h1>
              <p className="text-xs text-gray-400">طلا، دلار و بازارهای جهانی</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
              autoRefresh ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-gray-700/30 text-gray-500 border border-gray-600/20'
            }`}>
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></span>
              {autoRefresh ? 'زنده' : 'متوقف'}
            </div>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="px-3 py-1.5 bg-gray-800/50 text-gray-300 border border-gray-600/30 rounded-lg text-xs hover:bg-gray-700/50 transition-all"
            >
              {autoRefresh ? '⏸ توقف' : '▶ شروع'}
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-1.5 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg text-xs font-medium hover:from-yellow-500/30 hover:to-amber-500/30 transition-all disabled:opacity-50"
            >
              {loading ? '⏳ ...' : '🔄 بروزرسانی'}
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 py-8">
        {/* Status Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <span>📡 منبع: {dataSource || 'در حال بارگذاری...'}</span>
            {lastUpdate && <span>🕐 {lastUpdate}</span>}
          </div>
          {loading && (
            <span className="text-yellow-400 animate-pulse">⏳ در حال دریافت اطلاعات...</span>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-center text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Main Price Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {/* Global Gold Ounce */}
          <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-950/40 border border-yellow-500/20 rounded-2xl p-5 backdrop-blur-sm hover:border-yellow-500/40 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-yellow-400/70">🥇 انس جهانی طلا</span>
              {quotes?.XAUUSD && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${getChangeBg(quotes.XAUUSD.change_pct)} ${getChangeColor(quotes.XAUUSD.change_pct)}`}>
                  {getChangeIcon(quotes.XAUUSD.change_pct)} {Math.abs(quotes.XAUUSD.change_pct).toFixed(2)}%
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-yellow-400 mb-1 group-hover:scale-105 transition-transform origin-right">
              ${formatNumber(goldPriceUSD, 2)}
            </div>
            <div className="text-xs text-gray-500">دلار / هر انس تروی</div>
            {quotes?.XAUUSD && (
              <div className="mt-3 pt-3 border-t border-yellow-500/10 flex justify-between text-xs">
                <span className="text-gray-500">بالا: <span className="text-green-400">${quotes.XAUUSD.high.toFixed(2)}</span></span>
                <span className="text-gray-500">پایین: <span className="text-red-400">${quotes.XAUUSD.low.toFixed(2)}</span></span>
              </div>
            )}
          </div>

          {/* Iran Gold 24K */}
          <div className="bg-gradient-to-br from-amber-900/20 to-amber-950/40 border border-amber-500/20 rounded-2xl p-5 backdrop-blur-sm hover:border-amber-500/40 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-amber-400/70">🏅 طلای ۲۴ عیار</span>
              <span className="text-xs text-gray-500">ایران</span>
            </div>
            <div className="text-2xl font-bold text-amber-400 mb-1 group-hover:scale-105 transition-transform origin-right">
              {formatNumber(goldPricePerGramIRR)}
            </div>
            <div className="text-xs text-gray-500">تومان / هر گرم</div>
            {goldPricePerGramIRR && goldPriceUSD && (
              <div className="mt-3 pt-3 border-t border-amber-500/10 text-xs text-gray-500">
                معادل: ${(goldPricePerGramIRR * 10 * TROY_OUNCE_GRAMS / goldPriceUSD).toLocaleString('en-US', { maximumFractionDigits: 0 })} $/انس
              </div>
            )}
          </div>

          {/* 18K Gold */}
          <div className="bg-gradient-to-br from-orange-900/20 to-orange-950/40 border border-orange-500/20 rounded-2xl p-5 backdrop-blur-sm hover:border-orange-500/40 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-orange-400/70">💎 طلای ۱۸ عیار</span>
              <span className="text-xs text-gray-500">عیار ۷۵۰</span>
            </div>
            <div className="text-2xl font-bold text-orange-400 mb-1 group-hover:scale-105 transition-transform origin-right">
              {formatNumber(goldPrice18k)}
            </div>
            <div className="text-xs text-gray-500">تومان / هر گرم</div>
          </div>

          {/* Silver */}
          <div className="bg-gradient-to-br from-gray-700/20 to-gray-800/40 border border-gray-500/20 rounded-2xl p-5 backdrop-blur-sm hover:border-gray-500/40 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-300/70">🥈 انس نقره</span>
              {quotes?.XAGUSD && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${getChangeBg(quotes.XAGUSD.change_pct)} ${getChangeColor(quotes.XAGUSD.change_pct)}`}>
                  {getChangeIcon(quotes.XAGUSD.change_pct)} {Math.abs(quotes.XAGUSD.change_pct).toFixed(2)}%
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-gray-300 mb-1 group-hover:scale-105 transition-transform origin-right">
              ${quotes?.XAGUSD ? formatNumber(quotes.XAGUSD.bid, 2) : '---'}
            </div>
            <div className="text-xs text-gray-500">دلار / هر انس</div>
          </div>
        </div>

        {/* Dollar Rate Section - Main Feature */}
        <div className="bg-gradient-to-br from-blue-950/40 to-indigo-950/30 border border-blue-500/20 rounded-2xl p-6 backdrop-blur-sm mb-8">
          <h2 className="text-xl font-bold text-blue-400 mb-6 flex items-center gap-2">
            <span className="text-2xl">💵</span>
            <span>محاسبه نرخ دلار از روی طلا</span>
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Calculated Rate */}
            <div className="bg-black/30 rounded-xl p-6 border border-blue-500/10 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
              <div className="text-sm text-blue-300/80 mb-2">📊 نرخ دلار (محاسبه‌شده از طلا)</div>
              <div className="text-5xl font-bold text-blue-400 mb-2 tabular-nums">
                {calculatedDollarRate ? formatNumber(Math.round(calculatedDollarRate / 10)) : '---'}
              </div>
              <div className="text-sm text-gray-400">تومان / هر دلار</div>
              <div className="mt-4 text-xs text-gray-500 bg-black/20 rounded-lg p-3 leading-relaxed">
                <span className="text-blue-400">فرمول:</span> (قیمت گرم طلا × ۳۱.۱۰۳۵) ÷ قیمت انس جهانی
              </div>
            </div>

            {/* Official Rate */}
            <div className="bg-black/30 rounded-xl p-6 border border-green-500/10 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-emerald-500"></div>
              <div className="text-sm text-green-300/80 mb-2">🏦 نرخ رسمی (مرجع بین‌المللی)</div>
              <div className="text-5xl font-bold text-green-400 mb-2 tabular-nums">
                {officialDollarRate ? formatNumber(Math.round(officialDollarRate / 10)) : '---'}
              </div>
              <div className="text-sm text-gray-400">تومان / هر دلار (نرخ رسمی)</div>
              <div className="mt-4 text-xs text-gray-500 bg-black/20 rounded-lg p-3 leading-relaxed">
                <span className="text-green-400">توجه:</span> نرخ رسمی بانک مرکزی - با بازار آزاد تفاوت دارد
              </div>
            </div>
          </div>

          {/* Difference Analysis */}
          {calculatedDollarRate && officialDollarRate && (
            <div className="mt-6 bg-black/20 rounded-xl p-5 border border-white/5">
              <h3 className="text-sm font-bold text-white mb-3">📊 تحلیل اختلاف نرخ</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">نرخ محاسبه‌شده</div>
                  <div className="text-lg font-bold text-blue-400">{formatNumber(Math.round(calculatedDollarRate / 10))} ت</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">نرخ رسمی</div>
                  <div className="text-lg font-bold text-green-400">{formatNumber(Math.round(officialDollarRate / 10))} ت</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">اختلاف (حباب)</div>
                  <div className={`text-lg font-bold ${
                    ((calculatedDollarRate / 10) - (officialDollarRate / 10)) > 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {formatNumber(Math.abs(Math.round((calculatedDollarRate - officialDollarRate) / 10)))} ت
                    <span className="text-xs text-gray-500 mr-1">
                      ({(((calculatedDollarRate - officialDollarRate) / officialDollarRate) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500 text-center">
                💡 اگر نرخ محاسبه‌شده از طلا بیشتر از نرخ رسمی باشد، نشان‌دهنده حباب مثبت در بازار طلا است
              </div>
            </div>
          )}
        </div>

        {/* Calculation Steps */}
        <div className="bg-gradient-to-br from-purple-950/30 to-violet-950/20 border border-purple-500/20 rounded-2xl p-6 backdrop-blur-sm mb-8">
          <h2 className="text-lg font-bold text-purple-400 mb-4 flex items-center gap-2">
            <span>📐</span> مراحل محاسبه نرخ دلار از طلا
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-black/30 rounded-lg p-4 border border-purple-500/10 text-center">
              <div className="text-2xl mb-2">①</div>
              <div className="text-xs text-gray-400 mb-1">قیمت انس جهانی</div>
              <div className="text-sm font-bold text-yellow-400">${formatNumber(goldPriceUSD, 2)}</div>
            </div>
            <div className="bg-black/30 rounded-lg p-4 border border-purple-500/10 text-center">
              <div className="text-2xl mb-2">②</div>
              <div className="text-xs text-gray-400 mb-1">قیمت گرم طلا (ایران)</div>
              <div className="text-sm font-bold text-amber-400">{formatNumber(goldPricePerGramIRR)} ت</div>
            </div>
            <div className="bg-black/30 rounded-lg p-4 border border-purple-500/10 text-center">
              <div className="text-2xl mb-2">③</div>
              <div className="text-xs text-gray-400 mb-1">ضربدر ۳۱.۱۰۳۵</div>
              <div className="text-sm font-bold text-purple-400">
                {goldPricePerGramIRR ? formatNumber(Math.round(goldPricePerGramIRR * TROY_OUNCE_GRAMS)) : '---'}
              </div>
            </div>
            <div className="bg-black/30 rounded-lg p-4 border border-purple-500/10 text-center">
              <div className="text-2xl mb-2">④</div>
              <div className="text-xs text-gray-400 mb-1">تقسیم بر انس</div>
              <div className="text-sm font-bold text-blue-400">
                {calculatedDollarRate ? formatNumber(Math.round(calculatedDollarRate / 10)) + ' ت/$' : '---'}
              </div>
            </div>
          </div>

          <div className="bg-black/30 rounded-xl p-4 text-center" dir="ltr">
            <code className="text-purple-300 text-sm">
              Dollar Rate = (Gold<sub>gram</sub> × 31.1035) ÷ Gold<sub>ounce</sub>
            </code>
            <div className="text-xs text-gray-500 mt-2">
              31.1035 grams = 1 Troy Ounce | Gold<sub>gram</sub> in IRR | Gold<sub>ounce</sub> in USD
            </div>
          </div>
        </div>

        {/* Other Markets */}
        {quotes && (
          <div className="bg-gradient-to-br from-gray-800/20 to-gray-900/30 border border-gray-600/20 rounded-2xl p-6 backdrop-blur-sm mb-8">
            <h2 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
              <span>📈</span> سایر بازارهای جهانی
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: 'EURUSD', name: '🇪🇺 یورو/دلار', flag: '🇪🇺' },
                { key: 'GBPUSD', name: '🇬🇧 پوند/دلار', flag: '🇬🇧' },
                { key: 'USDJPY', name: '🇯🇵 دلار/ین', flag: '🇯🇵' },
                { key: 'USOIL', name: '🛢️ نفت آمریکا', flag: '🛢️' },
              ].map(({ key, name }) => {
                const q = quotes[key];
                if (!q) return null;
                return (
                  <div key={key} className="bg-black/20 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all">
                    <div className="text-xs text-gray-400 mb-2">{name}</div>
                    <div className="text-lg font-bold text-white tabular-nums">{q.bid.toFixed(q.digits)}</div>
                    <div className={`text-xs mt-1 ${getChangeColor(q.change_pct)}`}>
                      {getChangeIcon(q.change_pct)} {Math.abs(q.change_pct).toFixed(2)}%
                    </div>
                    <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-xs text-gray-500">
                      <span>H: {q.high.toFixed(q.digits)}</span>
                      <span>L: {q.low.toFixed(q.digits)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info & Guide */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-gray-800/20 to-gray-900/30 border border-gray-600/20 rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-base font-bold text-gray-300 mb-3 flex items-center gap-2">
              <span>📖</span> راهنمای محاسبه
            </h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <span>هر <strong className="text-yellow-400">انس تروی</strong> = ۳۱.۱۰۳۵ گرم</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <span>طلای <strong className="text-amber-400">۲۴ عیار</strong> = خلوص ۹۹.۹٪</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <span>طلای <strong className="text-orange-400">۱۸ عیار</strong> = خلوص ۷۵٪ (۷۵۰ در هزار)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <span>نرخ دلار از طلا = (قیمت گرم طلا × ۳۱.۱۰۳۵) ÷ قیمت انس</span>
              </li>
            </ul>
          </div>

          <div className="bg-gradient-to-br from-gray-800/20 to-gray-900/30 border border-gray-600/20 rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-base font-bold text-gray-300 mb-3 flex items-center gap-2">
              <span>⚠️</span> سلب مسئولیت
            </h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>این نرخ‌ها صرفاً جنبه <strong className="text-blue-400">اطلاع‌رسانی</strong> دارند</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>نرخ محاسبه‌شده ممکن است با بازار آزاد <strong className="text-blue-400">تفاوت</strong> داشته باشد</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>حباب بازار، هزینه‌های واردات و سود فروشندگان لحاظ نشده</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>اطلاعات هر <strong className="text-blue-400">۶۰ ثانیه</strong> بروزرسانی می‌شود</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-gray-500 pb-8 border-t border-gray-800 pt-6">
          <p className="mb-2">
            📡 داده‌ها از{' '}
            <a
              href="https://crystalballmarkets.com/markets"
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-500/70 hover:text-yellow-400 underline transition-colors"
            >
              Crystal Ball Markets
            </a>
            {' '}دریافت می‌شود
          </p>
          <p>⚡ بروزرسانی خودکار هر ۶۰ ثانیه | آخرین بروزرسانی: {lastUpdate || '---'}</p>
        </footer>
      </main>
    </div>
  );
}

export default App;
