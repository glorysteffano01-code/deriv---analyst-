import { useState, useEffect } from "react";

// ─── Utility ───────────────────────────────────────────────────────────────
function calcSMA(data, period) {
  return data.map((_, i) =>
    i < period - 1 ? null : data.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period
  );
}
function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const result = [];
  let ema = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (ema === null) { ema = data.slice(0, period).reduce((s, v) => s + v, 0) / period; result.push(ema); continue; }
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}
function calcRSI(closes, period = 14) {
  const result = Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  result[period] = 100 - 100 / (1 + ag / (al || 1e-10));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    result[i] = 100 - 100 / (1 + ag / (al || 1e-10));
  }
  return result;
}
function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null);
  const validMacd = macdLine.filter(v => v != null);
  const rawSignal = calcEMA(validMacd, signal);
  let si = 0;
  const signalLine = macdLine.map(v => v == null ? null : (rawSignal[si++] ?? null));
  const histogram = macdLine.map((v, i) => v != null && signalLine[i] != null ? v - signalLine[i] : null);
  return { macdLine, signalLine, histogram };
}
function calcBollinger(closes, period = 20, stdDev = 2) {
  const sma = calcSMA(closes, period);
  return closes.map((_, i) => {
    if (sma[i] == null) return { upper: null, mid: null, lower: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const sd = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    return { upper: mean + stdDev * sd, mid: mean, lower: mean - stdDev * sd };
  });
}

const MARKETS = [
  { id: "vol75", label: "Volatility 75", type: "synthetic", base: 1200 },
  { id: "vol25", label: "Volatility 25", type: "synthetic", base: 5200 },
  { id: "crash1000", label: "Crash 1000", type: "synthetic", base: 8800 },
  { id: "boom1000", label: "Boom 1000", type: "synthetic", base: 7200 },
  { id: "eurusd", label: "EUR/USD", type: "forex", base: 1.085 },
  { id: "gbpusd", label: "GBP/USD", type: "forex", base: 1.268 },
];

function generateCandles(base, count = 60, volatility = 0.012) {
  const candles = [];
  let price = base;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const o = price;
    const move = (Math.random() - 0.49) * price * volatility;
    const c = o + move;
    const range = Math.abs(move) * (1 + Math.random());
    candles.push({ time: new Date(now - i * 5 * 60000), open: o, high: Math.max(o, c) + range * 0.4, low: Math.min(o, c) - range * 0.4, close: c });
    price = c;
  }
  return candles;
}

// ─── Charts ─────────────────────────────────────────────────────────────────
function CandleChart({ candles, bollinger, showBollinger }) {
  const W = 760, H = 260, pad = { l: 60, r: 20, t: 20, b: 30 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const prices = candles.flatMap(c => [c.high, c.low]);
  const bPrices = bollinger.flatMap(b => b.upper != null ? [b.upper, b.lower] : []);
  const allPrices = [...prices, ...bPrices];
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices), priceRange = maxP - minP || 1;
  const scaleY = v => pad.t + ch - ((v - minP) / priceRange) * ch;
  const scaleX = i => pad.l + (i / (candles.length - 1)) * cw;
  const candleW = Math.max(2, cw / candles.length * 0.6);
  const bPath = (key) => bollinger.map((b, i) => b[key] == null ? "" : `${i === 0 || bollinger[i-1][key] == null ? "M" : "L"} ${scaleX(i)} ${scaleY(b[key])}`).join(" ");
  const bandFill = (() => {
    const u = bollinger.map((b, i) => b.upper != null ? `${scaleX(i)},${scaleY(b.upper)}` : null).filter(Boolean);
    const l = bollinger.map((b, i) => b.lower != null ? `${scaleX(i)},${scaleY(b.lower)}` : null).filter(Boolean).reverse();
    return u.length ? `M ${u.join(" L ")} L ${l.join(" L ")} Z` : "";
  })();
  const yTicks = Array.from({ length: 5 }, (_, i) => minP + (priceRange * i) / 4);
  const xStep = Math.max(1, Math.floor(candles.length / 6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} y1={scaleY(v)} x2={W-pad.r} y2={scaleY(v)} stroke="#1e2d3d" strokeWidth="1" />
          <text x={pad.l-6} y={scaleY(v)+4} textAnchor="end" fill="#4a6080" fontSize="9" fontFamily="monospace">{v.toFixed(v>100?0:4)}</text>
        </g>
      ))}
      {showBollinger && <><path d={bandFill} fill="rgba(0,200,255,0.04)"/><path d={bPath("upper")} fill="none" stroke="rgba(0,200,255,0.5)" strokeWidth="1" strokeDasharray="3,3"/><path d={bPath("lower")} fill="none" stroke="rgba(0,200,255,0.5)" strokeWidth="1" strokeDasharray="3,3"/><path d={bPath("mid")} fill="none" stroke="rgba(0,200,255,0.3)" strokeWidth="1"/></>}
      {candles.map((c, i) => {
        const x = scaleX(i), up = c.close >= c.open, color = up ? "#00e59b" : "#ff4d6d";
        const bt = scaleY(Math.max(c.open, c.close)), bb = scaleY(Math.min(c.open, c.close));
        return <g key={i}><line x1={x} y1={scaleY(c.high)} x2={x} y2={scaleY(c.low)} stroke={color} strokeWidth="1" opacity="0.8"/><rect x={x-candleW/2} y={bt} width={candleW} height={Math.max(1,bb-bt)} fill={color} opacity="0.9" rx="0.5"/></g>;
      })}
      {candles.filter((_,i)=>i%xStep===0).map((c,i)=>(
        <text key={i} x={scaleX(i*xStep)} y={H-8} textAnchor="middle" fill="#4a6080" fontSize="9" fontFamily="monospace">{c.time.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</text>
      ))}
    </svg>
  );
}

function RSIChart({ rsi }) {
  const W=760,H=90,pad={l:60,r:20,t:10,b:20};
  const cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;
  const scaleY=v=>pad.t+ch-(v/100)*ch, scaleX=i=>pad.l+(i/(rsi.length-1))*cw;
  const path=rsi.map((v,i)=>v==null?"":`${i===0||rsi[i-1]==null?"M":"L"} ${scaleX(i)} ${scaleY(v)}`).join(" ");
  const vals=rsi.filter(v=>v!=null), last=vals[vals.length-1];
  const col=last>70?"#ff4d6d":last<30?"#00e59b":"#f0c040";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"100%",display:"block"}}>
      <rect x={pad.l} y={scaleY(70)} width={cw} height={scaleY(100)-scaleY(70)} fill="rgba(255,77,109,0.06)"/>
      <rect x={pad.l} y={scaleY(30)} width={cw} height={scaleY(0)-scaleY(30)} fill="rgba(0,229,155,0.06)"/>
      <line x1={pad.l} y1={scaleY(70)} x2={W-pad.r} y2={scaleY(70)} stroke="#ff4d6d" strokeWidth="0.7" strokeDasharray="3,3" opacity="0.5"/>
      <line x1={pad.l} y1={scaleY(30)} x2={W-pad.r} y2={scaleY(30)} stroke="#00e59b" strokeWidth="0.7" strokeDasharray="3,3" opacity="0.5"/>
      <line x1={pad.l} y1={scaleY(50)} x2={W-pad.r} y2={scaleY(50)} stroke="#2a3f55" strokeWidth="0.7"/>
      <path d={path} fill="none" stroke={col} strokeWidth="1.5"/>
      {[70,50,30].map(v=><text key={v} x={pad.l-6} y={scaleY(v)+4} textAnchor="end" fill="#4a6080" fontSize="9" fontFamily="monospace">{v}</text>)}
      <text x={pad.l} y={H-4} fill="#4a6080" fontSize="9" fontFamily="monospace">RSI(14)</text>
      {last!=null&&<text x={W-pad.r} y={pad.t+10} textAnchor="end" fill={col} fontSize="10" fontFamily="monospace" fontWeight="bold">{last.toFixed(1)}</text>}
    </svg>
  );
}

function MACDChart({ macd }) {
  const W=760,H=90,pad={l:60,r:20,t:10,b:20};
  const cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;
  const {macdLine,signalLine,histogram}=macd;
  const all=[...macdLine,...signalLine,...histogram].filter(v=>v!=null);
  if(!all.length)return null;
  const minV=Math.min(...all),maxV=Math.max(...all),range=maxV-minV||1;
  const scaleY=v=>pad.t+ch-((v-minV)/range)*ch, scaleX=i=>pad.l+(i/(macdLine.length-1))*cw;
  const barW=Math.max(1.5,cw/macdLine.length*0.5);
  const lp=arr=>arr.map((v,i)=>v==null?"":`${i===0||arr[i-1]==null?"M":"L"} ${scaleX(i)} ${scaleY(v)}`).join(" ");
  const zero=scaleY(Math.max(minV,0));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"100%",display:"block"}}>
      <line x1={pad.l} y1={zero} x2={W-pad.r} y2={zero} stroke="#2a3f55" strokeWidth="0.7"/>
      {histogram.map((v,i)=>{if(v==null)return null;const y=scaleY(v),top=Math.min(y,zero),bot=Math.max(y,zero);return<rect key={i} x={scaleX(i)-barW/2} y={top} width={barW} height={bot-top||1} fill={v>=0?"rgba(0,229,155,0.5)":"rgba(255,77,109,0.5)"}/>;})}
      <path d={lp(macdLine)} fill="none" stroke="#00aaff" strokeWidth="1.5"/>
      <path d={lp(signalLine)} fill="none" stroke="#f0c040" strokeWidth="1.2" strokeDasharray="4,2"/>
      <text x={pad.l} y={H-4} fill="#4a6080" fontSize="9" fontFamily="monospace">MACD(12,26,9)</text>
    </svg>
  );
}

function SentimentGauge({ value, label }) {
  const angle=-135+(value/100)*270, col=value>60?"#00e59b":value<40?"#ff4d6d":"#f0c040";
  const rad=a=>(a*Math.PI)/180, cx=60,cy=60,r=44;
  const gx=cx+r*Math.cos(rad(angle)),gy=cy+r*Math.sin(rad(angle));
  return (
    <div style={{textAlign:"center"}}>
      <svg viewBox="0 0 120 80" style={{width:120}}>
        <path d={`M ${cx+r*Math.cos(rad(-135))} ${cy+r*Math.sin(rad(-135))} A ${r} ${r} 0 1 1 ${cx+r*Math.cos(rad(135))} ${cy+r*Math.sin(rad(135))}`} fill="none" stroke="#1e2d3d" strokeWidth="8" strokeLinecap="round"/>
        <path d={`M ${cx+r*Math.cos(rad(-135))} ${cy+r*Math.sin(rad(-135))} A ${r} ${r} 0 ${value>50?1:0} 1 ${gx} ${gy}`} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" opacity="0.8"/>
        <circle cx={gx} cy={gy} r={5} fill={col}/>
        <text x={cx} y={cy+10} textAnchor="middle" fill={col} fontSize="18" fontWeight="bold" fontFamily="monospace">{value}</text>
      </svg>
      <div style={{color:"#4a6080",fontSize:11,fontFamily:"monospace",marginTop:-8}}>{label}</div>
    </div>
  );
}

function Signal({ label, signal }) {
  const cols={BUY:"#00e59b",SELL:"#ff4d6d",NEUTRAL:"#f0c040"};
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #0d1f30"}}>
      <span style={{color:"#8aa0b8",fontSize:12,fontFamily:"monospace"}}>{label}</span>
      <span style={{background:cols[signal]+"20",color:cols[signal],padding:"2px 10px",borderRadius:3,fontSize:11,fontWeight:700,fontFamily:"monospace",border:`1px solid ${cols[signal]}40`}}>{signal}</span>
    </div>
  );
}

function AddCandleForm({ onAdd, lastClose }) {
  const [form,setForm]=useState({open:lastClose.toFixed(4),high:"",low:"",close:""});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const submit=()=>{
    const o=+form.open,h=+form.high,l=+form.low,c=+form.close;
    if(!o||!h||!l||!c)return;
    if(h<Math.max(o,c)||l>Math.min(o,c)){alert("High must be ≥ max(Open,Close) and Low ≤ min(Open,Close)");return;}
    onAdd({open:o,high:h,low:l,close:c,time:new Date()});
    setForm({open:c.toFixed(4),high:"",low:"",close:""});
  };
  const inp={background:"#0a1929",border:"1px solid #1e2d3d",borderRadius:4,color:"#c8ddf0",padding:"6px 8px",width:"100%",fontSize:12,fontFamily:"monospace",outline:"none",boxSizing:"border-box"};
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
      {["open","high","low","close"].map(k=>(
        <div key={k}>
          <div style={{color:"#4a6080",fontSize:10,fontFamily:"monospace",marginBottom:3,textTransform:"uppercase"}}>{k}</div>
          <input style={inp} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder="0.0000" type="number" step="any"/>
        </div>
      ))}
      <button onClick={submit} style={{background:"linear-gradient(135deg,#00e59b,#00aaff)",border:"none",borderRadius:4,color:"#000",padding:"7px 16px",fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"monospace",whiteSpace:"nowrap"}}>+ Add</button>
    </div>
  );
}

// ─── Trade Journal ───────────────────────────────────────────────────────────
const MARKET_NAMES = ["Volatility 75","Volatility 25","Crash 1000","Boom 1000","EUR/USD","GBP/USD"];

function TradeForm({ onAdd }) {
  const today = new Date().toISOString().slice(0,10);
  const blank = {date:today,market:"Volatility 75",direction:"BUY",entry:"",exit:"",stake:"",result:"WIN",pnl:"",notes:""};
  const [form,setForm] = useState({...blank});
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const submit = () => {
    if(!form.entry||!form.stake){alert("Entry price and stake are required");return;}
    const pnl = form.pnl!==""?+form.pnl:(form.result==="WIN"?+form.stake*0.87:-+form.stake);
    onAdd({...form,entry:+form.entry,exit:form.exit?+form.exit:null,stake:+form.stake,pnl:+pnl,id:Date.now()});
    setForm({...blank,date:today});
  };

  const inp={background:"#0a1929",border:"1px solid #1e2d3d",borderRadius:4,color:"#c8ddf0",padding:"7px 10px",width:"100%",fontSize:12,fontFamily:"monospace",outline:"none",boxSizing:"border-box"};
  const lbl={color:"#4a6080",fontSize:10,fontFamily:"monospace",marginBottom:4,textTransform:"uppercase",display:"block"};

  return (
    <div style={{background:"#060f1a",border:"1px solid #0e2235",borderRadius:6,padding:16,marginBottom:20}}>
      <div style={{color:"#4a6080",fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Log New Trade</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
        <div><label style={lbl}>Date</label><input style={inp} type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
        <div>
          <label style={lbl}>Market</label>
          <select style={{...inp,cursor:"pointer"}} value={form.market} onChange={e=>set("market",e.target.value)}>
            {MARKET_NAMES.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Direction</label>
          <select style={{...inp,cursor:"pointer",color:form.direction==="BUY"?"#00e59b":"#ff4d6d"}} value={form.direction} onChange={e=>set("direction",e.target.value)}>
            <option>BUY</option><option>SELL</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Result</label>
          <select style={{...inp,cursor:"pointer",color:form.result==="WIN"?"#00e59b":form.result==="LOSS"?"#ff4d6d":"#f0c040"}} value={form.result} onChange={e=>set("result",e.target.value)}>
            <option>WIN</option><option>LOSS</option><option>BREAK EVEN</option>
          </select>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 2fr",gap:10,marginBottom:12}}>
        <div><label style={lbl}>Entry Price</label><input style={inp} type="number" step="any" value={form.entry} onChange={e=>set("entry",e.target.value)} placeholder="0.0000"/></div>
        <div><label style={lbl}>Exit Price</label><input style={inp} type="number" step="any" value={form.exit} onChange={e=>set("exit",e.target.value)} placeholder="optional"/></div>
        <div><label style={lbl}>Stake ($)</label><input style={inp} type="number" step="any" value={form.stake} onChange={e=>set("stake",e.target.value)} placeholder="10.00"/></div>
        <div><label style={lbl}>P&L ($) <span style={{color:"#2a3f55"}}>auto</span></label><input style={inp} type="number" step="any" value={form.pnl} onChange={e=>set("pnl",e.target.value)} placeholder="leave blank"/></div>
        <div><label style={lbl}>Notes / Strategy</label><input style={inp} type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="e.g. RSI oversold + BB lower band touch"/></div>
      </div>
      <button onClick={submit} style={{background:"linear-gradient(135deg,#00e59b,#00aaff)",border:"none",borderRadius:4,color:"#000",padding:"8px 24px",fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>＋ Log Trade</button>
    </div>
  );
}

function EquityCurve({ trades }) {
  if(trades.length<2)return null;
  const W=700,H=130,pad={l:64,r:20,t:16,b:24};
  const cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;
  const cum=trades.reduce((acc,t,i)=>{acc.push((acc[i-1]??0)+t.pnl);return acc;},[]);
  const minV=Math.min(0,...cum),maxV=Math.max(0,...cum),range=maxV-minV||1;
  const scaleY=v=>pad.t+ch-((v-minV)/range)*ch, scaleX=i=>pad.l+(i/(cum.length-1))*cw;
  const pathD=cum.map((v,i)=>`${i===0?"M":"L"} ${scaleX(i)} ${scaleY(v)}`).join(" ");
  const fillD=`${pathD} L ${scaleX(cum.length-1)} ${scaleY(0)} L ${scaleX(0)} ${scaleY(0)} Z`;
  const zero=scaleY(0), last=cum[cum.length-1], lineCol=last>=0?"#00e59b":"#ff4d6d";
  return (
    <div style={{background:"#0a1929",border:"1px solid #0e2235",borderRadius:6,padding:"12px 16px",marginBottom:16}}>
      <div style={{color:"#4a6080",fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Equity Curve</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",display:"block"}}>
        {[minV,0,maxV].filter((v,i,a)=>a.indexOf(v)===i).map((v,i)=>(
          <g key={i}>
            <line x1={pad.l} y1={scaleY(v)} x2={W-pad.r} y2={scaleY(v)} stroke="#1e2d3d" strokeWidth="0.7"/>
            <text x={pad.l-6} y={scaleY(v)+4} textAnchor="end" fill="#4a6080" fontSize="9" fontFamily="monospace">${v.toFixed(2)}</text>
          </g>
        ))}
        <line x1={pad.l} y1={zero} x2={W-pad.r} y2={zero} stroke="#2a3f55" strokeWidth="1"/>
        <path d={fillD} fill={lineCol} opacity="0.07"/>
        <path d={pathD} fill="none" stroke={lineCol} strokeWidth="2"/>
        {cum.map((v,i)=><circle key={i} cx={scaleX(i)} cy={scaleY(v)} r="3" fill={v>=0?"#00e59b":"#ff4d6d"}/>)}
        <text x={pad.l} y={H-4} fill="#4a6080" fontSize="9" fontFamily="monospace">Trade #1 → #{cum.length}</text>
        <text x={W-pad.r} y={pad.t+12} textAnchor="end" fill={lineCol} fontSize="11" fontFamily="monospace" fontWeight="bold">{last>=0?"+":""}${last.toFixed(2)}</text>
      </svg>
    </div>
  );
}

function TradeRow({ trade, onDelete }) {
  const pnlCol=trade.pnl>0?"#00e59b":trade.pnl<0?"#ff4d6d":"#f0c040";
  const dirCol=trade.direction==="BUY"?"#00e59b":"#ff4d6d";
  const resCol=trade.result==="WIN"?"#00e59b":trade.result==="LOSS"?"#ff4d6d":"#f0c040";
  const td={padding:"8px 10px",fontSize:11,fontFamily:"monospace",borderBottom:"1px solid #060f1a",verticalAlign:"middle"};
  return (
    <tr style={{background:"#0a1929"}}>
      <td style={{...td,color:"#4a6080"}}>{trade.date}</td>
      <td style={{...td,color:"#c8ddf0"}}>{trade.market}</td>
      <td style={{...td,color:dirCol,fontWeight:700}}>{trade.direction}</td>
      <td style={{...td,color:"#8aa0b8"}}>{trade.entry?.toFixed(4)}</td>
      <td style={{...td,color:"#8aa0b8"}}>{trade.exit?trade.exit.toFixed(4):"—"}</td>
      <td style={{...td,color:"#c8ddf0"}}>${trade.stake?.toFixed(2)}</td>
      <td style={{...td,color:pnlCol,fontWeight:700}}>{trade.pnl>=0?"+":""}${trade.pnl?.toFixed(2)}</td>
      <td style={{...td,color:resCol,fontWeight:700}}>{trade.result}</td>
      <td style={{...td,color:"#4a6080",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{trade.notes||"—"}</td>
      <td style={{...td,textAlign:"center"}}>
        <button onClick={()=>onDelete(trade.id)} style={{background:"none",border:"none",color:"#2a3f55",cursor:"pointer",fontSize:14,padding:0}} title="Delete">✕</button>
      </td>
    </tr>
  );
}

function TradeJournal() {
  const [trades,setTrades]=useState([]);
  const [filter,setFilter]=useState("ALL");

  const addTrade=t=>setTrades(p=>[t,...p]);
  const deleteTrade=id=>setTrades(p=>p.filter(t=>t.id!==id));

  const chronological=[...trades].reverse();
  const filtered=filter==="ALL"?trades:trades.filter(t=>t.result===filter);

  const wins=trades.filter(t=>t.result==="WIN").length;
  const losses=trades.filter(t=>t.result==="LOSS").length;
  const totalPnL=trades.reduce((s,t)=>s+t.pnl,0);
  const winRate=trades.length?((wins/trades.length)*100).toFixed(1):"0.0";
  const avgWin=wins?(trades.filter(t=>t.result==="WIN").reduce((s,t)=>s+t.pnl,0)/wins).toFixed(2):"0.00";
  const avgLoss=losses?Math.abs(trades.filter(t=>t.result==="LOSS").reduce((s,t)=>s+t.pnl,0)/losses).toFixed(2):"0.00";
  const rr=+avgLoss>0?(+avgWin/+avgLoss).toFixed(2):"—";
  const streak=trades.length?trades.reduce((s,t,i)=>i===0||t.result===trades[0].result?s+1:s,0):0;

  const stats=[
    {label:"Total P&L",value:`${totalPnL>=0?"+":""}$${totalPnL.toFixed(2)}`,color:totalPnL>=0?"#00e59b":"#ff4d6d"},
    {label:"Win Rate",value:`${winRate}%`,color:+winRate>=50?"#00e59b":"#ff4d6d"},
    {label:"Total Trades",value:trades.length,color:"#c8ddf0"},
    {label:"Wins",value:wins,color:"#00e59b"},
    {label:"Losses",value:losses,color:"#ff4d6d"},
    {label:"Avg Win",value:`$${avgWin}`,color:"#00e59b"},
    {label:"Avg Loss",value:`$${avgLoss}`,color:"#ff4d6d"},
    {label:"R:R Ratio",value:rr,color:"#f0c040"},
    {label:"Current Streak",value:trades.length?`${streak}× ${trades[0]?.result}`:"—",color:trades[0]?.result==="WIN"?"#00e59b":trades[0]?.result==="LOSS"?"#ff4d6d":"#c8ddf0"},
  ];

  const filterBtn=f=>({
    padding:"4px 14px",borderRadius:3,border:"none",cursor:"pointer",fontSize:11,fontFamily:"monospace",fontWeight:600,
    background:filter===f?"#0e2235":"transparent",
    color:filter===f?(f==="WIN"?"#00e59b":f==="LOSS"?"#ff4d6d":"#00e59b"):"#4a6080",
    borderBottom:filter===f?`2px solid ${f==="WIN"?"#00e59b":f==="LOSS"?"#ff4d6d":"#00e59b"}`:"2px solid transparent",
  });

  return (
    <div>
      <TradeForm onAdd={addTrade}/>

      {/* Stats grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {stats.map(({label,value,color})=>(
          <div key={label} style={{background:"#0a1929",border:"1px solid #0e2235",borderRadius:6,padding:"10px 14px"}}>
            <div style={{color:"#4a6080",fontSize:10,fontFamily:"monospace",textTransform:"uppercase",marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:18,fontWeight:700,fontFamily:"monospace"}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      <EquityCurve trades={chronological}/>

      {/* Table */}
      <div style={{background:"#0a1929",border:"1px solid #0e2235",borderRadius:6,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #0e2235"}}>
          <div style={{color:"#4a6080",fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Trade History ({filtered.length})</div>
          <div style={{display:"flex",gap:2}}>
            {["ALL","WIN","LOSS"].map(f=><button key={f} style={filterBtn(f)} onClick={()=>setFilter(f)}>{f}</button>)}
          </div>
        </div>
        {filtered.length===0?(
          <div style={{padding:40,textAlign:"center",color:"#2a3f55",fontSize:12,fontFamily:"monospace"}}>
            {trades.length===0?"No trades yet — log your first trade above.":"No trades match this filter."}
          </div>
        ):(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#060f1a"}}>
                  {["Date","Market","Dir","Entry","Exit","Stake","P&L","Result","Notes",""].map(h=>(
                    <th key={h} style={{padding:"8px 10px",textAlign:"left",color:"#2a3f55",fontSize:10,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:1,fontWeight:700,borderBottom:"1px solid #0e2235"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t=><TradeRow key={t.id} trade={t} onDelete={deleteTrade}/>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {trades.length>0&&trades.length<20&&(
        <div style={{marginTop:12,padding:"10px 14px",background:"rgba(240,192,64,0.04)",border:"1px solid rgba(240,192,64,0.15)",borderRadius:6}}>
          <span style={{color:"#f0c040",fontSize:11,fontFamily:"monospace"}}>💡 Log at least 20 trades to get reliable win rate and R:R data. You have {trades.length}/20.</span>
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function DerivAnalysisTool() {
  const [selectedMarket,setSelectedMarket]=useState(MARKETS[0]);
  const [candleData,setCandleData]=useState({});
  const [showBollinger,setShowBollinger]=useState(true);
  const [mainTab,setMainTab]=useState("analysis");

  useEffect(()=>{
    const init={};
    MARKETS.forEach(m=>{init[m.id]=generateCandles(m.base,60,m.type==="synthetic"?0.015:0.005);});
    setCandleData(init);
  },[]);

  const candles=candleData[selectedMarket.id]||[];
  const closes=candles.map(c=>c.close);
  const rsi=calcRSI(closes), macd=calcMACD(closes), bollinger=calcBollinger(closes);
  const lastRSI=rsi.filter(v=>v!=null).slice(-1)[0]??50;
  const lastMACD=macd.macdLine.filter(v=>v!=null).slice(-1)[0]??0;
  const lastSignal=macd.signalLine.filter(v=>v!=null).slice(-1)[0]??0;
  const lastClose=closes.slice(-1)[0]??selectedMarket.base;
  const lastBoll=bollinger.slice(-1)[0];
  const prevClose=closes.slice(-2,-1)[0]??lastClose;
  const changePct=((lastClose-prevClose)/prevClose)*100;

  const rsiSignal=lastRSI>70?"SELL":lastRSI<30?"BUY":"NEUTRAL";
  const macdSignal=lastMACD>lastSignal?"BUY":lastMACD<lastSignal?"SELL":"NEUTRAL";
  const bollSignal=lastBoll?.lower!=null?(lastClose<lastBoll.lower?"BUY":lastClose>lastBoll.upper?"SELL":"NEUTRAL"):"NEUTRAL";
  const trendSignal=closes.length>20?(lastClose>closes.slice(-20)[0]?"BUY":"SELL"):"NEUTRAL";
  const signalScore=[rsiSignal,macdSignal,bollSignal,trendSignal].reduce((s,v)=>s+(v==="BUY"?1:v==="SELL"?-1:0),0);
  const overallSentiment=Math.round(50+(signalScore/4)*40);

  const addCandle=c=>setCandleData(p=>({...p,[selectedMarket.id]:[...(p[selectedMarket.id]||[]).slice(-79),c]}));
  const reset=()=>setCandleData(p=>({...p,[selectedMarket.id]:generateCandles(selectedMarket.base,60,selectedMarket.type==="synthetic"?0.015:0.005)}));

  const card={background:"#0a1929",border:"1px solid #0e2235",borderRadius:6,padding:16};
  const cardTitle={color:"#4a6080",fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:12};
  const mktTab=(active,type)=>({padding:"8px 14px",borderRadius:"4px 4px 0 0",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",border:"none",background:active?"#0e2235":"transparent",color:active?(type==="synthetic"?"#00e59b":"#00aaff"):"#4a6080",borderTop:active?`2px solid ${type==="synthetic"?"#00e59b":"#00aaff"}`:"2px solid transparent"});
  const navTab=active=>({padding:"10px 22px",cursor:"pointer",border:"none",background:"none",fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:1,color:active?"#00e59b":"#2a3f55",borderBottom:active?"2px solid #00e59b":"2px solid transparent",marginBottom:-2});

  return (
    <div style={{minHeight:"100vh",background:"#060f1a",color:"#c8ddf0",fontFamily:"'JetBrains Mono','Fira Mono',monospace",paddingBottom:40}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:#060f1a;}
        ::-webkit-scrollbar-thumb{background:#1e2d3d;border-radius:2px;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        select option{background:#0a1929;color:#c8ddf0;}
      `}</style>

      {/* Header */}
      <div style={{background:"linear-gradient(180deg,#0a1929 0%,#060f1a 100%)",borderBottom:"1px solid #0e2235",padding:"0 24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:16,padding:"16px 0 12px"}}>
          <svg width="28" height="28" viewBox="0 0 28 28">
            <polygon points="14,2 26,24 2,24" fill="none" stroke="#00e59b" strokeWidth="2"/>
            <polygon points="14,8 21,20 7,20" fill="#00e59b" opacity="0.3"/>
          </svg>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:-0.5}}>DERIV<span style={{color:"#00e59b"}}>ANALYST</span></span>
          <div style={{flex:1}}/>
          <div style={{fontSize:11,color:"#4a6080"}}>{new Date().toLocaleString()}</div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {MARKETS.map(m=><button key={m.id} style={mktTab(m.id===selectedMarket.id,m.type)} onClick={()=>setSelectedMarket(m)}>{m.label}</button>)}
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,padding:"16px 24px 0"}}>
        {[
          {label:"LAST PRICE",value:lastClose.toFixed(selectedMarket.type==="forex"?5:2),up:changePct>=0},
          {label:"CHANGE %",value:(changePct>=0?"+":"")+changePct.toFixed(3)+"%",up:changePct>=0},
          {label:"RSI (14)",value:lastRSI.toFixed(1),up:lastRSI<50},
          {label:"SIGNAL",value:signalScore>0?"BUY":signalScore<0?"SELL":"HOLD",up:signalScore>=0},
        ].map((st,i)=>(
          <div key={i} style={{background:"#0a1929",border:"1px solid #0e2235",borderRadius:6,padding:"12px 16px"}}>
            <div style={{color:"#4a6080",fontSize:10,letterSpacing:1,marginBottom:4}}>{st.label}</div>
            <div style={{fontSize:20,fontWeight:700,color:st.up?"#00e59b":"#ff4d6d"}}>{st.value}</div>
          </div>
        ))}
      </div>

      {/* Nav tabs */}
      <div style={{display:"flex",borderBottom:"2px solid #0e2235",padding:"0 24px",marginTop:20}}>
        <button style={navTab(mainTab==="analysis")} onClick={()=>setMainTab("analysis")}>📊 ANALYSIS</button>
        <button style={navTab(mainTab==="journal")} onClick={()=>setMainTab("journal")}>📒 TRADE JOURNAL</button>
      </div>

      <div style={{padding:"20px 24px 0"}}>
        {mainTab==="analysis"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:20}}>
            <div>
              <div style={{...card,padding:"12px 16px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={cardTitle}>Price Chart — {selectedMarket.label}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#4a6080",cursor:"pointer"}}>
                      <input type="checkbox" checked={showBollinger} onChange={e=>setShowBollinger(e.target.checked)} style={{accentColor:"#00aaff"}}/>
                      Bollinger
                    </label>
                    <button onClick={reset} style={{background:"#0e2235",border:"1px solid #1e2d3d",color:"#4a6080",borderRadius:4,padding:"3px 10px",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>Reset</button>
                  </div>
                </div>
                <div style={{height:260,background:"#060f1a",borderRadius:4,overflow:"hidden"}}><CandleChart candles={candles} bollinger={bollinger} showBollinger={showBollinger}/></div>
                <div style={{height:90,marginTop:4,background:"#060f1a",borderRadius:4,overflow:"hidden"}}><RSIChart rsi={rsi}/></div>
                <div style={{height:90,marginTop:4,background:"#060f1a",borderRadius:4,overflow:"hidden"}}><MACDChart macd={macd}/></div>
              </div>
              <div style={{...card,marginTop:16}}>
                <div style={cardTitle}>Manual Candle Entry</div>
                <AddCandleForm onAdd={addCandle} lastClose={lastClose}/>
                <div style={{marginTop:10,color:"#2a3f55",fontSize:10}}>{candles.length} candles · Last: {new Date(candles.slice(-1)[0]?.time??Date.now()).toLocaleTimeString()}</div>
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={card}>
                <div style={cardTitle}>Market Sentiment</div>
                <div style={{display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap"}}>
                  <SentimentGauge value={overallSentiment} label="Overall"/>
                  <SentimentGauge value={Math.round(50+(lastMACD-lastSignal)/(Math.abs(lastMACD)||1)*25)} label="Momentum"/>
                </div>
                <div style={{marginTop:12,padding:"8px 12px",background:overallSentiment>60?"rgba(0,229,155,0.08)":overallSentiment<40?"rgba(255,77,109,0.08)":"rgba(240,192,64,0.08)",borderRadius:4,border:`1px solid ${overallSentiment>60?"#00e59b30":overallSentiment<40?"#ff4d6d30":"#f0c04030"}`}}>
                  <div style={{fontSize:11,color:overallSentiment>60?"#00e59b":overallSentiment<40?"#ff4d6d":"#f0c040",textAlign:"center",fontWeight:700,letterSpacing:2}}>
                    {overallSentiment>60?"▲ BULLISH BIAS":overallSentiment<40?"▼ BEARISH BIAS":"— SIDEWAYS"}
                  </div>
                </div>
              </div>
              <div style={card}>
                <div style={cardTitle}>Indicator Signals</div>
                <Signal label="RSI (14)" signal={rsiSignal}/>
                <Signal label="MACD (12,26,9)" signal={macdSignal}/>
                <Signal label="Bollinger Bands" signal={bollSignal}/>
                <Signal label="Price Trend (20)" signal={trendSignal}/>
              </div>
              <div style={card}>
                <div style={cardTitle}>Bollinger Bands</div>
                {lastBoll?.upper!=null?[
                  {label:"Upper",val:lastBoll.upper},
                  {label:"Middle (SMA)",val:lastBoll.mid},
                  {label:"Lower",val:lastBoll.lower},
                  {label:"%B Position",val:((lastClose-lastBoll.lower)/((lastBoll.upper-lastBoll.lower)||1)*100).toFixed(1)+"%"},
                ].map(({label,val})=>(
                  <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #0d1f30",fontSize:11}}>
                    <span style={{color:"#4a6080"}}>{label}</span>
                    <span style={{color:"#c8ddf0",fontWeight:600}}>{typeof val==="string"?val:val.toFixed(selectedMarket.type==="forex"?5:2)}</span>
                  </div>
                )):<div style={{color:"#2a3f55",fontSize:11}}>Need 20+ candles</div>}
              </div>
              <div style={{...card,background:"linear-gradient(135deg,#0a1929,#0d1f30)",border:"1px solid #1a3050"}}>
                <div style={cardTitle}>⚡ Tip</div>
                <p style={{color:"#4a6080",fontSize:11,lineHeight:1.7,margin:0}}>After analysis, switch to <strong style={{color:"#00e59b"}}>Trade Journal</strong> to log your trades and track your real performance over time.</p>
              </div>
            </div>
          </div>
        )}

        {mainTab==="journal"&&<TradeJournal/>}
      </div>
    </div>
  );
}
