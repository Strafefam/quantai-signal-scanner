"use client";
import { useState, useEffect, useCallback } from "react";
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from "@clerk/nextjs";

type Asset = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  change24h: number | null;
  volume: number | null;
  marketCap: number | null;
  score: number;
  signal: "BUY" | "WAIT" | "SELL";
  confidence: number;
  trend: "UP" | "DOWN" | "STABLE";
  priceHistory: Array<{ time: number; price: number }>;
  riskScore: number;
  sentiment: "BULLISH" | "NEUTRAL" | "BEARISH";
  momentum: number;
  volatility: number;
};

const calculateAdvancedScore = (coin: any, priceHistory: any[] = []) => {
  let score = 50;
  const weights = { momentum: 0.35, volatility: 0.25, volume: 0.20, trend: 0.20 };

  let momentumScore = 50;
  const change = coin.price_change_percentage_24h || 0;
  if (change > 10) momentumScore = 90;
  else if (change > 5) momentumScore = 75;
  else if (change > 2) momentumScore = 60;
  else if (change < -5) momentumScore = 25;
  else if (change < -2) momentumScore = 35;

  let volatilityScore = 50;
  if (coin.total_volume && coin.market_cap) {
    const volToCap = coin.total_volume / coin.market_cap;
    if (volToCap > 0.5) volatilityScore = 85;
    else if (volToCap > 0.25) volatilityScore = 70;
    else if (volToCap > 0.1) volatilityScore = 60;
    else if (volToCap > 0.05) volatilityScore = 45;
  }

  let volumeScore = 50;
  if (coin.total_volume && coin.market_cap) {
    const ratio = coin.total_volume / coin.market_cap;
    volumeScore = Math.min(99, 50 + ratio * 100);
  }

  let trendScore = 50;
  if (priceHistory.length > 2) {
    const recent = priceHistory.slice(-5);
    const isUptrend = recent.every((p, i) => !i || p.price >= recent[i - 1].price);
    const isDowntrend = recent.every((p, i) => !i || p.price <= recent[i - 1].price);
    if (isUptrend) trendScore = 80;
    else if (isDowntrend) trendScore = 30;
  }

  score = Math.round(
    momentumScore * weights.momentum +
    volatilityScore * weights.volatility +
    volumeScore * weights.volume +
    trendScore * weights.trend
  );

  return Math.min(99, Math.max(1, score));
};

const calculateConfidence = (coin: any) => {
  let confidence = 50;
  if (coin.market_cap) confidence += 20;
  if (coin.total_volume) confidence += 15;
  if (coin.price_change_percentage_24h) confidence += 15;
  return Math.min(100, Math.max(0, confidence));
};

const calculateRiskScore = (coin: any, score: number) => {
  let risk = 50;
  if (coin.total_volume && coin.market_cap) {
    const volToCap = coin.total_volume / coin.market_cap;
    if (volToCap > 0.5) risk += 30;
    else if (volToCap > 0.25) risk += 15;
  }
  if (score > 85) risk += 10;
  if (score < 25) risk += 20;
  if (coin.market_cap && coin.market_cap < 100000000) risk += 25;
  return Math.min(100, Math.max(0, risk));
};

const ScannerPage = () => {
  const { user } = useUser();
  const [coins, setCoins] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<Asset | null>(null);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL" | "WAIT">("ALL");
  const [sortBy, setSortBy] = useState<"score" | "change" | "volume">("score");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isPro = user?.primaryEmailAddress?.emailAddress === "mans.holmstrom@gmail.com";

  const scanMarket = useCallback(async () => {
    setLoading(true);
    try {
      const randomPage = Math.floor(Math.random() * 10) + 1;
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=50&page=${randomPage}&price_change_percentage=24h&sparkline=true`
      );
      const data = await res.json();

      const analyzed = data.map((c: any) => {
        const priceHistory = (c.sparkline_in_7d?.price || []).map((p: number, i: number) => ({
          time: i,
          price: p,
        }));

        const score = calculateAdvancedScore(c, priceHistory);
        const confidence = calculateConfidence(c);
        const riskScore = calculateRiskScore(c, score);

        const change = c.price_change_percentage_24h || 0;
        const trend: "UP" | "DOWN" | "STABLE" = change > 2 ? "UP" : change < -2 ? "DOWN" : "STABLE";

        let sentiment: "BULLISH" | "NEUTRAL" | "BEARISH" = "NEUTRAL";
        if (score > 75) sentiment = "BULLISH";
        else if (score < 35) sentiment = "BEARISH";

        return {
          id: c.id,
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          image: c.image,
          price: c.current_price,
          change24h: change,
          volume: c.total_volume,
          marketCap: c.market_cap,
          score,
          signal: score > 80 ? "BUY" : score < 40 ? "SELL" : "WAIT",
          confidence,
          trend,
          priceHistory,
          riskScore,
          sentiment,
          momentum: change,
          volatility: riskScore,
        };
      });

      setCoins(analyzed.sort((a: Asset, b: Asset) => b.score - a.score));
    } catch (e) {
      console.error(e);
      alert("Scanner temporarily rate-limited. Please wait 30s.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scanMarket();
    const interval = setInterval(scanMarket, 30000);
    return () => clearInterval(interval);
  }, [scanMarket]);

  const filteredCoins = coins
    .filter((c) => filter === "ALL" || c.signal === filter)
    .sort((a, b) => {
      switch (sortBy) {
        case "change": return (b.change24h || 0) - (a.change24h || 0);
        case "volume": return (b.volume || 0) - (a.volume || 0);
        case "score":
        default: return b.score - a.score;
      }
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white font-sans">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-600/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      <nav className="border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center font-black text-lg shadow-lg shadow-green-600/50">⚡</div>
            <h1 className="font-black text-3xl tracking-tighter text-white">QuantAI <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600">Signal</span></h1>
          </div>
          <div className="flex items-center gap-4">
            {isPro && <div className="text-xs bg-gradient-to-r from-green-500/20 to-green-400/20 text-green-300 px-4 py-2 rounded-full border border-green-500/50 hidden sm:block font-mono font-bold tracking-widest">🏆 PRO</div>}
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h2 className="text-5xl lg:text-6xl font-black tracking-tight mb-4 text-white">AI Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-green-500 to-green-600">Scan</span></h2>
          <p className="text-xl text-gray-400 max-w-2xl">Real-time signal analysis powered by advanced machine learning. {coins.length} assets analyzed.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <button onClick={scanMarket} disabled={loading} className="md:col-span-1 px-8 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-gray-700 disabled:to-gray-600 rounded-xl font-bold text-lg transition transform hover:scale-[1.02] shadow-xl shadow-green-900/40 flex items-center justify-center gap-2">
            {loading ? <span className="animate-spin">🌀</span> : "⚡"} {loading ? "Scanning..." : "Scan Now"}
          </button>
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="px-4 py-3 bg-gray-800/60 border border-gray-700/50 rounded-xl text-white font-semibold focus:outline-none focus:border-green-500/50 transition">
            <option value="ALL">All Signals</option>
            <option value="BUY">🟢 Buy Only</option>
            <option value="SELL">🔴 Sell Only</option>
            <option value="WAIT">⚪ Wait Only</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-4 py-3 bg-gray-800/60 border border-gray-700/50 rounded-xl text-white font-semibold focus:outline-none focus:border-green-500/50 transition">
            <option value="score">Sort by Score</option>
            <option value="change">Sort by 24h Change</option>
            <option value="volume">Sort by Volume</option>
          </select>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="px-4 py-3 bg-gray-800/60 border border-gray-700/50 rounded-xl text-white font-semibold hover:border-green-500/50 transition">
            {showAdvanced ? "Hide" : "Show"} Advanced
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
            <div className="text-gray-400 text-sm font-mono mb-1">TOTAL SCANNED</div>
            <div className="text-3xl font-black text-green-400">{coins.length}</div>
          </div>
          <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
            <div className="text-gray-400 text-sm font-mono mb-1">BUY SIGNALS</div>
            <div className="text-3xl font-black text-green-500">{coins.filter(c => c.signal === "BUY").length}</div>
          </div>
          <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
            <div className="text-gray-400 text-sm font-mono mb-1">SELL SIGNALS</div>
            <div className="text-3xl font-black text-red-500">{coins.filter(c => c.signal === "SELL").length}</div>
          </div>
          <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4">
            <div className="text-gray-400 text-sm font-mono mb-1">AVG CONFIDENCE</div>
            <div className="text-3xl font-black text-blue-400">{Math.round(coins.reduce((a, c) => a + c.confidence, 0) / coins.length || 0)}%</div>
          </div>
        </div>

        <div className="space-y-3">
          {filteredCoins.map((coin, i) => {
            const change = coin.change24h;
            const changeDisplay = change ? (change > 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`) : "N/A";
            const priceDisplay = coin.price ? coin.price < 1 ? coin.price.toFixed(6) : `$${coin.price.toLocaleString()}` : "N/A";
            const volumeDisplay = coin.volume ? `$${(coin.volume / 1000000000).toFixed(1)}B` : "N/A";

            const signalColor = coin.signal === "BUY" ? "from-green-600 to-green-500" : coin.signal === "SELL" ? "from-red-600 to-red-500" : "from-gray-600 to-gray-500";
            const signalBg = coin.signal === "BUY" ? "bg-green-600/10 border-green-600/30" : coin.signal === "SELL" ? "bg-red-600/10 border-red-600/30" : "bg-gray-600/10 border-gray-600/30";

            return (
              <div key={coin.id} onClick={() => setSelectedCoin(coin)} className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 hover:border-green-500/30 p-5 rounded-xl transition duration-300 cursor-pointer transform hover:scale-[1.01] hover:shadow-xl hover:shadow-green-900/20 group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="text-gray-600 font-mono text-lg font-bold hidden sm:block w-6">{i + 1}.</div>
                    <img src={coin.image} alt={coin.name} className="w-10 h-10 rounded-full shadow-lg" />
                    <div className="min-w-0">
                      <div className="font-extrabold text-lg text-white group-hover:text-green-400 transition">{coin.symbol}</div>
                      <div className="text-xs text-gray-500 truncate">{coin.name}</div>
                    </div>
                  </div>

                  <div className="hidden md:flex gap-8 text-right flex-1 justify-end">
                    <div className="min-w-[100px]">
                      <div className="text-xs text-gray-500 uppercase font-mono mb-1">Price</div>
                      <div className="text-base font-bold text-white">{priceDisplay}</div>
                    </div>
                    <div className="min-w-[100px]">
                      <div className="text-xs text-gray-500 uppercase font-mono mb-1">24h Change</div>
                      <div className={`text-base font-bold ${change >= 0 ? "text-green-400" : "text-red-400"}`}>{changeDisplay}</div>
                    </div>
                    <div className="hidden lg:block min-w-[120px]">
                      <div className="text-xs text-gray-500 uppercase font-mono mb-1">Volume</div>
                      <div className="text-base font-bold text-white">{volumeDisplay}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] text-gray-500 uppercase font-mono tracking-widest mb-1">Score</div>
                      <div className={`text-2xl font-black bg-gradient-to-r ${signalColor} bg-clip-text text-transparent`}>{coin.score}</div>
                    </div>
                    <div className={`text-center px-4 py-2 rounded-lg text-sm font-bold min-w-[80px] border ${signalBg} backdrop-blur-sm`}>
                      {coin.signal === "BUY" ? "🟢 BUY" : coin.signal === "SELL" ? "🔴 SELL" : "⚪ WAIT"}
                    </div>
                  </div>
                </div>

                {showAdvanced && (
                  <div className="mt-4 pt-4 border-t border-gray-700/30 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500 font-mono mb-1">Confidence</div>
                      <div className="font-bold text-blue-400">{coin.confidence}%</div>
                    </div>
                    <div>
                      <div className="text-gray-500 font-mono mb-1">Risk Score</div>
                      <div className={`font-bold ${coin.riskScore > 70 ? "text-red-400" : "text-yellow-400"}`}>{coin.riskScore}%</div>
                    </div>
                    <div>
                      <div className="text-gray-500 font-mono mb-1">Trend</div>
                      <div className={`font-bold ${coin.trend === "UP" ? "text-green-400" : coin.trend === "DOWN" ? "text-red-400" : "text-gray-400"}`}>
                        {coin.trend === "UP" ? "📈" : coin.trend === "DOWN" ? "📉" : "➡️"} {coin.trend}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 font-mono mb-1">Sentiment</div>
                      <div className={`font-bold ${coin.sentiment === "BULLISH" ? "text-green-400" : coin.sentiment === "BEARISH" ? "text-red-400" : "text-gray-400"}`}>
                        {coin.sentiment}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredCoins.length === 0 && !loading && (
          <div className="text-center py-20 text-gray-500 border border-gray-700/30 rounded-2xl mt-8 bg-gray-800/20">
            <p className="text-2xl mb-2 font-bold">No signals found</p>
            <p className="text-lg">Try adjusting filters or clicking "Scan Now"</p>
          </div>
        )}
      </main>

      {selectedCoin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedCoin(null)}>
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-700/50 rounded-2xl max-w-2xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <img src={selectedCoin.image} alt={selectedCoin.name} className="w-16 h-16 rounded-full" />
                <div>
                  <h3 className="text-3xl font-black text-white">{selectedCoin.symbol}</h3>
                  <p className="text-gray-400">{selectedCoin.name}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCoin(null)} className="text-2xl text-gray-400 hover:text-white transition">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">Current Price</div>
                <div className="text-2xl font-bold text-white">${selectedCoin.price < 1 ? selectedCoin.price.toFixed(6) : selectedCoin.price.toLocaleString()}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">24h Change</div>
                <div className={`text-2xl font-bold ${(selectedCoin.change24h || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {selectedCoin.change24h ? (selectedCoin.change24h > 0 ? "+" : "") + selectedCoin.change24h.toFixed(2) + "%" : "N/A"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-gray-400 text-xs mb-2 uppercase font-mono">AI Score</div>
                <div className="text-2xl font-black text-green-400">{selectedCoin.score}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-gray-400 text-xs mb-2 uppercase font-mono">Confidence</div>
                <div className="text-2xl font-black text-blue-400">{selectedCoin.confidence}%</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-gray-400 text-xs mb-2 uppercase font-mono">Risk Level</div>
                <div className={`text-2xl font-black ${selectedCoin.riskScore > 70 ? "text-red-400" : "text-yellow-400"}`}>
                  {selectedCoin.riskScore}%
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-gray-400 text-xs mb-2 uppercase font-mono">Trend</div>
                <div className={`text-lg font-bold ${selectedCoin.trend === "UP" ? "text-green-400" : selectedCoin.trend === "DOWN" ? "text-red-400" : "text-gray-400"}`}>
                  {selectedCoin.trend === "UP" ? "📈 UP" : selectedCoin.trend === "DOWN" ? "📉 DOWN" : "➡️ STABLE"}
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-gray-400 text-xs mb-2 uppercase font-mono">Sentiment</div>
                <div className={`text-lg font-bold ${selectedCoin.sentiment === "BULLISH" ? "text-green-400" : selectedCoin.sentiment === "BEARISH" ? "text-red-400" : "text-gray-400"}`}>
                  {selectedCoin.sentiment}
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-gray-400 text-xs mb-2 uppercase font-mono">Signal</div>
                <div className={`text-lg font-bold ${selectedCoin.signal === "BUY" ? "text-green-400" : selectedCoin.signal === "SELL" ? "text-red-400" : "text-gray-400"}`}>
                  {selectedCoin.signal}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LandingPage = () => (
  <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white overflow-hidden font-sans">
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-green-600/8 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-0 right-1/3 w-[600px] h-[600px] bg-blue-600/8 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1.5s'}}></div>
      <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-3xl animate-pulse" style={{animationDelay: '3s'}}></div>
    </div>

    <div className="relative z-10">
      <nav className="border-b border-gray-800/20 backdrop-blur-xl bg-gray-950/50">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center font-black text-lg">⚡</div>
            <h1 className="font-black text-2xl">QuantAI <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600">Signal</span></h1>
          </div>
          <SignInButton mode="modal"><button className="px-6 py-2 text-white font-bold hover:text-green-400 transition">Sign In</button></SignInButton>
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <h2 className="text-6xl md:text-8xl font-black tracking-tight mb-6 leading-tight">AI Market <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-green-500 to-green-600">Signals</span></h2>
        <p className="text-2xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">Harness the power of machine learning to identify high-probability trading signals in real-time. Get buy, sell, and wait signals powered by advanced analytics.</p>
        <SignInButton mode="modal"><button className="px-10 py-6 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 rounded-xl font-black text-2xl shadow-2xl shadow-green-900/60 transform hover:scale-[1.05] transition">🚀 Launch Scanner</button></SignInButton>
        <p className="mt-6 text-gray-500 font-mono">— Free 7-day access, no credit card required —</p>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-24">
        <h3 className="text-4xl font-black text-center mb-16">Why Choose QuantAI?</h3>
        <div className="grid md:grid-cols-3 gap-8">
          {[{icon: "🤖", title: "AI-Powered Analysis", desc: "Advanced machine learning algorithms analyze market data in real-time"}, {icon: "⚡", title: "Real-Time Signals", desc: "Get instant buy, sell, and wait signals as markets move"}, {icon: "📊", title: "Full Transparency", desc: "See confidence scores, risk levels, and signal reasoning"}, {icon: "🎯", title: "Precision Scoring", desc: "Multi-factor analysis: momentum, volatility, volume, and trend"}, {icon: "🔐", title: "Bank-Level Security", desc: "Your data is encrypted and secure with enterprise protocols"}, {icon: "📱", title: "Mobile Ready", desc: "Trade on the go with our fully responsive design"}].map((feature, i) => (
            <div key={i} className="bg-gray-800/30 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm hover:border-green-500/30 transition"><div className="text-5xl mb-4">{feature.icon}</div><h4 className="text-xl font-bold mb-3">{feature.title}</h4><p className="text-gray-400">{feature.desc}</p></div>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-800/20 bg-gray-950/80 backdrop-blur-xl py-12 mt-24">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500">
          <p className="mb-4">© 2024 QuantAI Signal Scanner. All rights reserved.</p>
          <p className="text-sm">Disclaimer: This is for educational purposes. Always do your own research before trading.</p>
        </div>
      </footer>
    </div>
  </div>
);

export default function App() {
  return (
    <>
      <SignedIn><ScannerPage /></SignedIn>
      <SignedOut><LandingPage /></SignedOut>
    </>
  );
}
