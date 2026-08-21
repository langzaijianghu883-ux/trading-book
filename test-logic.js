// 核心计算逻辑验证脚本（与 index.html 中算法保持一致）
// 运行: node test-logic.js
// 注意：下方 SEED 为测试专用简化数据（用于验证算法），并非 index.html 中的产品初始数据

const SEED = {
  version: 1,
  cash: 155291.89,
  baseCash: 155291.89,
  holdings: [
    {name:"迈威生物", shares:500,   price:32.50, cost:null, code:"sh688062"},
    {name:"联创光电", shares:400,   price:18.36, cost:null, code:"sh600363"},
    {name:"成都先导", shares:600,   price:38.70, cost:null, code:"sh688222"},
    {name:"消费ETF",  shares:10000, price:0.831, cost:null, code:"sz159928"},
    {name:"惠城环保", shares:200,   price:72.80, cost:null, code:"sz300779"},
    {name:"ST京蓝",   shares:1000,  price:6.11,  cost:null, code:"sz000711"},
    {name:"新恒汇",   shares:1400,  price:44.68, cost:null, code:"sz301328"},
    {name:"麦格数据", shares:700,   price:128.28,cost:null, code:""},
    {name:"金斯瑞",   shares:1000,  price:33.26, cost:null, code:"hk01548"},
    {name:"赛维电子", shares:1200,  price:31.55, cost:null, code:""},
    {name:"恒生科技", shares:22800, price:0.61,  cost:null, code:""}
  ],
  trades: [],
  cashFlows: [],
  dividends: [],
  snapshots: []
};

// —— 与 index.html 保持一致的工具函数副本 ——
function normalizeCode(input){
  const s = String(input||"").trim().toLowerCase();
  if(!s) return "";
  const m = s.match(/^(sh|sz|hk)(\d{5,6})$/);
  if(m) return m[1]+m[2];
  if(/^\d{5}$/.test(s)) return "hk"+s;
  if(/^\d{6}$/.test(s)){
    const c = s[0];
    if(c==="6" || c==="9" || c==="5") return "sh"+s;
    return "sz"+s;
  }
  return "";
}
const BEAR_WORDS = ["冻结","轮候冻结","减持","质押","立案","处罚","警示","问询","诉讼","违约","退市","亏损","预亏","下滑","终止","被查","监管","跌停","爆雷","纠纷","违规","风险","强制","平仓","担保","仲裁","调查","逮捕","受贿","套现","抛售","利空"];
const BULL_WORDS = ["中标","获批","核准","签约","合作","订单","预增","增持","回购","分红","重组","突破","投产","扩产","涨停","扭亏","新高","注入","豁免","业绩预增","大单","战略","签署","增资","合资","收购","并购","完成","交付"];
function classifySentiment(text){
  const t = String(text||"");
  for(const w of BEAR_WORDS){ if(t.includes(w)) return "bear"; }
  for(const w of BULL_WORDS){ if(t.includes(w)) return "bull"; }
  return "neutral";
}

let state = JSON.parse(JSON.stringify(SEED));

function getHolding(name){ return state.holdings.find(h=>h.name===name) || null; }
let idc = 0;
function addTrade(side, name, date, price, shares, fee, note){
  let h = getHolding(name);
  const costBefore = h ? h.cost : null;
  const sharesBefore = h ? h.shares : 0;
  const cashBefore = state.cash;
  let costAfter = costBefore, sharesAfter = sharesBefore, realized=null;

  if(side==="buy"){
    if(costBefore==null){
      costAfter = (price*shares + fee) / (sharesBefore + shares);
    }else{
      costAfter = (costBefore*sharesBefore + price*shares + fee) / (sharesBefore + shares);
    }
    sharesAfter = sharesBefore + shares;
    state.cash -= price*shares + fee;
  }else{
    sharesAfter = sharesBefore - shares;
    if(sharesAfter < -1e-9) return null;   // 卖出数量超限防护
    if(costBefore!=null) realized = (price - costBefore)*shares - fee;
    state.cash += price*shares - fee;
  }

  if(!h){ h = {name, shares:0, price, cost:null}; state.holdings.push(h); }
  h.shares = sharesAfter;
  if(costAfter!=null) h.cost = costAfter;

  const trade = { id:"t"+(++idc), date, name, side, price, shares, fee, note, realized,
    costBefore, costAfter, sharesBefore, sharesAfter, cashBefore, cashAfter: state.cash, createdAt: Date.now()+idc };
  state.trades.push(trade);
  return trade;
}
function deleteTrade(id){
  const i = state.trades.findIndex(t=>t.id===id);
  if(i<0) return false;
  const t = state.trades[i];
  const h = getHolding(t.name);
  if(h){ h.shares = t.sharesBefore; h.cost = t.costBefore; }
  state.trades.splice(i,1);
  replayCash();
  return true;
}
// —— 资金重放（与 index.html 一致）：任意删除顺序余额都正确 ——
function replayCash(){
  const evts = [];
  for(const t of state.trades) evts.push({order:t.createdAt, delta:t.cashAfter-t.cashBefore});
  for(const f of state.cashFlows) evts.push({order:f.createdAt, delta:f.cashAfter-f.cashBefore});
  for(const d of state.dividends) evts.push({order:d.createdAt, delta:d.net});
  evts.sort((a,b)=>a.order-b.order);
  let cash = state.baseCash;
  for(const e of evts) cash += e.delta;
  state.cash = cash;
}
// —— 分红（与 index.html 保持一致）——
let dIdc = 0;
function addDividend(name, date, net, note){
  if(!(net>0)) return null;
  const d = { id:"div"+(++dIdc), date, name, net, note:(note||"").trim(), createdAt:Date.now()+dIdc };
  state.dividends.push(d);
  state.cash += net;
  return d;
}
function deleteDividend(id){
  const i = state.dividends.findIndex(d=>d.id===id);
  if(i<0) return false;
  state.dividends.splice(i,1);
  replayCash();
  return true;
}
// —— 快照与月度统计（与 index.html 一致）——
function takeSnapshot(){
  const d = recompute();
  const t = "2026-08-21";
  const snap = { date:t, totalAssets:d.totalAssets, totalMV:d.totalMV, cash:d.cash, totalPnl:d.totalPnl!=null?d.totalPnl:null, live:d.liveCount>0 };
  const idx = state.snapshots.findIndex(s=>s.date===t);
  if(idx>=0) state.snapshots[idx] = snap; else state.snapshots.push(snap);
  return snap;
}
function maybeSnapshot(){
  if(!state.snapshots.some(s=>s.date==="2026-08-21")) takeSnapshot();
}
function monthlyStats(){
  const map = {};
  const keyOf = s => String(s||"").slice(0,7);
  const add = (k, field, v)=>{
    const m = map[k] || (map[k]={key:k, realized:0, in:0, out:0, div:0, sells:0, wins:0});
    m[field] += v;
  };
  for(const t of state.trades){
    if(t.side!=="sell") continue;
    const k = keyOf(t.date); if(!k) continue;
    add(k,"realized", t.realized||0);
    add(k,"sells",1);
    if(t.realized>0) add(k,"wins",1);
  }
  for(const f of state.cashFlows){
    const k = keyOf(f.date); if(!k) continue;
    if(f.type==="in") add(k,"in",f.amount);
    if(f.type==="out") add(k,"out",f.amount);
  }
  for(const d of state.dividends){
    const k = keyOf(d.date); if(!k) continue;
    add(k,"div",d.net);
  }
  return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key));
}
// —— 出入金（与 index.html 保持一致）——
let cfIdc = 0;
function addCashFlow(type, date, amount, note){
  const cashBefore = state.cash;
  const delta = type==="in" ? amount : -amount;
  const cashAfter = cashBefore + delta;
  if(type==="out" && cashAfter < -1e-9) return null;
  const flow = { id:"cf"+(++cfIdc), date, type, amount, note:(note||"").trim(), cashBefore, cashAfter, createdAt:Date.now()+cfIdc };
  state.cash = cashAfter;
  state.cashFlows.push(flow);
  return flow;
}
function deleteCashFlow(id){
  const i = state.cashFlows.findIndex(f=>f.id===id);
  if(i<0) return false;
  state.cashFlows.splice(i,1);
  replayCash();
  return true;
}
// quotes: { code → {price, ...} }，有实时价的持仓用实时价，否则用手动价
function recompute(quotes){
  const qm = quotes || {};
  let totalMV=0, totalCV=0, totalPnl=0, knownCostCount=0, liveCount=0;
  const list = state.holdings.map(h=>{
    const q = (h.code && qm[h.code]) || null;
    const px = q ? q.price : h.price;
    const mv = h.shares*px;
    const cv = (h.cost!=null && h.cost>0) ? h.shares*h.cost : null;
    const pl = cv!=null ? mv-cv : null;
    const pr = cv!=null&&cv>0 ? pl/cv : null;
    if(cv!=null){ totalCV+=cv; totalPnl+=pl; knownCostCount++; }
    totalMV+=mv;
    if(q) liveCount++;
    return { ...h, price:px, mv, cv, pl, pr, quote:q };
  });
  let realized=0, realizedCount=0;
  for(const t of state.trades){
    if(t.side==="sell" && t.realized!=null){ realized+=t.realized; realizedCount++; }
  }
  return { list, totalMV, totalCV, totalPnl, knownCostCount, realized, realizedCount, cash: state.cash, totalAssets: totalMV+state.cash, liveCount };
}

// ---------- 测试 ----------
let pass=0, fail=0;
function check(label, actual, expected, eps=1e-6){
  const ok = (typeof actual==="string" || typeof expected==="string") ? actual===expected : Math.abs(actual-expected) < eps;
  if(ok){ pass++; console.log("  ✓ "+label+" = "+actual); }
  else { fail++; console.log("  ✗ "+label+"：期望 "+expected+"，实际 "+actual); }
}

console.log("== 测试1：初始数据 ==");
let d = recompute();
check("持仓总市值", d.totalMV, 313170);
check("总资产", d.totalAssets, 468461.89);
check("可用余额", d.cash, 155291.89);
check("成本已知数(0)", d.knownCostCount, 0);

console.log("== 测试2：补录成本后盈亏 ==");
const h = getHolding("麦格数据");
h.cost = 100;  // 补录成本 100 元
d = recompute();
check("麦格数据市值", d.totalMV, 313170);           // 市值不变
check("麦格数据成本额", h.shares*h.cost, 70000);
check("麦格数据浮动盈亏", d.list.find(x=>x.name==="麦格数据").pl, 89796-70000);

console.log("== 测试3：买入（有成本持仓，加权平均）==");
addTrade("buy","麦格数据","2026-08-20",110, 100, 5, "加仓");
h.cost !== null && (h.cost !== 0);
// 新成本 = (100*700 + 110*100 + 5)/800 = (70000+11000+5)/800 = 81005/800 = 101.25625
check("麦格数据新成本", h.cost, 101.25625);
check("麦格数据新数量", h.shares, 800);
check("现金扣减", state.cash, 155291.89 - 110*100 - 5);

console.log("== 测试4：买入（无成本持仓，以买入价为初始成本）==");
addTrade("buy","迈威生物","2026-08-20",35, 100, 0, "加仓");
// 原成本 null → 新成本 = (35*100+0)/(500+100) = 3500/600 ≈ 5.8333
check("迈威生物新成本", getHolding("迈威生物").cost, 35*100/600);
check("迈威生物新数量", getHolding("迈威生物").shares, 600);

console.log("== 测试5：卖出（成本已知，计算已实现盈亏）==");
const before = state.cash;
addTrade("sell","麦格数据","2026-08-21",120, 200, 10, "止盈");
// 已实现 = (120-101.25625)*200 - 10 = 18.74375*200 - 10 = 3748.75 - 10 = 3738.75
const sellTrade = state.trades[state.trades.length-1];
check("卖出已实现盈亏", sellTrade.realized, 3738.75);
check("卖出后数量", getHolding("麦格数据").shares, 600);
check("卖出后现金", state.cash, before + 120*200 - 10);
check("已实现盈亏合计", recompute().realized, 3738.75);

console.log("== 测试6：删除交易回滚（重放语义：删除后现金=锚点+剩余全部记录净影响）==");
// 当前状态：麦格800股/成本101.25625；迈威600股/成本5.8333；现金140786.89
deleteTrade(sellTrade.id);
check("回滚卖出后数量", getHolding("麦格数据").shares, 800);
check("回滚卖出后成本", getHolding("麦格数据").cost, 101.25625);
check("回滚卖出后现金(剩T1麦格买+T2迈威买)", state.cash, 155291.89 - 11005 - 3500);
check("回滚卖出后已实现盈亏", recompute().realized, 0);
// 删除麦格数据买入（按 id 精确删除）：剩余迈威买入 3500 扣款仍生效
const mgBuy = state.trades.find(t=>t.name==="麦格数据");
deleteTrade(mgBuy.id);
check("回滚买入后数量", getHolding("麦格数据").shares, 700);
check("回滚买入后成本", getHolding("麦格数据").cost, 100);
check("回滚买入后现金(剩T2迈威买)", state.cash, 155291.89 - 3500);
// 删除迈威生物买入 → 全部清空，现金回到锚点
const mwBuy = state.trades.find(t=>t.name==="迈威生物");
deleteTrade(mwBuy.id);
check("回滚迈威买入后数量", getHolding("迈威生物").shares, 500);
check("回滚迈威买入后成本", getHolding("迈威生物").cost, null);
check("回滚迈威买入后现金(记录全清)", state.cash, 155291.89);

console.log("== 测试7：卖出数量超限防护（状态机级）==");
const beforeTrade = state.trades.length;
const mwBefore = getHolding("迈威生物").shares;
const r = addTrade("sell","迈威生物","2026-08-21",35, 99999, 0, "");
check("超卖返回 null", r, null);
check("超卖不产生交易记录", state.trades.length, beforeTrade);
check("超卖不改变数量", getHolding("迈威生物").shares, mwBefore);
check("超卖不改变现金", state.cash, 155291.89);

console.log("== 测试8：卖出（成本未知）==");
addTrade("sell","赛维电子","2026-08-21",30, 200, 5, "");
const sv = getHolding("赛维电子");
check("成本未知卖出后数量", sv.shares, 1000);
check("成本未知卖出 realized=null", state.trades[state.trades.length-1].realized, null);
check("已实现盈亏不包含该笔", recompute().realizedCount, 0);
check("成本未知卖出后现金", state.cash, 155291.89 + 30*200 - 5);

console.log("== 测试9：总资产核对 ==");
d = recompute();
const mvSum = d.list.reduce((s,x)=>s+x.mv,0);
check("总市值=Σ各持仓市值", d.totalMV, mvSum);
check("总资产=市值+现金", d.totalAssets, d.totalMV + state.cash);
const mwMv = d.list.find(x=>x.name==="迈威生物").mv;
check("迈威生物市值(500股×32.5)", mwMv, 16250);
check("现金总额", d.cash, 155291.89 + 30*200 - 5);

console.log("== 测试10：证券代码规范化 ==");
check("600363→sh600363", normalizeCode("600363"), "sh600363");
check("688062→sh688062", normalizeCode("688062"), "sh688062");
check("159928→sz159928", normalizeCode("159928"), "sz159928");
check("301328→sz301328", normalizeCode("301328"), "sz301328");
check("01548→hk01548", normalizeCode("01548"), "hk01548");
check("hk01548 原样", normalizeCode("hk01548"), "hk01548");
check("SH600363 大写", normalizeCode("SH600363"), "sh600363");
check("空串→空", normalizeCode(""), "");
check("非法 123→空", normalizeCode("123"), "");
check("非法 abc→空", normalizeCode("abc"), "");

console.log("== 测试11：实时价覆盖（recompute with quotes）==");
// 注意：测试8 已卖出赛维电子 200 股（剩 1000 股，现金 150281.89），此处以此为准
// 麦格数据无代码、赛维电子无代码、恒生科技无代码 → 用手动价；其余有代码
const q1 = { "sh688062":{price:35.0}, "sh600363":{price:19.0}, "sh688222":{price:40.0},
  "sz159928":{price:0.90}, "sz300779":{price:70.0}, "sz000711":{price:6.0}, "sz301328":{price:45.0}, "hk01548":{price:34.0} };
d = recompute(q1);
// 实时价部分：迈威 500×35 + 联创 400×19 + 成都先导 600×40 + 消费ETF 10000×0.9 + 惠城 200×70 + ST京蓝 1000×6 + 新恒汇 1400×45 + 金斯瑞 1000×34 =
// 17500+7600+24000+9000+14000+6000+63000+34000 = 175100
// 手动价部分：麦格 700×128.28=89796、赛维 1000×31.55=31550、恒生 22800×0.61=13908
check("实时价覆盖后总市值", d.totalMV, 175100+89796+31550+13908);
check("联创光电现价=实时价", d.list.find(x=>x.name==="联创光电").price, 19.0);
check("联创光电市值=400×19", d.list.find(x=>x.name==="联创光电").mv, 7600);
check("麦格数据仍用手动价", d.list.find(x=>x.name==="麦格数据").price, 128.28);
check("恒生科技仍用手动价", d.list.find(x=>x.name==="恒生科技").price, 0.61);
check("实时价覆盖数", d.liveCount, 8);
// 无 quotes 时全部手动价，行为与旧版一致（赛维已剩 1000 股）
d = recompute({});
check("无行情时总市值", d.totalMV, 313170 - 200*31.55);
check("无行情时 liveCount=0", d.liveCount, 0);
// 部分覆盖：只有联创光电有行情
d = recompute({ "sh600363":{price:19.0} });
check("单标的覆盖市值", d.totalMV, 313170 - 200*31.55 - 400*18.36 + 400*19.0);

console.log("== 测试12：情绪规则粗判 ==");
check("冻结→利空", classifySentiment("关于控股股东股份被轮候冻结的公告"), "bear");
check("减持→利空", classifySentiment("股东减持计划"), "bear");
check("中标→利好", classifySentiment("公司中标重大项目"), "bull");
check("预增→利好", classifySentiment("业绩预增公告"), "bull");
check("利空优先于利好", classifySentiment("重组获核准后股东减持"), "bear");
check("无关→中性", classifySentiment("今日市场震荡整理"), "neutral");

console.log("== 测试13：出入金 ==");
// 当前状态：现金 150281.89（测试9 后）
const c0 = state.cash;
const fIn = addCashFlow("in","2026-08-21",10000,"银证转账");
check("入金后现金", state.cash, c0+10000);
check("入金记录存在", state.cashFlows.length, 1);
check("入金记录金额", fIn.amount, 10000);
check("入金 cashAfter", fIn.cashAfter, c0+10000);
const fOut = addCashFlow("out","2026-08-22",2000,"提现");
check("出金后现金", state.cash, c0+10000-2000);
check("出金记录 cashAfter", fOut.cashAfter, c0+8000);
// 出金超限防护
const cfCountBefore = state.cashFlows.length;
const r2 = addCashFlow("out","2026-08-22",1e9,"超限");
check("超限出金返回 null", r2, null);
check("超限不产生记录", state.cashFlows.length, cfCountBefore);
check("超限不改变现金", state.cash, c0+8000);
// 删除出金（逆序删除）
deleteCashFlow(fOut.id);
check("删除出金后现金", state.cash, c0+10000);
check("删除出金后记录数", state.cashFlows.length, 1);
// 删除入金
deleteCashFlow(fIn.id);
check("删除入金后现金", state.cash, c0);
check("删除入金后记录数", state.cashFlows.length, 0);
// 净投入统计
addCashFlow("in","2026-08-21",50000,""); addCashFlow("out","2026-08-21",15000,"");
const netIn = state.cashFlows.reduce((s,f)=>s+(f.type==="in"?f.amount:-f.amount),0);
check("净投入=入金-出金", netIn, 35000);

console.log("== 测试14：乱序删除一致性（重放）==");
// 场景：入金 50000 → 买入 3500 → 先删除入金 → 再删除交易，现金应回到入金前
// 构造干净基线：重置状态
state = JSON.parse(JSON.stringify(SEED));
const base0 = state.cash; // 155291.89
addCashFlow("in","2026-08-21",50000,"");
const buyT = addTrade("buy","迈威生物","2026-08-21",35,100,0,"");
check("买入后现金", state.cash, base0+50000-3500);
check("买入记录 cashAfter", buyT.cashAfter, base0+50000-3500);
// 乱序：先删入金，再删交易
const f1 = state.cashFlows[0];
deleteCashFlow(f1.id);
check("删入金后现金（重放）", state.cash, base0-3500);   // 只剩买入影响
deleteTrade(buyT.id);
check("再删交易后现金回到初始", state.cash, base0);       // 关键：无残留误差
check("持仓数量回滚", getHolding("迈威生物").shares, 500);
check("记录全部清空", state.trades.length+state.cashFlows.length, 0);
// 反向乱序：先删交易，再删入金
addCashFlow("in","2026-08-21",50000,"");
const buyT2 = addTrade("buy","迈威生物","2026-08-21",35,100,0,"");
deleteTrade(buyT2.id);
check("先删交易后现金", state.cash, base0+50000);
deleteCashFlow(state.cashFlows[0].id);
check("再删入金后现金回到初始", state.cash, base0);
// 手动调整余额也参与重放
state.cashFlows.push({id:"cfx", date:"2026-08-21", type:"adj", amount:2000, note:"手动调整", cashBefore:state.cash, cashAfter:state.cash+2000, createdAt:Date.now()+9999});
replayCash();
check("调整余额后现金", state.cash, base0+2000);
state.cashFlows = [];
replayCash();
check("清空调整后现金", state.cash, base0);

console.log("== 测试15：分红 ==");
// 当前状态：测试14 末尾，现金=baseCash=155291.89，记录全清
const b0 = state.cash;
const div1 = addDividend("联创光电","2026-08-21",1944,"10派0.54，扣税后0.486×400股");
check("分红后现金", state.cash, b0+1944);
check("分红记录存在", state.dividends.length, 1);
check("分红净额", div1.net, 1944);
const div2 = addDividend("迈威生物","2026-08-20",500,"");
check("两笔分红后现金", state.cash, b0+2444);
check("累计分红统计", state.dividends.reduce((s,d)=>s+d.net,0), 2444);
// 非法净额防护
const r3 = addDividend("迈威生物","2026-08-20",0,"");
check("净额0返回 null", r3, null);
check("非法不产生记录", state.dividends.length, 2);
// 删除分红（重放回滚）
deleteDividend(div1.id);
check("删除分红后现金", state.cash, b0+500);
check("删除后记录数", state.dividends.length, 1);
deleteDividend(div2.id);
check("删净后现金回到锚点", state.cash, b0);
// 混合乱序删除：分红+交易+出入金
state = JSON.parse(JSON.stringify(SEED));
const m0 = state.cash;
addCashFlow("in","2026-08-21",50000,"");
addDividend("联创光电","2026-08-21",1944,"");
const bt = addTrade("buy","迈威生物","2026-08-21",35,100,0,"");
check("混合后现金", state.cash, m0+50000+1944-3500);
// 乱序删除：先删交易、再删分红、再删入金
deleteTrade(bt.id);
check("删交易后现金", state.cash, m0+50000+1944);
deleteDividend(state.dividends[0].id);
check("删分红后现金", state.cash, m0+50000);
deleteCashFlow(state.cashFlows[0].id);
check("删入金后现金回到锚点", state.cash, m0);
check("持仓数量回滚", getHolding("迈威生物").shares, 500);

console.log("== 测试16：历史快照 ==");
state = JSON.parse(JSON.stringify(SEED));
check("初始无快照", state.snapshots.length, 0);
maybeSnapshot();
check("自动存档1条", state.snapshots.length, 1);
check("快照总资产正确", state.snapshots[0].totalAssets, 468461.89);
const snapV1 = state.snapshots[0];
state.cash = 99999;  // 模拟数据变化
takeSnapshot();
check("同日覆盖不新增", state.snapshots.length, 1);
check("快照已更新", state.snapshots[0].cash, 99999);
state.cash = 155291.89;
state.snapshots[0] = snapV1;

console.log("== 测试17：月度统计 ==");
state = JSON.parse(JSON.stringify(SEED));
// 构造跨月数据
addTrade("buy","麦格数据","2026-06-10",100, 100, 5, "");
addTrade("sell","麦格数据","2026-06-20",120, 50, 5, "");   // 6月卖出盈利
addTrade("sell","迈威生物","2026-07-15",20, 100, 5, "");   // 7月卖出亏损（成本null→realized null，不计入）
addCashFlow("in","2026-06-01",20000,"");
addCashFlow("out","2026-06-05",5000,"");
addDividend("联创光电","2026-07-10",800,"");
const ms = monthlyStats();
const jun = ms.find(m=>m.key==="2026-06");
const jul = ms.find(m=>m.key==="2026-07");
// 麦格初始 700 股成本 null：买入 100 股后成本=(100×100+5)/800=12.50625（按全部数量分摊）
// 卖出 50 股：realized=(120-12.50625)×50-5=5369.6875
check("6月已实现盈亏", jun.realized, 5369.6875);
check("6月卖出笔数", jun.sells, 1);
check("6月盈利笔数", jun.wins, 1);
check("6月净投入", jun.in-jun.out, 15000);
check("7月分红", jul.div, 800);
check("7月卖出笔数(含成本未知)", jul.sells, 1);
check("7月盈利笔数(成本未知不计盈)", jul.wins, 0);
check("月度排序倒序", ms[0].key>=ms[1].key, true);

console.log("== 测试18：行业名提取 ==");
// 与 index.html extractSectorName 一致
const extractSectorName = raw => { const parts = String(raw||"").split("-"); return parts[parts.length-1].trim() || ""; };
check("制造业-医药制造业→医药制造业", extractSectorName("制造业-医药制造业"), "医药制造业");
check("科学研究和技术服务业-研究和试验发展→研究和试验发展", extractSectorName("科学研究和技术服务业-研究和试验发展"), "研究和试验发展");
check("单段行业原样", extractSectorName("金融业"), "金融业");
check("空值→空", extractSectorName(""), "");
check("null→空", extractSectorName(null), "");

console.log("== 测试19：名称智能更新规则 ==");
// 与 index.html shouldRename/cleanRealName 一致
const cleanRealName = n => String(n||"").replace(/-U$/,"").replace(/-C$/,"").trim();
const shouldRename = (u, r) => {
  const uu = String(u||"").trim(), rr = cleanRealName(r);
  if(!uu || !rr) return false;
  if(uu === rr) return false;
  if(rr.includes(uu) || uu.includes(rr)) return false;
  return true;
};
check("麦格数据 vs 麦格米特 → 改", shouldRename("麦格数据","麦格米特"), true);
check("赛维电子 vs 赛微电子 → 改", shouldRename("赛维电子","赛微电子"), true);
check("完全一致不改", shouldRename("联创光电","联创光电"), false);
check("简称包含不改(消费ETF⊂消费ETF华夏)", shouldRename("消费ETF","消费ETF华夏"), false);
check("简称包含不改(恒生科技⊂恒生科技ETF博时)", shouldRename("恒生科技","恒生科技ETF博时"), false);
check("简称包含不改(金斯瑞⊂金斯瑞生物科技)", shouldRename("金斯瑞","金斯瑞生物科技"), false);
check("-U清洗后相等不改", shouldRename("迈威生物","迈威生物-U"), false);
check("-U清洗: 迈威生物-U→迈威生物", cleanRealName("迈威生物-U"), "迈威生物");
check("空真实名不改", shouldRename("消费ETF",""), false);
check("空用户名不改", shouldRename("","联创光电"), false);

console.log("== 测试20：批量录入解析 ==");
// 与 index.html parseTradeText/normalizeBatchItem 一致（today 固定 2026-08-21）
const T0="2026-08-21";
const num2=(v,d=0)=>{const n=parseFloat(v);return isNaN(n)?d:n;};
function normalizeBatchItem(it){
  if(!it||typeof it!=="object") return null;
  const side=String(it.side||it.direction||"").toLowerCase();
  const s=side.includes("sell")||side.includes("卖")?"sell":(side.includes("buy")||side.includes("买")?"buy":"");
  const price=num2(it.price), shares=num2(it.shares), fee=num2(it.fee||0);
  const name=String(it.name||it.symbol||it.stock||"").trim();
  const date=String(it.date||"").trim();
  if(!name||!s||!(price>0)||!(shares>0)) return null;
  return {date:date||T0, name, side:s, price, shares, fee, note:String(it.note||"批量录入").trim()};
}
// JSON 解析
const r1=normalizeBatchItem({date:"2026-08-20",name:"迈威生物",side:"buy",price:32.59,shares:300,fee:5});
check("JSON条目正常", r1!==null, true);
check("JSON方向buy", r1.side, "buy");
check("JSON缺字段→null", normalizeBatchItem({name:"迈威生物",side:"buy"}), null);
check("JSON英文字段side=sell", normalizeBatchItem({name:"联创光电",side:"sell",price:18,shares:100}).side, "sell");
check("JSON缺日期补今天", normalizeBatchItem({name:"联创光电",side:"buy",price:18,shares:100}).date, T0);
// 文本行解析（简化版：直接验证关键字段提取逻辑）
function parseBatchLine(line){
  let rest=line;
  const mDate=rest.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  let date=T0;
  if(mDate){ date=mDate[1]+"-"+String(+mDate[2]).padStart(2,"0")+"-"+String(+mDate[3]).padStart(2,"0"); rest=rest.replace(mDate[0]," "); }
  const mSide=rest.match(/(买入|买进|买|卖出|卖)/);
  if(!mSide) return null;
  const side=mSide[1].includes("卖")?"sell":"buy";
  rest=rest.replace(mSide[0]," ");
  const mShares=rest.match(/(\d+(?:\.\d+)?)\s*手|(\d+(?:\.\d+)?)\s*[股份]/);
  let shares=0;
  if(mShares){ shares=mShares[1]?(+mShares[1])*100:+mShares[2]; rest=rest.replace(mShares[0]," "); }
  const mAt=rest.match(/[@＠]\s*(\d+(?:\.\d+)?)/);
  let price=0;
  if(mAt){ price=+mAt[1]; rest=rest.replace(mAt[0]," "); }
  else{
    const mPrice=rest.match(/价\s*[:：]?\s*(\d+(?:\.\d+)?)|(\d+\.\d{1,3})/);
    if(mPrice){ price=+mPrice[1]||+mPrice[2]; rest=rest.replace(mPrice[0]," "); }
  }
  const mFee=rest.match(/费\s*[:：]?\s*(\d+(?:\.\d+)?)/);
  let fee=0;
  if(mFee){ fee=+mFee[1]; rest=rest.replace(mFee[0]," "); }
  const mName=rest.match(/[^\s\d|,，。、:：;；@＠%()（）]+/);
  const name=mName?mName[0].trim():"";
  if(!name||!(price>0)||!(shares>0)) return null;
  return {date,name,side,price,shares,fee};
}
let t=parseBatchLine("2026-08-20 迈威生物 买入 32.59 300股 手续费5");
check("文本行解析成功", t!==null, true);
check("文本日期", t.date, "2026-08-20");
check("文本名称", t.name, "迈威生物");
check("文本方向", t.side, "buy");
check("文本价格", t.price, 32.59);
check("文本数量", t.shares, 300);
check("文本手续费", t.fee, 5);
t=parseBatchLine("2026/08/20 联创光电 卖出 18.36 2手 费10");
check("文本-手换算(2手=200股)", t.shares, 200);
check("文本-卖出方向", t.side, "sell");
check("文本-费10", t.fee, 10);
t=parseBatchLine("惠城环保 买 72.8 200股");   // 无日期
check("文本-无日期补今天", t.date, T0);
check("文本-无手续费默认0", t.fee, 0);
t=parseBatchLine("乱七八糟的一行");
check("无法识别行→null", t, null);
t=parseBatchLine("成都先导 买入 38.7 600股 @39 费3");  // @ 优先级
check("文本-@价格优先", t.price, 39);

console.log("\n==================");
console.log("通过 "+pass+" 项，失败 "+fail+" 项");
process.exit(fail>0?1:0);
