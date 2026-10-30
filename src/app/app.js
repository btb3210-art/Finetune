(function(){
"use strict";
const $ = (id) => document.getElementById(id);
const NAMES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const SOLFA = ['도','도♯','레','미♭','미','파','파♯','솔','라♭','라','시♭','시'];
const midiName = (m) => { const r = Math.round(m); return NAMES[((r%12)+12)%12] + (Math.floor(r/12)-1); };
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const median = (a) => { if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y); const h=s.length>>1; return s.length%2?s[h]:(s[h-1]+s[h])/2; };
const mean = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;
const fmtSigned = (v, d=0) => (v>0?'+':v<0?'−':'±') + Math.abs(v).toFixed(d);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- settings ---------------- */
const LS_SET = 'practice-coach-settings-v1', LS_HIST = 'practice-coach-history-v1';
const S = { bpm:80, countIn:1, vol:1, a4:440, transpose:0, octFree:true, tolC:20, tolMs:60, gate:0.008, clickFilter:true, latency:0, freeMeter:'4/4', freeGrid:2, theme:'', toneVol:0.6, guide:false, toneInst:'piano', subdiv:1, refNote:69, clickSound:'wood', demoCountIn:0, nsAnalyze:false, glideFilter:true, stringMode:'auto' };
try { Object.assign(S, JSON.parse(localStorage.getItem(LS_SET) || '{}')); } catch(e) {}
const saveSettings = () => { try { localStorage.setItem(LS_SET, JSON.stringify(S)); } catch(e) {} };

function bindSettings(){
  const map = { a4:'a4', transpose:'transpose', tolC:'tolC', tolMs:'tolMs', gate:'gate', latency:'latency', countIn:'countIn', vol:'vol', freeMeter:'freeMeter', freeGrid:'freeGrid', theme:'theme' };
  for (const [id,key] of Object.entries(map)) {
    const el = $(id); el.value = S[key];
    el.addEventListener('change', () => {
      const v = el.value; S[key] = (key==='freeMeter'||key==='theme') ? v : parseFloat(v);
      if (key==='theme') applyTheme();
      if (key==='latency') updateLatChip();
      if (key==='tolC') drawGaugeTol();
      saveSettings();
      if ((key==='tolC'||key==='tolMs'||key==='a4'||key==='transpose') && lastSession) { analyzeAndReport(lastSession, false); }
      if (key==='freeMeter') { buildBeatDots(); updateNoScoreInfo(); metroRestartIfOn(); }
    });
  }
  $('vol').addEventListener('input', () => { S.vol = parseFloat($('vol').value); saveSettings(); syncVol(); });
  { const sel = $('toneInst'); const D = instData(); sel.innerHTML = Object.entries(D).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('') + '<option value="synth">기본 전자음</option>';
    if (!(S.toneInst in D) && S.toneInst !== 'synth') S.toneInst = 'piano'; sel.value = S.toneInst;
    sel.addEventListener('change', async () => { await ensureAudio(); setInstrument(sel.value, true); }); }
  { const cs = $('clickSound'); cs.innerHTML = Object.entries(CLICK_SOUNDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); cs.value = S.clickSound; cs.addEventListener('change', async () => { await ensureAudio(); setClickSound(cs.value, true); }); }
  setTimeout(updateStringBadge, 0);
  if ($('stringMode')) { $('stringMode').value = S.stringMode; $('stringMode').addEventListener('change', () => { S.stringMode = $('stringMode').value; saveSettings(); updateStringBadge(); if (lastSession) analyzeAndReport(lastSession, false); }); }
  $('demoCountIn').value = S.demoCountIn; $('demoCountIn').addEventListener('change', () => { S.demoCountIn = +$('demoCountIn').value; saveSettings(); });
  $('toneVol').value = S.toneVol; $('toneVol').addEventListener('input', () => { S.toneVol = parseFloat($('toneVol').value); saveSettings(); });
  for (const id of ['octFree','clickFilter','guide','glideFilter']) { const el=$(id); el.checked = !!S[id]; el.addEventListener('change', () => { S[id]=el.checked; saveSettings(); if(lastSession && id==='octFree') analyzeAndReport(lastSession,false); }); }
  setBpm(S.bpm);
  $('bpm').addEventListener('change', () => setBpm(parseFloat($('bpm').value)));
  $('bpmRange').addEventListener('input', () => setBpm(parseFloat($('bpmRange').value)));
  $('bpmDown').onclick = () => setBpm(S.bpm-2); $('bpmUp').onclick = () => setBpm(S.bpm+2);
  applyTheme(); updateLatChip();
}
function setBpm(v){ setTimeout(rememberSongSoon, 0); setTimeout(metroRestartIfOn, 0); setTimeout(updateNoScoreInfo, 0); if(!isFinite(v)) v=80; S.bpm = clamp(Math.round(v),20,300); $('bpm').value=S.bpm; $('bpmRange').value=clamp(S.bpm,30,240); saveSettings(); }
function applyTheme(){ if (S.theme) document.documentElement.setAttribute('data-theme', S.theme); else document.documentElement.removeAttribute('data-theme'); }
function updateLatChip(){ $('latText').textContent = '지연 보정 ' + Math.round(S.latency) + 'ms'; $('latency').value = Math.round(S.latency); }

/* ---------------- audio engine ---------------- */
let ctx = null, analyser = null, micStream = null, buf = null, sr = 48000;
let clickBufs = null, loopOn = false, master = null;
async function ensureAudio(){
  if (!ctx) { ctx = new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'}); sr = ctx.sampleRate; master = ctx.createGain(); const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.2; master.connect(lim).connect(ctx.destination); makeClicks(); }
  if (ctx.state === 'suspended') await ctx.resume();
}
/* metronome sounds — each set has accent / middle (compound) / normal / subdivision */
const CLICK_SOUNDS = { wood: '우드블록', beep: '전자음 (삐)', click: '딸깍', stick: '스틱', cowbell: '카우벨', hihat: '하이햇', drum: '드럼 (킥+하이햇)', low: '낮은 톡' };
function makeClicks(){
  let seed = 12345; const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff*2 - 1; };
  const buf = (len, fn) => { const n = Math.round(sr*len), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); let st = {}; for (let i=0;i<n;i++) d[i] = fn(i/sr, i, st); return b; };
  const env = (t, a, dec) => Math.min(1, t/a) * Math.exp(-t/dec);
  const sine = (f) => (t) => Math.sin(2*Math.PI*f*t);
  const noiseHP = (k) => (t, i, st) => { const w = rnd(); const y = w - (st.p || 0)*k; st.p = w; return y; };
  const S_ = {
    wood:  (amp, bright, len) => buf(len, (t, i, st) => noiseHP(bright)(t, i, st) * amp * Math.exp(-t/0.006)),
    beep:  (amp, f, len) => buf(len, (t) => sine(f)(t) * amp * env(t, 0.002, 0.018)),
    click: (amp, f, len) => buf(len, (t) => Math.sign(Math.sin(2*Math.PI*f*t)) * amp * env(t, 0.0005, 0.0025)),
    stick: (amp, f, len) => buf(len, (t, i, st) => (0.6*Math.sin(2*Math.PI*f*t) + 0.5*noiseHP(0.9)(t, i, st)) * amp * env(t, 0.0008, 0.008)),
    cowbell: (amp, f, len) => buf(len, (t) => (Math.sign(Math.sin(2*Math.PI*f*t)) + Math.sign(Math.sin(2*Math.PI*f*1.48*t))) * 0.35 * amp * env(t, 0.001, 0.06)),
    hihat: (amp, dec, len) => buf(len, (t, i, st) => noiseHP(0.98)(t, i, st) * amp * env(t, 0.0008, dec)),
    kick:  (amp, len) => buf(len, (t) => { const f = 50 + 110*Math.exp(-t/0.03); return Math.sin(2*Math.PI*f*t) * amp * env(t, 0.001, 0.09); }),
    low:   (amp, f, len) => buf(len, (t) => (Math.sin(2*Math.PI*f*t) + 0.3*Math.sin(4*Math.PI*f*t)) * amp * env(t, 0.001, 0.02)),
  };
  const k = S.clickSound in CLICK_SOUNDS ? S.clickSound : 'wood';
  const sets = {
    wood:    () => ({ acc: S_.wood(0.9, 0.95, 0.03), mid: S_.wood(0.55, 0.85, 0.03), norm: S_.wood(0.45, 0.7, 0.025), sub: S_.wood(0.2, 0.6, 0.018) }),
    beep:    () => ({ acc: S_.beep(0.5, 1760, 0.08), mid: S_.beep(0.38, 1480, 0.07), norm: S_.beep(0.32, 1175, 0.07), sub: S_.beep(0.14, 880, 0.05) }),
    click:   () => ({ acc: S_.click(0.55, 3200, 0.02), mid: S_.click(0.4, 2600, 0.02), norm: S_.click(0.35, 2200, 0.02), sub: S_.click(0.15, 1800, 0.015) }),
    stick:   () => ({ acc: S_.stick(0.9, 2400, 0.04), mid: S_.stick(0.6, 2100, 0.035), norm: S_.stick(0.5, 1900, 0.035), sub: S_.stick(0.22, 1700, 0.025) }),
    cowbell: () => ({ acc: S_.cowbell(0.7, 800, 0.25), mid: S_.cowbell(0.5, 700, 0.2), norm: S_.cowbell(0.42, 587, 0.2), sub: S_.cowbell(0.18, 587, 0.12) }),
    hihat:   () => ({ acc: S_.hihat(0.8, 0.09, 0.2), mid: S_.hihat(0.55, 0.035, 0.08), norm: S_.hihat(0.5, 0.03, 0.07), sub: S_.hihat(0.22, 0.02, 0.05) }),
    drum:    () => ({ acc: S_.kick(1.0, 0.3), mid: S_.kick(0.7, 0.25), norm: S_.hihat(0.5, 0.03, 0.07), sub: S_.hihat(0.2, 0.02, 0.05) }),
    low:     () => ({ acc: S_.low(0.8, 660, 0.1), mid: S_.low(0.55, 523, 0.09), norm: S_.low(0.5, 440, 0.09), sub: S_.low(0.2, 392, 0.06) }),
  };
  clickBufs = sets[k]();
}
function setClickSound(k, preview){
  S.clickSound = k; saveSettings();
  document.querySelectorAll('.clickSoundSel').forEach(el => el.value = k);
  if (ctx) { makeClicks(); if (preview && !session) { const t = ctx.currentTime + 0.05, b = 60/Math.max(60, S.bpm); playClick(t, 'acc'); playClick(t + b*0.5, 'norm'); playClick(t + b, 'norm'); } }
}
let clickBus = null;
function getClickBus(){
  if (clickBus) return clickBus;
  const pre = ctx.createGain(); pre.gain.value = 1;
  const sat = ctx.createWaveShaper(); const n = 2048, curve = new Float32Array(n);
  for (let i=0;i<n;i++){ const x = i/(n-1)*2 - 1; curve[i] = Math.tanh(1.6*x)/Math.tanh(1.6); }   // loud but no harsh clipping
  sat.curve = curve; sat.oversample = '2x';
  pre.connect(sat).connect(ctx.destination); clickBus = pre; return pre;
}
function playClick(t, kind){
  if (S.vol <= 0) return;
  const s = ctx.createBufferSource(); s.buffer = clickBufs[kind] || clickBufs.norm;
  const g = ctx.createGain(); g.gain.value = S.vol * 1.8;            // volume slider goes up to 200%
  s.connect(g).connect(getClickBus()); s.start(Math.max(t, ctx.currentTime));
}
async function ensureMic(){
  await ensureAudio();
  if (micStream) return true;
  const inViewer = !!window.claude || !window.isSecureContext;
  const noMicMsg = () => { setMic('err','마이크 사용 불가'); if (inViewer) document.body.classList.add('nomic');
    $('sideMsg').textContent = inViewer ? '이 화면(claude.ai 페이지)에서는 마이크를 쓸 수 없어서 튜너와 분석이 꺼져 있어요. 대신 [기준음]을 켜고 귀로 맞춰 보세요. 태블릿에서 튜너까지 쓰려면 파인튠을 https 주소로 열어야 해요.' : '브라우저 주소창의 마이크 아이콘에서 허용한 뒤 다시 눌러 주세요.';
    $('sideMsg').classList.add('err'); };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { noMicMsg(); return false; }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
  } catch(e) {
    noMicMsg(); return false;
  }
  const src = ctx.createMediaStreamSource(micStream);
  analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
  src.connect(analyser); buf = new Float32Array(analyser.fftSize);
  setMic('on','마이크 켜짐');
  startLoop();
  return true;
}
function setMic(state, text){ const c=$('micChip'); c.classList.remove('on','err'); if(state) c.classList.add(state); $('micText').textContent=text; }

/* ---------------- pitch detection (YIN) ---------------- */
let yinD = null;
function yin(x, rate, thr){
  const N = x.length, W = N>>1, maxTau = Math.min(W-1, Math.floor(rate/45)), minTau = Math.max(2, Math.floor(rate/4200));
  if (!yinD || yinD.length !== W) yinD = new Float32Array(W);
  const d = yinD;
  for (let tau=1; tau<=maxTau; tau++){ let s=0; for (let i=0;i<W;i++){ const v=x[i]-x[i+tau]; s+=v*v; } d[tau]=s; }
  d[0]=1; let run=0;
  for (let tau=1; tau<=maxTau; tau++){ run+=d[tau]; d[tau] = run>0 ? d[tau]*tau/run : 1; }
  let tau=-1;
  for (let t=minTau; t<=maxTau; t++){ if (d[t] < thr){ while (t+1<=maxTau && d[t+1] < d[t]) t++; tau=t; break; } }
  if (tau < 0) return null;
  let bt = tau;
  if (tau>1 && tau<maxTau){ const a=d[tau-1], b=d[tau], c=d[tau+1]; const den = a+c-2*b; if (den !== 0) bt = tau + (a-c)/(2*den); }
  return { f: rate/bt, conf: 1 - d[tau] };
}
const rmsOf = (x, a=0, b=x.length) => { let s=0; for(let i=a;i<b;i++) s+=x[i]*x[i]; return Math.sqrt(s/Math.max(1,b-a)); };

/* Frame processor shared by live mic and tests. Returns frame record. */
function makeProcessor(){
  const st = { lastTEnd: null, hist: [], lastOnset: -1, lastVoiced: false, onsetLevel: 0, minSince: Infinity };
  return function process(x, tEnd, rate, gate, out){
    const N = x.length;
    const rms = rmsOf(x);
    let p = null; if (rms > gate) p = yin(x, rate, 0.15);
    const voiced = !!(p && p.conf >= 0.8 && p.f > 40 && p.f < 4500);
    const tc = tEnd - N/(2*rate);
    const fr = { t: tc, f: voiced ? p.f : 0, c: p ? p.conf : 0, r: rms };
    // energy onset in the newest hop
    let hop = st.lastTEnd == null ? 800 : Math.round((tEnd - st.lastTEnd)*rate);
    hop = clamp(hop, 256, N); st.lastTEnd = tEnd;
    const start = N - hop, rNew = rmsOf(x, start, N);
    const ref = st.hist.length ? Math.min(...st.hist.slice(-8)) : 0;
    st.minSince = Math.min(st.minSince ?? Infinity, rNew);
    const gap = tEnd - st.lastOnset;
    const sameAttack = gap < 0.15 && !(st.minSince < 0.6*st.onsetLevel);   // still rising from the previous attack, no dip
    if (rNew > gate*1.3 && rNew > Math.max(ref, gate*0.35)*2.0 && gap > 0.07 && !sameAttack){
      let peak=0; const B=64, blocks=[];
      for (let i=start;i<N;i+=B){ const r=rmsOf(x,i,Math.min(N,i+B)); blocks.push([i,r]); if(r>peak) peak=r; }
      let at = start; for (const [i,r] of blocks){ if (r > 0.45*peak){ at=i; break; } }
      const t = tEnd - (N-at)/rate;
      out && out.onsets.push({ t, prevVoiced: st.lastVoiced, strength: rNew/Math.max(ref,1e-6) });
      st.lastOnset = tEnd; st.onsetLevel = rNew; st.minSince = rNew;
    }
    st.hist.push(rNew); if (st.hist.length>12) st.hist.shift();
    st.lastVoiced = voiced;
    out && out.frames.push(fr);
    return fr;
  };
}
let liveProc = makeProcessor();

/* ---------------- score state ---------------- */
let osmd = null, mode = 'score', score = null, scoreTitle = '샘플 에튀드', cursorTimes = [], cursorIdx = 0;
let pdfObjects = [];

function initOSMD(){
  osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay($('osmd'), {
    autoResize:false, backend:'svg', drawTitle:true, drawComposer:true, drawPartNames:false, autoBeam:true,
    followCursor:false, drawingParameters:'default',
    cursorsOptions:[{ type:0, color:'#2b59c3', alpha:0.35, follow:false }]
  });
}
let partIdx = 0, rawXML = null, loadName = '', viewAll = false;
async function loadMusicXML(content, name){
  if (metro.on) toggleMetro(false);
  mode = 'score'; $('pdfView').hidden = true; $('osmd').hidden = false; $('pdfView').innerHTML='';
  try { await osmd.load(content); }
  catch(e) { console.error(e); flash('악보를 읽지 못했어요. MusicXML 파일인지 확인해 주세요.', true); return; }
  rawXML = (typeof content === 'string' && content.trimStart().startsWith('<')) ? content : null; loadName = name;
  const ins = osmd.Sheet.Instruments;
  const sel = $('partSel');
  sel.innerHTML = ins.map((x, i) => `<option value="${i}">${i+1}. ${esc((x.Name || '파트 '+(i+1)).trim())}</option>`).join('');
  $('partGroup').hidden = ins.length < 2;
  // prefer the part whose name matches the instrument chosen before
  partIdx = 0;
  if (ins.length > 1 && S.toneInst && S.toneInst !== 'piano') { const k = ins.findIndex(x => { for (const [key, re] of INST_KEYWORDS) if (key === S.toneInst && re.test(x.Name || '')) return true; return false; }); if (k >= 0) partIdx = k; }
  sel.value = partIdx;
  scoreTitle = (osmd.Sheet.TitleString || name || 'MusicXML 악보').trim();
  await applyPart(partIdx, true);
  const t = osmd.Sheet.DefaultStartTempoInBpm; if (t && t>0 && name !== '__keep') setBpm(t);
  if (ins.length > 1) flash(`이 악보에는 파트가 ${ins.length}개 있어요. 위쪽 [파트]에서 연주할 파트를 고르세요. 지금은 '${(ins[partIdx].Name||'').trim()}' 파트예요.`);
}
async function applyPart(i, first){
  const ins = osmd.Sheet.Instruments; partIdx = i;
  if (ins.length > 1) ins.forEach((x, k) => { x.Visible = viewAll || (k === i); });
  try { osmd.EngravingRules.RenderPartNames = viewAll && ins.length > 1; } catch(e) {}
  const narrow = window.innerWidth < 700;
  osmd.zoom = viewAll && ins.length > 1 ? (narrow ? 0.45 : 0.6) : (narrow ? 0.72 : 1);
  try { osmd.render(); } catch(e) { console.error(e); flash('악보를 그리지 못했어요.', true); return; }
  // transposition of this part (sounding = written + transpose)
  let tr = null;
  if (rawXML) { try { const doc = new DOMParser().parseFromString(rawXML, 'application/xml'); const part = doc.querySelectorAll('part')[i]; const t = part && part.querySelector('transpose'); tr = t ? parseInt(t.querySelector('chromatic')?.textContent||'0') + 12*parseInt(t.querySelector('octave-change')?.textContent||'0') : 0; } catch(e) {} }
  else if (typeof ins[i].PlaybackTranspose === 'number') tr = ins[i].PlaybackTranspose;
  else if (ins.length > 1) tr = 0;
  if (tr !== null && !(first && loadName === '샘플 에튀드')) {
    S.transpose = tr; const sel = $('transpose');
    if (![...sel.options].some(o=>+o.value===S.transpose)) { const o=document.createElement('option'); o.value=S.transpose; o.textContent=`${S.transpose>0?'+':''}${S.transpose} 반음 (악보 정보)`; sel.appendChild(o); }
    sel.value = S.transpose; saveSettings();
  }
  const gi = guessInstrument(); if (gi && loadName !== '샘플 에튀드') { setInstrument(gi, false); if (!first || ins.length < 2) flash(`'${(ins[i].Name||'').trim()}' 파트로 바꿨어요. 예시 악기도 '${instData()[gi].label}'(으)로 맞췄어요.`); }
  score = extractScore();
  $('rangeFrom').value = score.measures[0].num; $('rangeTo').value = ''; $('rangeTo').placeholder = '끝 '+score.measures[score.measures.length-1].num;
  osmd.cursor.show(); buildCursorTimes(); attachNoteHandlers(); addPracticeHotspots();
  setModeUI(); buildBeatDots();
  $('fileName').textContent = scoreTitle;
  const nNotes = score.notes.filter(n=>!n.rest).length;
  $('scoreInfo').textContent = `${ins.length>1 ? (ins[i].Name||'').trim()+' · ' : ''}${score.measures.length}마디 · 음표 ${nNotes}개 · ${score.measures[0].num===0?'못갖춘마디 · ':''}${score.measures[0].tsN}/${score.measures[0].tsD}`;
  $('noteLegend').hidden = true; lastSession = null; $('report').hidden = true;
  if (!nNotes) flash('이 파트에는 음 높이가 있는 음표가 없어요. 다른 파트를 골라 주세요.', true);
}
function extractScore(){
  const sheet = osmd.Sheet; const measures = []; const notes = [];
  // main voice = smallest voice id on first staff
  let voiceId = Infinity;
  const staff = sheet.Instruments[partIdx] ? sheet.Instruments[partIdx].Staves[0] : null;
  const pick = (c) => staff ? c.StaffEntries.find(e => e && e.ParentStaff === staff) : c.StaffEntries[0];
  for (const sm of sheet.SourceMeasures) for (const c of sm.VerticalSourceStaffEntryContainers) { const se=pick(c); if(!se) continue; for (const ve of se.VoiceEntries) voiceId = Math.min(voiceId, ve.ParentVoice.VoiceId); }
  const tieStart = new Map();
  sheet.SourceMeasures.forEach((sm, mi) => {
    const mq = sm.AbsoluteTimestamp.RealValue*4, lenQ = sm.Duration.RealValue*4;
    const ts = sm.ActiveTimeSignature; const tsN = ts ? ts.Numerator : 4, tsD = ts ? ts.Denominator : 4;
    measures.push({ idx: mi, num: sm.MeasureNumber, q: mq, lenQ, tsN, tsD, barQ: tsN*4/tsD });
    for (const c of sm.VerticalSourceStaffEntryContainers) {
      const se = pick(c); if (!se) continue;
      const q = mq + c.Timestamp.RealValue*4;
      for (const ve of se.VoiceEntries) {
        if (ve.ParentVoice.VoiceId !== voiceId || ve.IsGrace) continue;
        let top = null;
        for (const n of ve.Notes) { if (!top || (!n.isRest() && (top.isRest() || n.halfTone > top.halfTone))) top = n; }
        if (!top) continue;
        const durQ = top.Length.RealValue*4;
        if (top.isRest()) { notes.push({ q, durQ, rest:true, m: mi, src: ve.Notes }); continue; }
        if (top.NoteTie && top.NoteTie.StartNote && top.NoteTie.StartNote !== top) {
          const st = tieStart.get(top.NoteTie.StartNote) || tieStart.get(top.NoteTie);
          if (st) { st.durQ = Math.max(st.durQ, q + durQ - st.q); st.src.push(...ve.Notes); st.tied = true; continue; }
        }
        const written = top.halfTone + 12;   // OSMD halfTone: C4 (middle C) = 48
        const e = { q, durQ, rest:false, m: mi, written, src: [...ve.Notes], tuplet: !!top.NoteTuplet, baseDur: durQ, gliss: !!(top.NoteGlissando && top.NoteGlissando.EndNote === top) };
        notes.push(e);
        if (top.NoteTie) { tieStart.set(top, e); tieStart.set(top.NoteTie, e); }
      }
    }
  });
  notes.sort((a,b)=>a.q-b.q);
  notes.forEach((n,i)=>n.i=i);
  return { measures, notes };
}

function buildCursorTimes(){
  cursorTimes = [];
  const c = osmd.cursor; c.reset();
  let guard = 0;
  while (!c.Iterator.EndReached && guard++ < 20000) { cursorTimes.push(c.Iterator.currentTimeStamp.RealValue*4); c.next(); }
  c.reset(); cursorIdx = 0;
}
function cursorTo(q){
  if (!cursorTimes.length) return;
  let target = 0; while (target+1 < cursorTimes.length && cursorTimes[target+1] <= q + 1e-6) target++;
  if (target < cursorIdx) { osmd.cursor.reset(); cursorIdx = 0; }
  let moved = false;
  while (cursorIdx < target) { osmd.cursor.next(); cursorIdx++; moved = true; }
  if (moved || q < 0) scrollToCursor();
}
function scrollToCursor(){
  const el = osmd.cursor.cursorElement; const box = $('scoreScroll'); if (!el) return;
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  const y = r.top - b.top + box.scrollTop;
  if (r.top < b.top + b.height*0.12 || r.bottom > b.top + b.height*0.8) box.scrollTo({ top: Math.max(0, y - b.height*0.25), behavior: 'smooth' });
}

async function loadPdf(arrBuf, name){
  noScore = false;
  mode = 'free'; setModeUI();
  const view = $('pdfView'); view.innerHTML = ''; view.hidden = false; $('osmd').hidden = true; if (osmd) { try { osmd.cursor.hide(); } catch(e){} }
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrBuf }).promise;
    for (let p=1; p<=pdf.numPages; p++){
      const page = await pdf.getPage(p);
      const w = Math.min(1600, view.clientWidth*(window.devicePixelRatio||1)*1.2 || 1200);
      const v1 = page.getViewport({ scale:1 }); const vp = page.getViewport({ scale: w/v1.width });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      view.appendChild(cv);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
    $('scoreInfo').textContent = `PDF ${pdf.numPages}쪽`;
  } catch(e) { console.error(e); flash('PDF를 열지 못했어요.', true); }
  $('fileName').textContent = scoreTitle = name;
}
function loadImage(url, name){
  noScore = false;
  mode = 'free'; setModeUI();
  const view = $('pdfView'); view.innerHTML = ''; view.hidden = false; $('osmd').hidden = true; if (osmd) { try { osmd.cursor.hide(); } catch(e){} }
  const img = new Image(); img.src = url; img.alt = name; view.appendChild(img);
  $('scoreInfo').textContent = '이미지 악보'; $('fileName').textContent = scoreTitle = name;
}
let noScore = false;
function loadNoScore(){
  stopAll(false); mode = 'free'; noScore = true; lastSession = null; $('report').hidden = true;
  const view = $('pdfView'); view.hidden = false; $('osmd').hidden = true; if (osmd) { try { osmd.cursor.hide(); } catch(e){} }
  view.innerHTML = `<div class="noscore">
    <div class="ns-tempo">
      <div class="ns-trow"><button class="ns-b" data-bpm="-5" aria-label="템포 5 내리기">−5</button><button class="ns-b" data-bpm="-1" aria-label="템포 1 내리기">−1</button><span class="num" id="nsBpm"></span><button class="ns-b" data-bpm="1" aria-label="템포 1 올리기">+1</button><button class="ns-b" data-bpm="5" aria-label="템포 5 올리기">+5</button></div>
      <small>BPM (♩) · <span id="nsMeter"></span></small>
    </div>
    <div class="bigbeats" id="bigBeats"></div>
    <div class="ns-bar" id="nsBar">[연습 시작]을 누르면 메트로놈이 시작돼요</div>
    <div class="ns-btns">
      <button class="ns-start ns-prac" id="nsPractice" type="button">● 연습 시작</button>
      <button class="ns-start" id="nsStart" type="button">▶ 메트로놈 켜기</button>
      <button class="ns-start ns-tun" id="nsTuner" type="button">♪ 튜너 켜기</button>
    </div>
    <label class="ns-vol">메트로놈 크기 <input type="range" id="nsVol" min="0" max="2" step="0.05" aria-label="메트로놈 크기"><b class="num" id="nsVolT"></b></label>
    <div class="ns-live" id="nsLive"><span>감지한 음 <b class="num" id="nsLiveN">0</b></span><span>음정 정확도 <b class="num" id="nsLiveP">–</b></span><span>박자 정확도 <b class="num" id="nsLiveR">–</b></span></div>
    <div class="ns-notes" id="nsNotes"></div>
    <p class="ns-help">[연습 시작]을 누르면 튜너가 켜지고 음정을 세요. 연습 중에 메트로놈을 켜면 박자도 함께 세요. [연습 끝]을 누르면 결과가 나와요.</p>
    <div class="ns-tools">
      <button class="ns-tap" id="nsTap" type="button">탭 템포<small>박자에 맞춰 여러 번 누르기</small></button>
      <label class="ns-f">박자<select id="nsMeterSel"><option>2/4</option><option>3/4</option><option>4/4</option><option>6/8</option><option>2/2</option></select></label>
      <label class="ns-f">소리<select id="nsSound" class="clickSoundSel"></select></label>
      <label class="ns-f">쪼개서 듣기<select id="nsSub"><option value="1">없음</option><option value="2">8분음표</option><option value="3">셋잇단</option><option value="4">16분음표</option></select></label>
    </div>
    <div class="ns-ref">
      <span class="ns-rl">기준음</span>
      <select id="refStep" aria-label="기준음 이름"></select>
      <select id="refOct" aria-label="기준음 옥타브"><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>
      <button class="ns-b wide" id="refBtn" type="button">▶ 켜기</button>
      <small>마이크가 없는 태블릿·휴대폰에서도 귀로 음을 맞출 수 있어요 (A4 = ${S.a4}Hz 기준)</small>
    </div>
    <div class="ns-time"><span>이번 연습 <b class="num" id="nsElapsed">0:00</b></span><span>오늘 누적 <b class="num" id="nsToday">0분</b></span></div>
    <div class="ns-shelf">
      <div class="ns-bi"><b>기본 연습곡</b>${Object.entries(BI_INST).map(([k, l]) => `<button class="btn sm" type="button" data-shelf-bi="${k}">${l} ${builtins().filter(p => p.inst === k).length}곡</button>`).join('')}<span class="msg">롱톤 · 개방현 · 스케일 · 음정 · 쉬운 곡 · 캐럴 · 클래식</span></div>
      <div class="ns-sh"><b>내 곡에서 꺼내 연습하기</b><span style="flex:1"></span><label class="btn sm" for="fileIn">+ 곡 추가</label><button class="btn sm" type="button" onclick="document.getElementById('songsBtn').click()">모두 보기</button></div>
      <div class="shelf" id="shelfList"></div>
    </div>
  </div>`;
  renderSongs();
  view.querySelectorAll('[data-bpm]').forEach(bn => bn.onclick = () => { setBpm(S.bpm + +bn.dataset.bpm); });
  $('nsMeterSel').value = S.freeMeter; $('nsMeterSel').onchange = () => { $('freeMeter').value = $('nsMeterSel').value; $('freeMeter').dispatchEvent(new Event('change')); };
  $('nsSound').innerHTML = Object.entries(CLICK_SOUNDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); $('nsSound').value = S.clickSound;
  $('nsSound').onchange = async () => { await ensureAudio(); setClickSound($('nsSound').value, true); };
  $('nsStart').onclick = () => toggleMetro();
  $('nsTuner').onclick = toggleTuner; setTuner(tunerOnly);
  $('nsVol').addEventListener('input', () => { S.vol = parseFloat($('nsVol').value); saveSettings(); syncVol(); }); syncVol(); renderLiveNotes(null);
  $('nsPractice').onclick = () => $('playBtn').click(); updateMetroUI();
  $('nsSub').value = S.subdiv; $('nsSub').onchange = () => { S.subdiv = +$('nsSub').value; saveSettings(); };
  const taps = []; $('nsTap').onclick = () => { const t = performance.now(); if (taps.length && t - taps[taps.length-1] > 2000) taps.length = 0; taps.push(t); if (taps.length > 6) taps.shift();
    if (taps.length >= 3) { const iv = []; for (let k = 1; k < taps.length; k++) iv.push(taps[k] - taps[k-1]); setBpm(60000 / median(iv)); } };
  $('refStep').innerHTML = SOLFA.map((n, k) => `<option value="${k}">${n} (${NAMES[k]})</option>`).join('');
  $('refStep').value = ((S.refNote % 12) + 12) % 12; $('refOct').value = Math.floor(S.refNote/12) - 1;
  const refSet = () => { S.refNote = (+$('refOct').value + 1)*12 + +$('refStep').value; saveSettings(); if (refOsc) { stopRef(); startRef(); } };
  $('refStep').onchange = refSet; $('refOct').onchange = refSet;
  $('refBtn').onclick = async () => { if (refOsc) stopRef(); else { await ensureAudio(); startRef(); } };
  updatePracticeClock();
  scoreTitle = '개인 연습'; $('fileName').textContent = scoreTitle; $('scoreInfo').textContent = '';
  setModeUI(); buildBeatDots(); updateNoScoreInfo();
}
function updateNoScoreInfo(){ if (!noScore || !$('nsBpm')) return; $('nsBpm').textContent = S.bpm; $('nsMeter').textContent = S.freeMeter; if ($('nsMeterSel')) $('nsMeterSel').value = S.freeMeter; }
/* reference pitch (drone) for tuning by ear */
let refOsc = null;
function startRef(){
  const f = S.a4*Math.pow(2, (S.refNote - 69)/12);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.25*Math.max(0.3, S.toneVol), ctx.currentTime + 0.08);
  const g2 = ctx.createGain(); g2.gain.value = 0.35;
  o.connect(g); o2.connect(g2).connect(g); g.connect(master); o.start(); o2.start();
  refOsc = { o, o2, g };
  if ($('refBtn')) { $('refBtn').textContent = '■ 끄기'; $('refBtn').classList.add('on'); }
}
function stopRef(){
  if (!refOsc) return; const { o, o2, g } = refOsc; refOsc = null;
  try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); o.stop(ctx.currentTime + 0.2); o2.stop(ctx.currentTime + 0.2); } catch(e) {}
  if ($('refBtn')) { $('refBtn').textContent = '▶ 켜기'; $('refBtn').classList.remove('on'); }
}
/* practice clock: this session and today's total (kept in this browser) */
const todayKey = () => 'practice-coach-time-' + new Date().toISOString().slice(0, 10);
function todaySec(){ try { return +localStorage.getItem(todayKey()) || 0; } catch(e) { return 0; } }
function addTodaySec(x){ try { localStorage.setItem(todayKey(), String(todaySec() + x)); } catch(e) {} }
let clockStart = null;
const fmtMS = (sec) => `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
function updatePracticeClock(){
  if (!$('nsElapsed')) return;
  const run = clockStart ? (performance.now() - clockStart)/1000 : 0;
  $('nsElapsed').textContent = fmtMS(run); $('nsToday').textContent = Math.floor((todaySec() + run)/60) + '분';
}
setInterval(updatePracticeClock, 1000);
function setModeUI(){
  const free = mode === 'free';
  if (!free) noScore = false;
  $('modeLabel').textContent = !free ? '분석 모드 · MusicXML' : noScore ? '개인 연습 · 악보 없이' : '자유 연습 모드 · 보기 전용 악보';
  $('rangeGroup').hidden = free; if (free) $('partGroup').hidden = true;
  $('metroBtn').hidden = !free; $('freeGroup').hidden = !free;
  $('demoBtn').disabled = free; $('demoBtn').title = free ? '사진·PDF 악보는 악보 인식기로 MusicXML로 바꾼 뒤 예시를 들을 수 있어요' : '';
  $('noteHint').hidden = free;
  $('omrLink').hidden = !free || noScore;
  if (free && !noScore) flash('PDF·사진 악보는 보기 전용이에요. 악보 위의 [악보 인식기로 변환]을 누르면 MusicXML로 바꿔 예시 듣기와 분석을 쓸 수 있어요.');
  $('noteLegend').hidden = true;
  $('tTarget').style.visibility = free ? 'hidden' : 'visible';
}

/* ---------------- file loading ---------------- */
$('fileIn').addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return; ev.target.value = '';
  closeDrawer(); await openFileAsSong(f);
});

/* ---------------- my songs (library of scores to practise) ---------------- */
let songStore = null, songs = [], curSongId = null, songSaveT = null, applyingSong = false;
const kindOf = (ext) => ext === 'pdf' ? 'pdf' : (/^(png|jpe?g|webp|gif)$/.test(ext) ? 'img' : 'xml');
const KIND_KO = { xml: 'MusicXML', pdf: 'PDF', img: '사진' };
async function unzipMxl(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder();
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {};
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, lho }; p += 46 + nl + xl + cl;
  }
  const read = async (f) => { const nl = dv.getUint16(f.lho + 26, true), xl = dv.getUint16(f.lho + 28, true), st = f.lho + 30 + nl + xl; const data = u8.subarray(st, st + f.csize);
    if (f.method === 0) return dec.decode(data);
    return dec.decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); };
  let root = null;
  if (files['META-INF/container.xml']) { const c = new DOMParser().parseFromString(await read(files['META-INF/container.xml']), 'application/xml'); const rf = c.querySelector('rootfile'); if (rf) root = rf.getAttribute('full-path'); }
  if (!root || !files[root]) root = Object.keys(files).find(k => !k.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(k));
  return read(files[root]);
}
function cloudSongs(db, assets, uid){
  const col = db.collection(`data/users/${uid}`);
  return { kind: 'cloud',
    async list(){ const q = await col.orderBy('lastAt', 'desc').limit(300).get(); return q.docs.map(d => ({ id: d.id, ...d.data() })); },
    async add(rec, blob){ const up = await assets.upload(blob); const data = { ...rec, assetId: up.id, url: up.url }; const ref = await col.add(data); return { id: ref.id, ...data }; },
    async data(rec){ const r = await fetch(rec.url); if (!r.ok) throw new Error('fetch'); return rec.kind === 'xml' ? r.text() : r.blob(); },
    async update(id, patch){ await col.doc(id).update(patch); },
    async remove(rec){ await col.doc(rec.id).delete(); try { await assets.delete(rec.assetId); } catch(e) {} } };
}
function localSongs(){
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('practice-songs', 1); r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const st = async (mode) => (await open()).transaction('songs', mode).objectStore('songs');
  const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return { kind: 'local',
    async list(){ try { const all = await rq((await st('readonly')).getAll()); return all.map(({ blob, ...m }) => m).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '')); } catch(e) { return []; } },
    async add(rec, blob){ const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await rq((await st('readwrite')).put({ id, ...rec, blob })); return { id, ...rec }; },
    async data(rec){ const r = await rq((await st('readonly')).get(rec.id)); return rec.kind === 'xml' ? r.blob.text() : r.blob; },
    async update(id, patch){ const s0 = await st('readwrite'); const r = await rq(s0.get(id)); if (r) await rq(s0.put({ ...r, ...patch })); },
    async remove(rec){ await rq((await st('readwrite')).delete(rec.id)); } };
}
async function initSongs(){
  try { if (window.claude && claude.use) { const [db, user, assets] = await Promise.all(['db', 'user', 'assets'].map(n => claude.use(n))); if (db && user && assets) { const uid = await user.id(); if (uid) songStore = cloudSongs(db, assets, uid); } } } catch(e) {}
  if (!songStore) songStore = localSongs();
  await refreshSongs();
}
async function refreshSongs(){ if (!songStore) return; try { songs = await songStore.list(); } catch(e) { songs = []; } renderSongs(); }
const nowIso = () => new Date().toISOString();
async function openFileAsSong(f){
  curBuiltin = null;
  const name = f.name.replace(/\.[^.]+$/, ''); const ext = (f.name.split('.').pop() || '').toLowerCase(); const kind = kindOf(ext);
  stopAll(false); $('report').hidden = true; lastSession = null; curSongId = null;
  let blob = f;
  if (kind === 'xml') {
    let text = null;
    if (ext === 'mxl') { try { text = await unzipMxl(await f.arrayBuffer()); } catch(e) { text = null; } }
    else text = await f.text();
    if (text) { await loadMusicXML(text, name); blob = new Blob([text], { type: 'text/plain' }); }
    else { await loadMusicXML(await readAs(f, 'binary'), name); blob = null; }   // very old browser: open without saving
  } else if (kind === 'pdf') await loadPdf(await f.arrayBuffer(), name);
  else loadImage(URL.createObjectURL(f), name);
  if (!blob || !songStore) return;
  const same = songs.find(x => x.title === name && x.kind === kind && x.size === blob.size);
  try {
    if (same) { curSongId = same.id; await songStore.update(same.id, { lastAt: nowIso() }); }
    else { const rec = await songStore.add({ title: scoreTitle || name, kind, size: blob.size, addedAt: nowIso(), lastAt: nowIso(), count: 0, settings: null }, blob); curSongId = rec.id; flash(`'${rec.title}'을(를) 내 곡에 넣었어요. 다음부터는 [내 곡]에서 바로 꺼낼 수 있어요.`); }
  } catch(e) { console.warn('song save failed', e); }
  refreshSongs(); rememberSongSoon();
}
async function openSong(id){
  curBuiltin = null;
  const rec = songs.find(x => x.id === id); if (!rec) return;
  closeDrawer(); stopAll(false); $('report').hidden = true; lastSession = null;
  flash(`'${rec.title}' 여는 중…`);
  try {
    const d = await songStore.data(rec);
    applyingSong = true;
    if (rec.kind === 'xml') await loadMusicXML(d, rec.title);
    else if (rec.kind === 'pdf') await loadPdf(await d.arrayBuffer(), rec.title);
    else loadImage(URL.createObjectURL(d), rec.title);
    curSongId = rec.id;
    await applySongSettings(rec.settings);
    applyingSong = false;
    flash(`'${rec.title}'을(를) 열었어요${rec.settings ? '. 지난번 템포·파트·구간 그대로예요' : ''}.`);
    songStore.update(rec.id, { lastAt: nowIso() }).then(refreshSongs).catch(() => {});
    $('scoreScroll').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch(e) { applyingSong = false; console.error(e); flash('곡을 열지 못했어요. 다시 눌러 주세요.', true); }
}
async function applySongSettings(st){
  if (!st) return;
  if (mode === 'score' && osmd.Sheet) {
    if (typeof st.view === 'boolean') { viewAll = st.view; $('viewSel').value = viewAll ? 'all' : 'part'; }
    if (osmd.Sheet.Instruments.length > 1 && st.part != null && st.part < osmd.Sheet.Instruments.length) { $('partSel').value = st.part; await applyPart(+st.part, false); }
    else if (typeof st.view === 'boolean' && osmd.Sheet.Instruments.length > 1) await applyPart(partIdx, false);
    if (st.from != null) $('rangeFrom').value = st.from; if (st.to) $('rangeTo').value = st.to;
  } else if (st.meter) { S.freeMeter = st.meter; $('freeMeter').value = st.meter; buildBeatDots(); }
  if (st.inst && st.inst !== S.toneInst && instData()[st.inst]) setInstrument(st.inst, false);
  if (st.bpm) setBpm(st.bpm);
}
/* ---------------- built-in exercises (original studies + public-domain melodies) ---------------- */
let BUILTIN = null, curBuiltin = null, drawerTab = 'mine', builtinInst = 'all';
function builtins(){ if (!BUILTIN) { try { BUILTIN = JSON.parse($('builtinData').textContent); } catch(e) { BUILTIN = []; } } return BUILTIN; }
const LS_BI = 'practice-coach-builtin-v1';
function biSettings(){ try { return JSON.parse(localStorage.getItem(LS_BI) || '{}'); } catch(e) { return {}; } }
async function openBuiltin(id){
  const p = builtins().find(x => x.id === id); if (!p) return;
  closeDrawer(); stopAll(false); $('report').hidden = true; lastSession = null;
  applyingSong = true; curSongId = null;
  await loadMusicXML(p.xml, p.title);
  curBuiltin = id;
  const st = biSettings()[id]; await applySongSettings(st);
  applyingSong = false;
  flash(`'${p.title}'을(를) 열었어요. ${p.desc}`);
  renderSongs(); $('scoreScroll').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
const BI_INST = { trumpet:'트럼펫', trombone:'트롬본', violin:'바이올린', viola:'비올라', cello:'첼로' };
function builtinCard(p){
  const st = biSettings()[p.id] || {};
  return `<div class="song ${p.id === curBuiltin ? 'cur' : ''}"><span class="kind k-${p.inst}">${BI_INST[p.inst] || p.inst}</span>
    <span class="smeta"><b>${esc(p.title)}</b><small>${esc(p.cat)} · ${esc(p.level)}${st.bpm ? ` · ♩=${st.bpm}` : ''}</small></span>
    <button class="btn sm" data-open-bi="${esc(p.id)}">열기</button></div>`;
}
function rememberSongSoon(){
  if (curBuiltin && !applyingSong) { clearTimeout(songSaveT); songSaveT = setTimeout(() => { const all = biSettings(); all[curBuiltin] = { bpm: S.bpm, from: $('rangeFrom').value || null, to: $('rangeTo').value || null, inst: S.toneInst }; try { localStorage.setItem(LS_BI, JSON.stringify(all)); } catch(e) {} }, 1200); return; }
  if (!curSongId || applyingSong || !songStore) return;
  clearTimeout(songSaveT);
  songSaveT = setTimeout(() => {
    const settings = { bpm: S.bpm, part: partIdx, view: viewAll, from: $('rangeFrom').value || null, to: $('rangeTo').value || null, inst: S.toneInst, meter: S.freeMeter };
    songStore.update(curSongId, { settings }).then(() => { const r = songs.find(x => x.id === curSongId); if (r) r.settings = settings; renderSongs(); }).catch(() => {});
  }, 1200);
}
function songCard(r, withDelete){
  const d = r.lastAt ? new Date(r.lastAt) : null; const st = r.settings || {};
  return `<div class="song ${r.id === curSongId ? 'cur' : ''}" data-song="${esc(r.id)}">
    <span class="kind k-${r.kind}">${KIND_KO[r.kind] || ''}</span>
    <span class="smeta"><b>${esc(r.title)}</b><small>${d ? d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) + ' 연습' : ''}${st.bpm ? ` · ♩=${st.bpm}` : ''}${r.count ? ` · ${r.count}회` : ''}</small></span>
    <button class="btn sm" data-open-song="${esc(r.id)}">열기</button>${withDelete ? `<button class="btn sm danger" data-del-song="${esc(r.id)}">삭제</button>` : ''}</div>`;
}
function renderSongs(){
  const tabMine = drawerTab === 'mine';
  if ($('tabMine')) { $('tabMine').classList.toggle('on', tabMine); $('tabBuiltin').classList.toggle('on', !tabMine); $('mineBox').hidden = !tabMine; $('builtinBox').hidden = tabMine; }
  if ($('builtinList')) {
    const q0 = ($('songSearch') && $('songSearch').value.trim().toLowerCase()) || '';
    const cats = ['개방현','롱톤','립 슬러','텅잉','스케일','아르페지오','음정','반음계','쉬운 곡','캐럴','클래식 주제'];
    const list = builtins().filter(p => (builtinInst === 'all' || p.inst === builtinInst) && (!q0 || (p.title + p.cat).toLowerCase().includes(q0)));
    $('builtinList').innerHTML = cats.map(c => { const xs = list.filter(p => p.cat === c); return xs.length ? `<div class="bi-cat">${c}</div>` + xs.map(builtinCard).join('') : ''; }).join('') || '<p class="msg">찾는 연습곡이 없어요.</p>';
    document.querySelectorAll('[data-bi-inst]').forEach(b => b.classList.toggle('on', b.dataset.biInst === builtinInst));
  }
  const q = ($('songSearch') && $('songSearch').value.trim().toLowerCase()) || '';
  const list = songs.filter(r => !q || r.title.toLowerCase().includes(q));
  if ($('songList')) $('songList').innerHTML = list.length ? list.map(r => songCard(r, true)).join('') : `<p class="msg">${songs.length ? '찾는 곡이 없어요.' : '아직 넣은 곡이 없어요. [+ 곡 추가]로 MusicXML·PDF·사진 악보를 넣어 보세요.'}</p>`;
  if ($('songSub')) $('songSub').textContent = songStore && songStore.kind === 'cloud' ? '내 Claude 계정에 저장돼요. 태블릿·PC 어디서 열어도 같은 목록이에요.' : '이 브라우저에 저장돼요.';
  if ($('shelfList')) $('shelfList').innerHTML = songs.length ? songs.slice(0, 6).map(r => songCard(r, false)).join('') : '<p class="msg" style="margin:0">곡을 넣어 두면 여기서 바로 꺼내 연습할 수 있어요.</p>';
  if ($('songCount')) $('songCount').textContent = songs.length ? String(songs.length) : '';
}
function openDrawer(tab, inst){ if (tab) drawerTab = tab; if (inst) builtinInst = inst; return openDrawer0(); }
function openDrawer0(){ $('songDrawer').hidden = false; renderSongs(); setTimeout(() => $('songSearch').focus(), 50); }
function closeDrawer(){ if ($('songDrawer')) $('songDrawer').hidden = true; }
document.addEventListener('click', async (ev) => {
  const o = ev.target.closest('[data-open-song]'); if (o) { openSong(o.dataset.openSong); return; }
  const bi = ev.target.closest('[data-open-bi]'); if (bi) { openBuiltin(bi.dataset.openBi); return; }
  const bt = ev.target.closest('[data-bi-inst]'); if (bt) { builtinInst = bt.dataset.biInst; renderSongs(); return; }
  const sb = ev.target.closest('[data-shelf-bi]'); if (sb) { openDrawer('builtin', sb.dataset.shelfBi); return; }
  const d = ev.target.closest('[data-del-song]');
  if (d) { if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = '한 번 더'; setTimeout(() => { d.dataset.armed = ''; d.textContent = '삭제'; }, 3000); return; }
    const r = songs.find(x => x.id === d.dataset.delSong); if (r) { try { await songStore.remove(r); } catch(e) {} if (curSongId === r.id) curSongId = null; refreshSongs(); } }
});

function readAs(file, kind){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; if (kind==='binary') r.readAsBinaryString(file); else r.readAsText(file); }); }
$('viewSel').addEventListener('change', async () => { viewAll = $('viewSel').value === 'all'; setTimeout(rememberSongSoon, 0); if (session) stopAll(false); clearNoteColors(); await applyPart(partIdx, false); flash(viewAll ? `전체 스코어를 보여 줘요. 커서·분석·예시는 '${(osmd.Sheet.Instruments[partIdx].Name||'').trim()}' 파트 기준이에요.` : '고른 파트만 보여 줘요.'); });
$('partSel').addEventListener('change', async () => { if (session) stopAll(false); clearNoteColors(); await applyPart(+$('partSel').value, false); rememberSongSoon(); });
$('moreBtn').onclick = () => { const r = document.querySelector('.rail'); r.classList.toggle('open'); $('moreBtn').textContent = r.classList.contains('open') ? '설정 접기 ▴' : '구간·메트로놈·설정 ▾'; };
$('noScoreBtn').onclick = () => { curSongId = null; curBuiltin = null; loadNoScore(); renderSongs(); };
$('songsBtn').onclick = () => openDrawer();
$('tabMine').onclick = () => { drawerTab = 'mine'; renderSongs(); }; $('tabBuiltin').onclick = () => { drawerTab = 'builtin'; renderSongs(); }; $('songClose').onclick = closeDrawer; $('songSearch').addEventListener('input', renderSongs);
$('songDrawer').addEventListener('click', (ev) => { if (ev.target === $('songDrawer')) closeDrawer(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDrawer(); });
$('sampleBtn').onclick = async () => { curSongId = null; curBuiltin = null; stopAll(false); $('report').hidden = true; lastSession=null; S.transpose = 0; $('transpose').value = 0; saveSettings(); await loadMusicXML(SAMPLE_XML, '샘플 에튀드'); };

/* ---------------- tuner UI ---------------- */
const G = { cx:130, cy:110, r:92 };
function gaugePoint(c, r){ const a = Math.PI*(1 - (clamp(c,-50,50)+50)/100); return [G.cx + r*Math.cos(a), G.cy - r*Math.sin(a)]; }
function drawGaugeTicks(){
  let s=''; for (let c=-50;c<=50;c+=10){ const [x1,y1]=gaugePoint(c,104), [x2,y2]=gaugePoint(c, c%50===0||c===0?88:95); s+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--ink-3)" stroke-width="${c===0?2:1}"/>`; }
  $('gTicks').innerHTML = s; drawGaugeTol();
}
function drawGaugeTol(){ document.documentElement.style.setProperty('--tol', (2*S.tolC) + '%'); const [x1,y1]=gaugePoint(-S.tolC,110), [x2,y2]=gaugePoint(S.tolC,110); $('gTol').setAttribute('d', `M${x1} ${y1} A110 110 0 0 1 ${x2} ${y2}`); }
let needleC = 0, lastTunerVoice = 0;
function updateTuner(fr, target){
  const now = performance.now();
  if (fr.f > 0) {
    const mf = 69 + 12*Math.log2(fr.f/S.a4);
    let ref = Math.round(mf);
    let cents = (mf - ref)*100;
    if (target != null) { // compare against score note (in sounding pitch)
      let d = mf - target; if (S.octFree) d -= 12*Math.round(d/12);
      if (Math.abs(d) < 0.6) { cents = d*100; ref = Math.round(mf - d); }
    }
    needleC = needleC*0.6 + cents*0.4; lastTunerVoice = now;
    const shown = ref - S.transpose; // show written name
    $('tNote').textContent = NAMES[((shown%12)+12)%12]; $('tOct').textContent = (Math.floor(shown/12)-1);
    $('tHz').textContent = fr.f.toFixed(1) + ' Hz';
    $('tCents').textContent = fmtSigned(Math.round(needleC)) + ' c';
    const col = Math.abs(needleC) <= S.tolC ? 'var(--good)' : (needleC>0 ? 'var(--sharp)' : 'var(--flat)');
    $('gNeedle').setAttribute('stroke', col); $('tCents').style.color = col;
  } else if (now - lastTunerVoice > 400) {
    $('tNote').textContent = '–'; $('tOct').textContent=''; $('tHz').textContent='– Hz'; $('tCents').textContent='±0 c'; $('tCents').style.color=''; $('gNeedle').setAttribute('stroke','var(--ink-3)');
    needleC *= 0.85;
  }
  { const mm = $('mmNeedle'); if (mm) { mm.style.left = (50 + clamp(needleC, -50, 50)) + '%'; mm.style.background = $('gNeedle').getAttribute('stroke'); } }
  const [x,y] = gaugePoint(needleC, 92); $('gNeedle').setAttribute('x2', x.toFixed(1)); $('gNeedle').setAttribute('y2', y.toFixed(1));
  const db = 20*Math.log10(Math.max(fr.r, 1e-5));
  $('tLevel').textContent = fr.r > S.gate ? `입력 ${db.toFixed(0)} dB` : '입력 작음';
  if (target != null) { const w = target - S.transpose; $('tTarget').innerHTML = `악보 음: <b>${midiName(w)}</b> <span style="color:var(--ink-3)">(${SOLFA[((w%12)+12)%12]})</span>`; }
  else if (mode==='score') $('tTarget').innerHTML = '악보 음: <b>–</b>';
}

/* ---------------- beat dots ---------------- */
function currentMeter(){
  if (mode === 'free') { const [n,d] = S.freeMeter.split('/').map(Number); return { tsN:n, tsD:d }; }
  if (score) { const m = score.measures[rangeIdx().a] || score.measures[0]; return { tsN:m.tsN, tsD:m.tsD }; }
  return { tsN:4, tsD:4 };
}
function buildBigBeats(n){ const big = $('bigBeats'); if (big) big.innerHTML = Array.from({length:Math.min(n,12)},(_, k)=>`<i>${k+1}</i>`).join(''); }
function buildBeatDots(n){ if (!n) { const cm = currentMeter(); n = (mode==='score' && score) ? beatsIn(cm) : cm.tsN; } $('beats').innerHTML = Array.from({length:Math.min(n,12)},()=>'<i></i>').join(''); buildBigBeats(n); }
function lightBeat(i, acc){ const big = $('bigBeats'); if (big) for (let k=0;k<big.children.length;k++){ big.children[k].classList.toggle('on', k===i); big.children[k].classList.toggle('acc', k===i && acc); }
  const dots = $('beats').children; for (let k=0;k<dots.length;k++){ dots[k].classList.toggle('on', k===i); dots[k].classList.toggle('acc', k===i && acc); } }

/* ---------------- practice session ---------------- */
let session = null, lastSession = null, schedTimer = null, tunerOnly = false;

function rangeIdx(){
  const ms = score.measures; const from = parseInt($('rangeFrom').value), to = parseInt($('rangeTo').value);
  let a = ms.findIndex(m => m.num >= (isFinite(from)?from:ms[0].num)); if (a<0) a=0;
  let b = isFinite(to) ? ms.length-1 - [...ms].reverse().findIndex(m => m.num <= to) : ms.length-1; if (b<a || b>=ms.length) b = ms.length-1;
  return { a, b };
}
/* compound meters (6/8, 9/8, 12/8) are felt and clicked in dotted quarters */
const isCompound = (m) => m.tsD === 8 && m.tsN % 3 === 0 && m.tsN > 3;
const beatOf = (m) => isCompound(m) ? 12/m.tsD : 4/m.tsD;          // quarter-note length of one felt beat
const beatsIn = (m) => isCompound(m) ? m.tsN/3 : m.tsN;
function buildClicks(sess){
  const clicks = [];
  const spq = 60/S.bpm;
  if (sess.mode === 'score') {
    const { a, b } = sess.range; const ms = score.measures;
    const first = ms[a]; const beatQ = beatOf(first), nB = beatsIn(first);
    const pickupOffset = (a===0 && first.lenQ < first.barQ - 1e-6) ? first.barQ - first.lenQ : 0;
    const ciStartQ = first.q - sess.countIn*first.barQ - pickupOffset;
    if (sess.countIn > 0) for (let q = ciStartQ; q < first.q - 1e-6; q += beatQ) {
      const k = Math.round(((q - ciStartQ) % first.barQ)/beatQ) % nB; clicks.push({ q, k, n:nB, kind: k===0 ? 'acc' : 'norm', ci:true });
    }
    for (let i=a; i<=b; i++){
      const m = ms[i]; const bq = beatOf(m), n = beatsIn(m); const off = (i===a ? pickupOffset : (i===0 && m.lenQ < m.barQ-1e-6 ? m.barQ-m.lenQ : 0));
      const startX = off > 0 ? (Math.ceil(off/bq - 1e-6)*bq - off) : 0;   // first felt beat inside a pickup bar
      for (let x=startX; x < m.lenQ - 1e-6; x += bq) { const k = Math.round((off + x)/bq) % n; clicks.push({ q: m.q + x, k, n, kind: k===0 ? 'acc' : 'norm' }); }
    }
    clicks.forEach(c => c.t = sess.t0 + (c.q - sess.startQ)*spq);
  }
  return clicks;
}
function addPracticeHotspots(){ addMeasureHotspots($('osmd'), demoFromMeasure, n => `세 번 누르면 ${n}마디부터 예시 듣기 · 재생 중 한 번 누르면 정지`, hotStop); }
function hotStop(){ if (session && session.demo) { stopAll(false); flash('예시를 멈췄어요.'); return true; } return false; }
async function demoFromMeasure(num){
  if (session && !session.demo) { flash('연습 중에는 마디를 눌러도 멈추지 않아요. 먼저 [정지]를 눌러 주세요.'); return; }
  $('rangeFrom').value = num;
  const to = parseInt($('rangeTo').value, 10); if (isFinite(to) && to < num) $('rangeTo').value = '';
  if (session && session.demo) stopAll(false);
  await startDemo({ noCountIn: true });
  flash(`${num}마디부터 예시를 들려줘요. 연습 구간도 ${num}마디부터로 바뀌었어요.`);
}

/* ---------------- tone synth (example playback / guide / note preview) ---------------- */
let toneNodes = [];
function synthTone(t, dur, midi, vol){
  if (vol <= 0) return;
  const f = S.a4*Math.pow(2, (midi-69)/12);
  const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f*2;
  const g2 = ctx.createGain(); g2.gain.value = 0.18;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, f*7); lp.Q.value = 0.5;
  const g = ctx.createGain(); const peak = 0.55*vol, t0 = Math.max(t, ctx.currentTime), rel = Math.min(0.08, dur*0.3);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.018);
  g.gain.exponentialRampToValueAtTime(peak*0.62, t0 + Math.min(0.25, dur*0.6));
  g.gain.setValueAtTime(peak*0.62, t0 + Math.max(0.02, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02);
  o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(master);
  o1.start(t0); o2.start(t0); o1.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
  toneNodes.push(o1, o2); o1.onended = () => { toneNodes = toneNodes.filter(n => n !== o1 && n !== o2); };
}
function silenceTones(){ for (const n of toneNodes) { try { n.stop(); } catch(e){} } toneNodes = []; }
async function previewNote(written, dur){ await ensureAudio(); startLoop(); await loadInstrument(S.toneInst); playTone(ctx.currentTime + 0.03, dur || 0.9, written + S.transpose, Math.max(0.25, S.toneVol)); }

/* ---------------- sampled instruments ---------------- */
let INST_DATA = null; const instCache = {}; const instLoading = {};
function instData(){ if (!INST_DATA) { try { INST_DATA = JSON.parse($('instData').textContent); } catch(e) { INST_DATA = {}; } } return INST_DATA; }
function b64ToBuf(b64){ const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u.buffer; }
async function loadInstrument(key){
  if (key === 'synth' || instCache[key]) return instCache[key] || null;
  const def = instData()[key]; if (!def) return null;
  if (!instLoading[key]) instLoading[key] = (async () => {
    await ensureAudio();
    const list = [];
    for (const [m, b64] of Object.entries(def.samples)) {
      try {
        const buf = await ctx.decodeAudioData(b64ToBuf(b64));
        // skip any decoder padding so the attack lands on the beat
        const d = buf.getChannelData(0); let peak = 0; for (let i=0;i<d.length;i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
        let i0 = 0; while (i0 < d.length && Math.abs(d[i0]) < peak*0.03) i0++;
        const off0 = Math.max(0, i0/buf.sampleRate - 0.003); const lp = def.sustain ? makeLoop(buf, off0) : null;
        list.push({ m: +m, buf: lp ? lp.buf : buf, off: off0, loop: lp, tune: (def.tune && def.tune[m]) || 0 });
      } catch(e) { console.warn('sample decode failed', key, m, e); }
    }
    list.sort((a,b)=>a.m-b.m);
    instCache[key] = { sustain: def.sustain, list };
    return instCache[key];
  })();
  return instLoading[key];
}
// seamless loop for long notes: flatten the sample's swell inside the loop region and crossfade the seam once, offline
function makeLoop(buf, off){
  try {
    const sr0 = buf.sampleRate, n = buf.length, dur = n/sr0, nc = buf.numberOfChannels;
    const ls = Math.max(off + 0.4, dur*0.36), le = dur - 0.36;
    if (le - ls < 0.6) return null;
    const s0 = Math.round(ls*sr0), e0 = Math.round(le*sr0), xn = Math.round(Math.min(0.3, (le-ls)*0.35)*sr0);
    const win = Math.round(0.08*sr0), hop = Math.round(0.01*sr0);
    const mix = new Float32Array(n); for (let c=0;c<nc;c++){ const d = buf.getChannelData(c); for (let i=0;i<n;i++) mix[i] += d[i]/nc; }
    const nh = Math.ceil(n/hop), env = new Float32Array(nh);
    for (let h=0;h<nh;h++){ const a = Math.max(0, h*hop - win), b = Math.min(n, h*hop + win); let s=0; for (let i=a;i<b;i++) s += mix[i]*mix[i]; env[h] = Math.sqrt(s/Math.max(1,b-a)) + 1e-6; }
    let tgt = 0, cnt = 0; for (let h=Math.floor((s0-xn)/hop); h<Math.floor(e0/hop); h++){ tgt += env[h]; cnt++; } tgt /= Math.max(1,cnt);
    const fadeIn = Math.round(0.15*sr0), fz = s0 - xn - fadeIn;
    const gainAt = (i) => { const h = Math.min(nh-1, Math.max(0, i/hop)); const h0 = Math.floor(h), f = h - h0; const e = env[h0]*(1-f) + env[Math.min(nh-1,h0+1)]*f;
      const g = Math.min(2.5, Math.max(0.4, tgt/e)); const w = i < fz ? 0 : i < fz + fadeIn ? (i - fz)/fadeIn : 1; return 1 + (g-1)*w; };
    const pad = Math.round(0.05*sr0), out = ctx.createBuffer(nc, e0 + pad, sr0);
    for (let c=0;c<nc;c++){
      const d = buf.getChannelData(c), o = out.getChannelData(c);
      const flat = (i) => d[i]*gainAt(i);
      for (let i=0;i<e0-xn;i++) o[i] = i < fz ? d[i] : flat(i);
      for (let k=0;k<xn;k++){ const a = k/xn; o[e0-xn+k] = flat(e0-xn+k)*Math.cos(a*Math.PI/2) + flat(s0-xn+k)*Math.sin(a*Math.PI/2); }
      for (let k=0;k<pad;k++) o[e0+k] = flat(s0+k);
    }
    return { buf: out, ls: s0/sr0, le: e0/sr0 };
  } catch(e) { console.warn('loop prep failed', e); return null; }
}
function playTone(t, dur, midi, vol){
  const I = instCache[S.toneInst];
  if (S.toneInst === 'synth' || !I || !I.list.length) { if (S.toneInst !== 'synth') loadInstrument(S.toneInst); return synthTone(t, dur, midi, vol); }
  let best = I.list[0]; for (const x of I.list) if (Math.abs(x.m - midi) < Math.abs(best.m - midi)) best = x;
  const rate = Math.pow(2, (midi - best.m - best.tune/100)/12) * (S.a4/440);   // tune = measured offset of the recording
  const XF = 0.18, REL = I.sustain ? 0.09 : 0.18, LOOP_OFF = 0.45;
  const peak = 0.9*vol;
  const bufOut = (best.buf.duration - best.off)/rate;               // playable output seconds of one pass
  let endT = t + dur; if (!I.sustain) endT = Math.min(endT, t + bufOut);
  if (I.sustain && best.loop) {   // one looping voice per note: no stacked segments, no level bumps
    const t0 = Math.max(t, ctx.currentTime), stopAt = Math.max(t0 + 0.01, endT);
    const src = ctx.createBufferSource(); src.buffer = best.buf; src.playbackRate.value = rate;
    src.loop = true; src.loopStart = best.loop.ls; src.loopEnd = best.loop.le;
    const g = ctx.createGain(); src.connect(g).connect(master);
    g.gain.setValueAtTime(peak, t0); g.gain.setValueAtTime(peak, stopAt); g.gain.exponentialRampToValueAtTime(0.0001, stopAt + REL);
    src.start(t0, best.off); src.stop(stopAt + REL + 0.03);
    toneNodes.push(src); src.onended = () => { toneNodes = toneNodes.filter(n => n !== src); };
    return;
  }
  let segStart = Math.max(t, ctx.currentTime), offset = best.off, first = true, guard = 0;
  while (guard++ < 40) {
    const avail = (best.buf.duration - offset)/rate - 0.32;           // leave room for the sample's own tail fade
    const segEnd = segStart + avail;
    const last = !I.sustain || segEnd >= endT;
    const src = ctx.createBufferSource(); src.buffer = best.buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); src.connect(g).connect(master);
    if (first) g.gain.setValueAtTime(peak, segStart);
    else { g.gain.setValueAtTime(0.0001, segStart); g.gain.linearRampToValueAtTime(peak, segStart + XF); }
    src.start(segStart, offset);
    toneNodes.push(src); src.onended = () => { toneNodes = toneNodes.filter(n => n !== src); };
    if (last) {
      const stopAt = Math.max(segStart + (first ? 0.01 : XF), Math.min(endT, I.sustain ? segEnd : endT));
      g.gain.setValueAtTime(peak, stopAt); g.gain.exponentialRampToValueAtTime(0.0001, stopAt + REL);
      src.stop(stopAt + REL + 0.03);
      break;
    }
    g.gain.setValueAtTime(peak, segEnd - XF); g.gain.linearRampToValueAtTime(0.0001, segEnd);
    src.stop(segEnd + 0.02);
    segStart = segEnd - XF; offset = best.off + LOOP_OFF; first = false;
  }
}
const INST_KEYWORDS = [
  ['viola',/viola|비올라|vla\b/i], ['violin',/violin|바이올린|vln/i], ['cello',/cello|violoncell|첼로|vc\b/i], ['contrabass',/contrabass|double bass|kontrabass|콘트라베이스|더블베이스/i],
  ['flute',/flute|piccolo|플루트|플룻|피콜로/i], ['clarinet',/clarinet|클라리넷/i], ['saxophone',/sax|색소폰/i], ['trumpet',/trumpet|cornet|flugel|트럼펫|코넷/i],
  ['french-horn',/horn|호른/i], ['trombone',/trombone|euphonium|트롬본|유포니움/i], ['tuba',/tuba|튜바/i], ['bassoon',/bassoon|fagott|바순/i],
  ['guitar-nylon',/guitar|기타/i], ['xylophone',/xylophone|marimba|glock|vibraphone|실로폰|마림바|글로켄/i], ['piano',/piano|피아노|keyboard/i]
];
function guessInstrument(){
  try { const ins = osmd.Sheet.Instruments[partIdx] || osmd.Sheet.Instruments[0]; const name = [ins.Name, ins.PartAbbreviation, ins.NameLabel && ins.NameLabel.text].filter(Boolean).join(' ');
    for (const [k, re] of INST_KEYWORDS) if (re.test(name)) return k; } catch(e) {}
  return null;
}
function setInstrument(key, preview){
  S.toneInst = key; $('toneInst').value = key; saveSettings(); updateStringBadge();
  loadInstrument(key).then(() => { if (preview) previewNote(69 - S.transpose + (key==='tuba'||key==='contrabass'||key==='bassoon'||key==='trombone'||key==='cello'? -24 : key==='french-horn'||key==='viola'?-12 : key==='xylophone'||key==='flute'? 12 : 0), 0.9); });
}
function startLoop(){ if (!loopOn) { loopOn = true; requestAnimationFrame(loop); } }

/* ---------------- session (practice or example playback) ---------------- */
async function startPractice(){ return startSession(false); }
async function startDemo(opts){ return startSession(true, opts); }
async function startSession(demo, opts){
  opts = opts || {};
  if (session) { const wasDemo = session.demo, wasFollow = session.follow; stopAll(!wasDemo); if (wasDemo === demo || wasFollow) return; }
  if (demo) { if (mode !== 'score' || !score) return; await ensureAudio(); startLoop(); }
  else if (!(await ensureMic())) {
    // no microphone (phone browser, claude.ai page, or permission refused): follow the score with metronome only
    if (mode === 'free') { await ensureAudio(); startLoop(); toggleMetro(true); flash('이 화면에서는 마이크를 쓸 수 없어서 음정·박자를 셀 수 없어요. 메트로놈만 켰어요. 음은 [기준음]으로 맞춰 보세요.'); return; }
    if (mode === 'score' && !score) return;
    await ensureAudio(); startLoop(); demo = true; opts.follow = true;
  }
  if ((demo && !opts.follow) || S.guide) { flash('악기 소리를 준비하고 있어요…'); await loadInstrument(S.toneInst); }
  if (!demo) setTuner(mode === 'free');   // practice turns the tuner on; score practice shows it in the analysis view
  if (!demo) { $('report').hidden = true; clearNoteColors(); }
  const spq = 60/S.bpm; const lead = 0.25;
  const sess = { mode, demo, follow: !!opts.follow, metro: !!opts.metro, bpm:S.bpm, a4:S.a4, transpose:S.transpose, latency:S.latency/1000, gate:S.gate, clickFilter:S.clickFilter,
    frames:[], onsets:[], title: scoreTitle, startedAt: Date.now(), running:true, clicks:[], tones:[] };
  if (mode === 'score') {
    if (!score) return;
    sess.range = rangeIdx();
    const first = score.measures[sess.range.a], last = score.measures[sess.range.b];
    sess.startQ = first.q; sess.endQ = last.q + last.lenQ;
    const pickupOffset = (sess.range.a===0 && first.lenQ < first.barQ-1e-6) ? first.barQ-first.lenQ : 0;
    // example playback has its own count-in setting (default: none); practice keeps the metronome setting
    sess.countIn = opts.noCountIn ? 0 : (demo && !opts.follow) ? (+S.demoCountIn || 0) : S.countIn;
    sess.t0 = ctx.currentTime + lead + (sess.countIn ? sess.countIn*first.barQ + pickupOffset : 0)*spq;
    sess.tEnd = sess.t0 + (sess.endQ - sess.startQ)*spq;
    sess.notes = score.notes.filter(n => n.m >= sess.range.a && n.m <= sess.range.b);
    sess.measures = score.measures.slice(sess.range.a, sess.range.b+1);
    sess.clicks = buildClicks(sess);
    if ((demo && !sess.follow) || S.guide) sess.tones = sess.notes.filter(n => !n.rest).map(n => ({ t: sess.t0 + (n.q - sess.startQ)*spq, dur: Math.max(0.06, n.durQ*spq*0.94 - 0.01), midi: n.written + sess.transpose }));
    buildBeatDots(beatsIn(first));
    osmd.cursor.show(); osmd.cursor.reset(); cursorIdx = 0; cursorTo(sess.startQ);
  } else if (!demo) {
    // personal / PDF practice: count pitch from the first note; rhythm is measured only while the metronome is on
    sess.t0 = ctx.currentTime; sess.metroSegs = metro.on && metro.cur ? [metro.cur] : []; sess.free = true;
  } else {
    const [n,d] = S.freeMeter.split('/').map(Number);
    sess.meter = { n, d }; sess.beatSec = spq*4/d; sess.grid = S.freeGrid;
    sess.countIn = noScore ? 0 : S.countIn;            // metronome only: start on the first beat
    sess.t0 = ctx.currentTime + (noScore ? 0.08 : lead) + sess.countIn*n*sess.beatSec;
    sess.clickStart = noScore ? sess.t0 : ctx.currentTime + lead; sess.nextClick = 0;
    buildBeatDots(n);
  }
  session = sess; liveProc = makeProcessor();
  if (!demo && curSongId && songStore) { const r = songs.find(x => x.id === curSongId); if (r) { r.count = (r.count || 0) + 1; songStore.update(r.id, { count: r.count, lastAt: nowIso() }).catch(() => {}); } rememberSongSoon(); }
  if (noScore && clockStart == null) clockStart = performance.now();
  // scheduler
  let ci = 0, ti = 0;
  const toneVol = demo ? S.toneVol : S.toneVol*0.6;
  schedTimer = setInterval(() => {
    const horizon = ctx.currentTime + 0.15;
    if (sess.mode === 'score') {
      while (ci < sess.clicks.length && sess.clicks[ci].t < horizon) { playClick(sess.clicks[ci].t, sess.clicks[ci].kind); ci++; }
      while (ti < sess.tones.length && sess.tones[ti].t < horizon) { const x = sess.tones[ti]; playTone(x.t, x.dur, x.midi, toneVol); ti++; }
    } else if (sess.demo) {
      while (true) {
        const k = sess.nextClick, t = sess.clickStart + k*sess.beatSec; if (t >= horizon) break;
        const b = k % sess.meter.n; const kind = b===0 ? 'acc' : (sess.meter.d===8 && b%3===0 ? 'mid':'norm');
        playClick(t, kind); sess.clicks.push({ t, k:b, n:sess.meter.n, kind, ci: t < sess.t0 - 1e-6 }); sess.nextClick++;
        const sd = +S.subdiv || 1; for (let j = 1; j < sd; j++) playClick(t + j*sess.beatSec/sd, 'sub');
      }
    }
  }, 25);
  if (sess.free) { $('playBtn').textContent = '연습 끝 · 결과 보기'; $('playBtn').classList.add('stop'); $('demoBtn').disabled = true; if ($('nsPractice')) { $('nsPractice').textContent = '■ 연습 끝 · 결과 보기'; $('nsPractice').classList.add('on'); }
    flash(metro.on ? '연습을 기록하고 있어요. 음정과 박자를 함께 세요.' : '연습을 기록하고 있어요. 지금은 음정만 세고, [메트로놈]을 켜면 박자도 함께 세요.'); }
  else if (sess.metro) { $('playBtn').textContent = '메트로놈 정지'; $('playBtn').classList.add('stop'); $('demoBtn').disabled = true; flash(tunerOnly ? '메트로놈과 튜너를 함께 쓰고 있어요.' : '메트로놈이 켜졌어요. 튜너도 같이 쓰려면 [튜너]를 누르세요.'); }
  else if (sess.follow) { $('playBtn').textContent = '정지'; $('playBtn').classList.add('stop'); $('demoBtn').disabled = true; flash(noScore ? '메트로놈이 돌아가요. 이 화면에서는 마이크를 쓸 수 없어서 튜너·분석 없이 진행해요. 음은 [기준음]으로 맞춰 보세요.' : '마이크를 쓸 수 없어서 메트로놈과 커서만 따라가요. 튜너와 음정·박자 분석은 PC의 크롬·엣지에서 파인튠 파일을 열면 쓸 수 있어요.'); }
  else if (demo) { $('demoBtn').textContent = '■ 예시 정지'; $('demoBtn').classList.add('active'); $('playBtn').disabled = true; flash('예시 연주 중이에요. 커서와 튜너 창의 음 이름을 함께 보며 들어 보세요.'); }
  else { $('playBtn').textContent = '정지'; $('playBtn').classList.add('stop'); $('demoBtn').disabled = true;
    if (S.guide) flash('가이드 음이 함께 나와요. 스피커로 들으면 가이드 음까지 분석되니 이어폰을 쓰세요.'); }
  $('liveNotes').textContent = '0'; $('liveIn').textContent = '–'; if ($('liveRh')) $('liveRh').textContent = '–'; setLiveNs('0', '–', '–');
  sess.liveSeg = { cur:null, count:0, inTol:0, judged:0, rJudged:0, rIn:0, pend:[], seen:0, byNote:new Map() };
  renderLiveNotes(null);
}
function stopAll(analyze){
  if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  silenceTones();
  $('countdown').hidden = true;
  $('playBtn').textContent = '연습 시작'; $('playBtn').classList.remove('stop'); $('playBtn').disabled = false;
  if ($('nsPractice')) { $('nsPractice').textContent = '● 연습 시작'; $('nsPractice').classList.remove('on'); }
  updateMetroUI();
  $('demoBtn').textContent = '▶ 예시 듣기'; $('demoBtn').classList.remove('active'); $('demoBtn').disabled = mode !== 'score';
  lightBeat(-1);
  if (clockStart && !metro.on) { addTodaySec((performance.now() - clockStart)/1000); clockStart = null; updatePracticeClock(); }
  if (session && session.free && ctx) session.metroSegs.forEach(g => { if (g.end === Infinity) g.endAtStop = ctx.currentTime; });
  if (session) {
    const s = session; session = null; s.running = false; s.stoppedAt = ctx ? ctx.currentTime : 0;
    $('posText').textContent = '대기 중';
    if (s.demo) { resetDemoTuner(); if (s.follow) { if (s.finished) flash('끝까지 따라왔어요. 템포를 바꿔 다시 해 보세요.'); return; } if (s.finished) flash('예시를 다 들었어요. 이제 [연습 시작]을 눌러 같은 템포로 따라 해 보세요. 어려우면 템포를 낮춰 다시 들어도 좋아요.'); return; }
    if (analyze) {
      const voicedFrames = s.frames.filter(f=>f.f>0).length;
      if (voicedFrames < 8) { flash('연주 소리가 거의 감지되지 않았어요. 마이크 감도를 높이거나 악기를 마이크 가까이에서 연주해 보세요.', true); return; }
      lastSession = s; analyzeAndReport(s, true);
    }
  }
}
$('playBtn').onclick = startPractice;
$('demoBtn').onclick = startDemo;
$('againBtn').onclick = () => { $('scoreScroll').scrollIntoView({behavior:'smooth', block:'start'}); startPractice(); };
function setTuner(on){
  tunerOnly = on;
  $('tunerBtn').textContent = on ? '튜너 끄기' : '튜너 켜기'; $('tunerBtn').classList.toggle('on', on);
  if ($('nsTuner')) { $('nsTuner').textContent = on ? '■ 튜너 끄기' : '♪ 튜너 켜기'; $('nsTuner').classList.toggle('on', on); }
  if (!on && !(session && !session.demo)) { needleC = 0; updateTuner({ f: 0, r: 0 }, null); }
}
async function toggleTuner(){
  if (session && !session.demo) { flash('연습 분석 중에는 튜너가 이미 켜져 있어요.'); return; }
  if (tunerOnly) { setTuner(false); return; }
  if (await ensureMic()) { setTuner(true); flash(session && session.metro ? '메트로놈과 튜너를 함께 쓰고 있어요.' : '튜너가 켜졌어요. 메트로놈도 같이 쓰려면 [메트로놈]을 누르세요.'); }
}
$('tunerBtn').onclick = toggleTuner;
$('metroBtn').onclick = () => toggleMetro();

/* during example playback the tuner card shows the note being played */
let demoShown = null;
function showDemoNote(n){
  if (n === demoShown) return; demoShown = n;
  if (!n) { $('tNote').textContent = '–'; $('tOct').textContent = ''; $('tHz').textContent = '– Hz'; return; }
  const w = n.written, snd = w + session.transpose;
  $('tNote').textContent = NAMES[((w%12)+12)%12]; $('tOct').textContent = Math.floor(w/12)-1;
  $('tTarget').innerHTML = `예시 음: <b>${midiName(w)}</b> <span style="color:var(--ink-3)">(${SOLFA[((w%12)+12)%12]}) · ${DUR_LABEL(n.baseDur || n.durQ)}</span>`;
  $('tHz').textContent = (S.a4*Math.pow(2,(snd-69)/12)).toFixed(1) + ' Hz';
  $('tCents').textContent = '예시'; $('tCents').style.color = 'var(--accent)';
  $('gNeedle').setAttribute('stroke','var(--accent)'); const [x,y] = gaugePoint(0, 92); $('gNeedle').setAttribute('x2', x); $('gNeedle').setAttribute('y2', y);
}
function resetDemoTuner(){ const mm = $('mmNeedle'); if (mm) { mm.style.left = '50%'; mm.style.background = ''; } demoShown = undefined; showDemoNote(null); $('tCents').textContent = '±0 c'; $('tCents').style.color = ''; $('gNeedle').setAttribute('stroke','var(--ink-3)'); $('tTarget').innerHTML = '악보 음: <b>–</b>'; }

/* ---------------- independent metronome (free / personal practice) ---------------- */
const metro = { on:false, timer:null, cur:null, clicks:[], k:0 };
function metroStart(){
  const [n, d] = S.freeMeter.split('/').map(Number);
  const beatSec = 60/S.bpm*4/d;
  const seg = { t0: ctx.currentTime + 0.06, beatSec, n, d, grid: S.freeGrid, end: Infinity };
  metro.cur = seg; metro.k = 0; metro.clicks = []; metro.on = true;
  if (session && !session.demo && session.mode === 'free') session.metroSegs.push(seg);
  buildBeatDots(n);
  metro.timer = setInterval(() => {
    const horizon = ctx.currentTime + 0.15;
    while (true) {
      const t = seg.t0 + metro.k*beatSec; if (t >= horizon) break;
      const b = metro.k % n; const kind = b===0 ? 'acc' : (d===8 && b%3===0 ? 'mid' : 'norm');
      playClick(t, kind); const c = { t, k:b, n, kind }; metro.clicks.push(c); if (metro.clicks.length > 64) metro.clicks.shift();
      if (session && !session.demo && session.mode === 'free') session.clicks.push(c);
      const sd = +S.subdiv || 1; for (let j = 1; j < sd; j++) playClick(t + j*beatSec/sd, 'sub');
      metro.k++;
    }
  }, 25);
}
function metroStop(){
  if (!metro.on) return;
  clearInterval(metro.timer); metro.timer = null; metro.on = false;
  if (metro.cur) metro.cur.end = ctx.currentTime;
  metro.clicks = []; lightBeat(-1);
}
async function toggleMetro(force){
  const want = typeof force === 'boolean' ? force : !metro.on;
  if (want === metro.on) return;
  if (want) { await ensureAudio(); startLoop(); metroStart(); } else metroStop();
  if (noScore && clockStart == null && metro.on) clockStart = performance.now();
  if (noScore && !metro.on && !(session && !session.demo) && clockStart) { addTodaySec((performance.now() - clockStart)/1000); clockStart = null; }
  updateMetroUI();
}
function metroRestartIfOn(){ if (metro.on) { metroStop(); metroStart(); } }   // tempo or meter changed while running
function updateMetroUI(){
  if ($('nsStart')) { $('nsStart').textContent = metro.on ? '■ 메트로놈 끄기' : '▶ 메트로놈 켜기'; $('nsStart').classList.toggle('on', metro.on); }
  if ($('metroBtn')) { $('metroBtn').textContent = metro.on ? '메트로놈 끄기' : '메트로놈 켜기'; $('metroBtn').classList.toggle('on', metro.on); }
  if (!metro.on && $('nsBar') && !(session && !session.demo)) $('nsBar').textContent = '메트로놈 꺼짐';
}

/* ---------------- main loop ---------------- */
function loop(){
  requestAnimationFrame(loop);
  if (!ctx) return;
  const tEnd = ctx.currentTime;
  const outLat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  const s = session;
  let fr = null;
  if (analyser) { analyser.getFloatTimeDomainData(buf); fr = liveProc(buf, tEnd, sr, S.gate, (s && !s.demo) ? s : null); }
  let target = null;
  const tA = tEnd - outLat;
  if (metro.on && !(s && (s.mode === 'score' || s.demo))) {
    let lc = null; for (let i = metro.clicks.length-1; i >= 0; i--) { if (metro.clicks[i].t <= tA) { lc = metro.clicks[i]; break; } }
    if (lc && tA - lc.t < 0.16) lightBeat(lc.k, lc.kind === 'acc'); else lightBeat(-1);
    const g = metro.cur; if (g && tA >= g.t0) { const bars = Math.floor((tA - g.t0)/(g.beatSec*g.n)) + 1; $('posText').textContent = `${bars}마디째`; if ($('nsBar')) $('nsBar').textContent = `메트로놈 ${bars}마디째`; }
  }
  if (s && s.free) {
    const sec = Math.floor(tA - s.t0); if (!metro.on) $('posText').textContent = `연습 중 ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
    if (fr) liveStats(s, fr, null);
    liveRhythm(s, tEnd);
  }
  if (s && !s.free) {
    const tAud = tEnd - outLat; // what the player hears now
    // beat lights
    let lastClick = null; for (let i=s.clicks.length-1;i>=0;i--){ if (s.clicks[i].t <= tAud){ lastClick=s.clicks[i]; break; } }
    if (lastClick && tAud - lastClick.t < 0.16) lightBeat(lastClick.k, lastClick.kind==='acc'); else lightBeat(-1);
    // countdown
    if (tAud < s.t0) {
      const beatsLeft = s.clicks.filter(c => c.t > tAud && c.t < s.t0 - 1e-6).length + 1;
      $('countdown').hidden = false; $('countdown').textContent = beatsLeft; $('posText').textContent = '예비박';
    } else $('countdown').hidden = true;
    if (s.mode === 'score') {
      const q = s.startQ + (tAud - s.t0)*S.bpm/60;
      if (tAud >= s.t0) cursorTo(q);
      const cur = s.notes.find(n => !n.rest && q >= n.q - 0.05 && q < n.q + n.durQ);
      if (cur) target = cur.written + s.transpose;
      const m = s.measures.find(m => q >= m.q && q < m.q + m.lenQ);
      if (m && tAud >= s.t0) $('posText').textContent = (s.demo ? '예시 · ' : '') + `${m.num}마디`;
      if (s.demo && !tunerOnly) showDemoNote(tAud >= s.t0 ? cur : null);
      if (tAud > s.tEnd + 0.5) { s.finished = true; stopAll(!s.demo); return; }
    } else if (tAud >= s.t0) {
      const bars = Math.floor((tAud - s.t0)/(s.beatSec*s.meter.n)) + 1; $('posText').textContent = `${bars}마디째`; if ($('nsBar')) $('nsBar').textContent = `${bars}마디째`;
    }
    if (fr && !s.demo) liveStats(s, fr, target);
  }
  if (fr && ((s && !s.demo) || tunerOnly)) updateTuner(fr, (s && !s.demo) ? target : null);
}
/* Only a held, steady pitch counts as a note. Slides (trombone slide, glissando, scoops) move through
   many in-between pitches; they never stay inside a narrow band long enough, so they are skipped. */
const STEADY_RANGE = 0.45;          // semitones a held note may wander (vibrato included)
const STRING_INSTS = ['violin','viola','cello','contrabass'];
const isStringMode = () => S.stringMode === 'on' || (S.stringMode !== 'off' && STRING_INSTS.includes(S.toneInst));
const steadyMin = () => S.glideFilter || isStringMode() ? 0.18 : 0.07;   // seconds a pitch must hold before it is judged
/* string mode: vibrato swings the pitch up and down 5–7 times a second. A box average over ~0.2 s
   (about one vibrato cycle) cancels the swing and leaves the centre, while a slide keeps moving the average. */
function smoothPitch(vf, half){
  const out = new Array(vf.length); let a = 0, b = -1, sum = 0;
  for (let i = 0; i < vf.length; i++) {
    while (b + 1 < vf.length && vf[b+1].t <= vf[i].t + half) { b++; sum += vf[b].mf; }
    while (vf[a].t < vf[i].t - half) { sum -= vf[a].mf; a++; }
    out[i] = sum / (b - a + 1);
  }
  return out;
}
function stableStretch(vf, minDur){
  const str = isStringMode();
  const v = str ? smoothPitch(vf, 0.1) : vf.map(f => f.mf), range = str ? 0.3 : STEADY_RANGE;
  let best = null;
  for (let i = 0; i < vf.length; i++) {
    let lo = v[i], hi = v[i], rlo = vf[i].mf, rhi = vf[i].mf, j = i;
    while (j + 1 < vf.length && vf[j+1].t - vf[j].t < 0.07) {
      const m = v[j+1]; const nlo = Math.min(lo, m), nhi = Math.max(hi, m);
      if (nhi - nlo > range) break;
      if (str) { const r = vf[j+1].mf; if (Math.max(rhi, r) - Math.min(rlo, r) > 1.6) break; rlo = Math.min(rlo, r); rhi = Math.max(rhi, r); }
      lo = nlo; hi = nhi; j++;
    }
    const dur = vf[j].t - vf[i].t;
    if (!best || dur > best.dur) best = { i, j, dur };
    if (j === vf.length - 1) break;
  }
  if (!best || best.dur < minDur) return null;
  const part = vf.slice(best.i, best.j + 1), med = median(part.map(f => f.mf));
  const res = { frames: part, med, i: best.i, j: best.j };
  if (str) {   // vibrato width (peak, cents) and drift of the centre (cents) are reported separately
    const sm = v.slice(best.i, best.j + 1);
    res.vib = Math.round(Math.SQRT2 * 100 * Math.sqrt(mean(part.map((f, k) => (f.mf - sm[k])**2))));
    res.drift = 100 * Math.sqrt(mean(sm.map(x => (x - med)**2)));
  }
  return res;
}
/* string detail for one note: where the finger first landed, where it ended, how long finding the pitch took,
   and whether the note was slid into. vf = voiced frames from the note's start. */
function stringDetail(vf, ref, gliss){
  if (vf.length < 5) return null;
  const st = stableStretch(vf, Math.min(0.12, 0.5*(vf[vf.length-1].t - vf[0].t))); if (!st) return null;
  const fold = (x) => { let d = x - ref; if (S.octFree) d -= 12*Math.round(d/12); return d*100; };
  const sf = st.frames, tEnd = sf[sf.length-1].t, tS = sf[0].t;
  // with vibrato, follow the centre of the swing (0.18 s box) instead of the raw pitch
  const vibr = st.vib >= 12, light = smoothPitch(vf, vibr ? 0.09 : 0.03);
  const val = (i) => vibr ? light[i] : vf[i].mf;
  const fin = median(vf.map((f, i) => i).filter(i => i >= st.i && i <= st.j && vf[i].t >= tEnd - Math.max(0.1, 0.4*(tEnd - tS))).map(val));
  // landing = first moment the finger stops moving (pitch stays within 25c for 60 ms)
  let li = st.i;
  for (let i = 0; i < st.i + 1; i++) {
    let lo = light[i], hi = light[i], j = i;
    while (j + 1 < vf.length && vf[j+1].t - vf[i].t <= 0.06) { j++; lo = Math.min(lo, light[j]); hi = Math.max(hi, light[j]); }
    if (vf[j].t - vf[i].t >= 0.05 && hi - lo < (vibr ? 0.15 : 0.25)) { li = i; break; }
  }
  const landAt = (k) => median(vf.map((f, i) => i).filter(i => vf[i].t >= vf[k].t && vf[i].t <= vf[k].t + 0.1).map(val));
  let land = landAt(li);
  if (Math.abs(land - fin) > 0.6) { li = st.i; land = landAt(li); }
  const band = Math.max(10, S.tolC/2)/100;
  let found = null;
  for (let i = 0; i < vf.length && found == null; i++) {
    if (Math.abs(light[i] - fin) > band) continue;
    let j = i; while (j + 1 < vf.length && Math.abs(light[j+1] - fin) <= band) j++;
    if (vf[j].t - vf[i].t >= 0.08) found = vf[i].t;
  }
  const scoop = !gliss && vf[li].t - vf[0].t > 0.05 && Math.abs(light[0] - land) > 0.5;
  return { land: fold(land), fin: fold(fin), findMs: found == null ? null : Math.round(1000*(found - vf[0].t)), scoop, gliss: !!gliss, vib: st.vib, drift: st.drift };
}
function liveStats(s, fr, target){
  const L = s.liveSeg;
  if (fr.f > 0) {
    const mf = 69 + 12*Math.log2(fr.f/s.a4);
    if (!L.run) L.run = { fr: [], lo: mf, hi: mf, judged: false };
    let R = L.run;
    const str = isStringMode();
    // string mode: judge the 0.2 s running average so vibrato does not split the note
    if (!L.hist || (L.hist.length && fr.t - L.hist[L.hist.length-1].t > 0.08)) L.hist = [];
    L.hist.push({ t: fr.t, mf }); while (L.hist.length && L.hist[0].t < fr.t - 0.2) L.hist.shift();
    const v = str ? mean(L.hist.map(h => h.mf)) : mf;
    const lo = Math.min(R.lo, v), hi = Math.max(R.hi, v);
    if (hi - lo > (str ? 0.3 : STEADY_RANGE) || (R.fr.length && fr.t - R.fr[R.fr.length-1].t > 0.08)) {
      R = L.run = { fr: [], lo: v, hi: v, judged: false };     // pitch moved: a new (possibly sliding) stretch begins
    } else { R.lo = lo; R.hi = hi; }
    R.fr.push({ t: fr.t, mf });
    const dur = R.fr[R.fr.length-1].t - R.fr[0].t;
    if (!R.judged && dur >= steadyMin()) {
      R.judged = true;
      const vals = R.fr.filter(f => f.t >= R.fr[0].t + 0.03).map(f => f.mf);
      const med = median(vals.length ? vals : R.fr.map(f => f.mf)); const r = Math.round(med);
      L.count++; let d = med - (target != null ? target : r);
      if (S.octFree) d -= 12*Math.round(d/12);
      L.judged++; if (Math.abs(d*100) <= S.tolC) L.inTol++;
      if (s.free) { const key = target != null ? target : r; if (!L.byNote) L.byNote = new Map(); const e = L.byNote.get(key) || { n:0, sum:0, ok:0, ln:0, lsum:0 }; e.n++; e.sum += d*100; if (Math.abs(d*100) <= S.tolC) e.ok++;
        if (str) { const lf = R.fr.filter(f => f.t <= R.fr[0].t + 0.1).map(f => f.mf); let ld = median(lf) - key; if (S.octFree) ld -= 12*Math.round(ld/12); if (Math.abs(ld) < 0.6) { e.ln++; e.lsum += ld*100; } }
        L.byNote.set(key, e); renderLiveNotes(L); }
      $('liveNotes').textContent = L.count; $('liveIn').textContent = Math.round(100*L.inTol/L.judged) + '%';
      setLiveNs(L.count, Math.round(100*L.inTol/L.judged) + '%', null);
    }
  } else if (fr.r < S.gate) L.run = null;
}

function updateStringBadge(){ const on = isStringMode(); document.body.classList.toggle('strmode', on); const b = $('strBadge'); if (b) { b.hidden = !on; } }
function syncVol(){ const v = S.vol; if ($('vol')) $('vol').value = Math.min(+$('vol').max, v); if ($('nsVol')) $('nsVol').value = v; if ($('nsVolT')) $('nsVolT').textContent = Math.round(v*100) + '%'; }
/* live intonation per note name: every judged note adds its cents to that pitch's row */
function renderLiveNotes(L){
  const box = $('nsNotes'); if (!box) return;
  const rows = L && L.byNote ? [...L.byNote.entries()].sort((a, b) => b[0] - a[0]) : [];
  if (!rows.length) { box.innerHTML = '<div class="nn-empty">연습을 시작하면 음별 음정이 여기에 쌓여요. (오른쪽 = 높음, 왼쪽 = 낮음)</div>'; return; }
  const str = isStringMode();
  box.innerHTML = `<div class="nn-head"><span>음</span><span>평균 음정</span><span>정확${str ? ' · 첫 착지' : ''}</span></div>` + rows.map(([m, v]) => {
    const avg = v.sum / v.n, pct = Math.round(100*v.ok/v.n), c = clamp(avg, -50, 50);
    const col = Math.abs(avg) <= S.tolC ? '#1e8a4c' : avg > 0 ? '#d0603a' : '#3a74c9';
    const w = m - S.transpose;
    return `<div class="nn-row"><span class="nn-n">${midiName(w)} <small>${SOLFA[((w%12)+12)%12]}</small></span>
      <span class="nn-bar"><i class="nn-tol" style="left:${50 - S.tolC/2}%;width:${S.tolC}%"></i><i class="nn-mid"></i><i class="nn-v" style="left:${Math.min(50, 50 + c/2)}%;width:${Math.max(1, Math.abs(c)/2)}%;background:${col}"></i></span>
      <span class="nn-p">${fmtSigned(Math.round(avg))}c · ${pct}% <small>(${v.n})</small>${str && v.ln ? `<br><small class="nn-land">처음 ${fmtSigned(Math.round(v.lsum/v.ln))}c</small>` : ''}</span></div>`;
  }).join('');
}
function setLiveNs(n, p, r){ if (!$('nsLive')) return; if (n != null) $('nsLiveN').textContent = n; if (p != null) $('nsLiveP').textContent = p; if (r != null) $('nsLiveR').textContent = r; }
/* live rhythm counter: each new attack is compared with the metronome grid once we know it starts a real note */
function liveRhythm(s, now){
  const L = s.liveSeg;
  while (L.seen < s.onsets.length) { L.pend.push(s.onsets[L.seen]); L.seen++; }
  const lat = s.latency;
  while (L.pend.length && now - L.pend[0].t > 0.2) {
    const o = L.pend.shift();
    const voiced = s.frames.filter(f => f.t >= o.t && f.t <= o.t + 0.18 && f.f > 0).length;
    if (voiced < 3) continue;
    const t = o.t - lat;
    const g = s.metroSegs.find(g => t >= g.t0 - g.beatSec/2 && t <= (g.end === Infinity ? Infinity : g.end + g.beatSec/2));
    if (!g) continue;
    const sub = g.beatSec / g.grid; const k = Math.round((t - g.t0)/sub); const err = (t - (g.t0 + k*sub))*1000;
    if (Math.abs(err) > sub*1000*0.45) continue;
    L.rJudged++; if (Math.abs(err) <= S.tolMs) L.rIn++;
    const pct = Math.round(100*L.rIn/L.rJudged) + '%';
    if ($('liveRh')) $('liveRh').textContent = pct; setLiveNs(null, null, pct);
  }
}

/* ---------------- analysis ---------------- */
function detectOnsets(s){
  const lat = s.latency;
  const fr = s.frames.map(f => ({ t: f.t - lat, f: f.f, r: f.r, mf: f.f>0 ? 69+12*Math.log2(f.f/s.a4) : null }));
  const voicedAt = (t0, t1) => fr.filter(f => f.t >= t0 && f.t <= t1 && f.mf != null).length;
  const clickArr = s.clicks.map(c => c.t);
  const nearClick = (t) => { for (const c of clickArr) if (Math.abs(c - t) < 0.03) return true; return false; };
  const cand = [];
  for (const o of s.onsets) {
    const t = o.t - lat;
    if (voicedAt(t, t + 0.18) < 3) continue;                       // must be followed by a pitched note
    if (s.clickFilter && o.prevVoiced && nearClick(t) && o.strength < 4) continue; // click bleed during a held note
    cand.push({ t, src:'e' });
  }
  // pitch-based onsets: start of voiced run, or change of stable note
  let prevStable = null, runStart = null, runR = null, runLen = 0, silent = 99;
  for (let i=0;i<fr.length;i++){
    const f = fr[i];
    if (f.mf == null) { silent++; if (silent >= 3) { prevStable = null; } runLen = 0; runR = null; continue; }
    const r = Math.round(f.mf);
    if (r !== runR) { runR = r; runStart = f.t; runLen = 1; } else runLen++;
    if (runLen === 3 && r !== prevStable) {
      cand.push({ t: runStart - 0.012, src: prevStable == null ? 's' : 'p' });
      prevStable = r;
    } else if (runLen >= 3) prevStable = r;
    silent = 0;
  }
  cand.sort((a,b)=>a.t-b.t);
  const out = [];
  for (const c of cand) {
    const last = out[out.length-1];
    if (last && c.t - last.t < 0.07) { if (c.src === 'e' && last.src !== 'e') { last.t = Math.min(last.t, c.t); last.src='e'; } else last.t = Math.min(last.t, c.t); continue; }
    out.push({ ...c });
  }
  return { frames: fr, onsets: out };
}

const DUR_LABEL = (q) => {
  const T = [[4,'온음표'],[3,'점2분음표'],[2,'2분음표'],[1.5,'점4분음표'],[1,'4분음표'],[0.75,'점8분음표'],[0.5,'8분음표'],[0.375,'점16분음표'],[0.25,'16분음표'],[0.125,'32분음표'],[2/3,'셋잇단 4분'],[1/3,'셋잇단 8분'],[1/6,'셋잇단 16분']];
  for (const [v,l] of T) if (Math.abs(q - v) < 0.01) return l;
  return q > 1 ? '긴 음표' : '기타 짧은 음표';
};

function analyzeScore(s){
  const { frames, onsets } = detectOnsets(s);
  const spq = 60/s.bpm; const tolC = S.tolC, tolMs = S.tolMs;
  const stopT = (s.stoppedAt || Infinity) - s.latency;
  const used = new Set();
  const results = [];
  const seq = s.notes;
  for (let k=0;k<seq.length;k++){
    const e = seq[k]; if (e.rest) continue;
    const ts = s.t0 + (e.q - s.startQ)*spq, durS = e.durQ*spq, te = ts + durS;
    if (ts > stopT - 0.05) break;
    const m = score.measures[e.m];
    const target = e.written + s.transpose;
    // pitch window
    let a = ts + Math.min(0.08, 0.3*durS), b = te - Math.min(0.04, 0.15*durS);
    if (b - a < 0.03) { a = ts + 0.2*durS; b = te - 0.05*durS; }
    const vf = frames.filter(f => f.t >= a && f.t <= b && f.mf != null);
    const res = { e, ts, durS, measure: m.num, written: e.written, cents: null, wrong: false, missed: false, played: null, err: null, wobble: null };
    if (vf.length < 2) { res.missed = true; }
    else {
      const st = S.glideFilter ? stableStretch(vf, Math.min(0.12, 0.5*(b - a))) : null;
      const use = st ? st.frames : vf;
      const med = st ? st.med : median(vf.map(f=>f.mf));
      let d = med - target; if (S.octFree) d -= 12*Math.round(d/12);
      if (Math.abs(d) > 0.6) { res.wrong = true; res.played = Math.round(med) - s.transpose; }
      else { res.cents = d*100; const dev = use.map(f => { let x = f.mf - target; if (S.octFree) x -= 12*Math.round(x/12); return (x*100 - res.cents); }); res.wobble = Math.sqrt(mean(dev.map(x=>x*x)));
        if (isStringMode()) { const sd = stringDetail(frames.filter(f => f.t >= ts - 0.04 && f.t <= b && f.mf != null), target, e.gliss); if (sd) { res.str = sd; res.wobble = sd.drift; } } }
    }
    // timing
    const W = clamp(0.5*durS, 0.07, 0.3);
    let best = null, bd = Infinity;
    for (let i=0;i<onsets.length;i++){
      if (used.has(i)) continue; const o = onsets[i];
      if (o.t < ts - W) continue; if (o.t > ts + W || o.t > te) break;
      const dd = Math.abs(o.t - ts); if (dd < bd) { bd = dd; best = i; }
    }
    if (best != null) { used.add(best); res.err = (onsets[best].t - ts)*1000; }
    // context tags
    const beatQ = beatOf(m);
    const pickup = (e.m===0 && m.lenQ < m.barQ - 1e-6) ? m.barQ - m.lenQ : 0;
    const posInBar = e.q - m.q + pickup;
    const frac = (posInBar/beatQ) % 1;
    const onBeat = frac < 0.02 || frac > 0.98;
    const tags = [];
    tags.push(posInBar < 0.01 ? '첫 박(강박)' : onBeat ? '정박' : '엇박');
    const prev = seq[k-1];
    if (prev && prev.rest) tags.push('쉼표 다음');
    if (!onBeat) { const nextBeat = (Math.floor(posInBar/beatQ)+1)*beatQ; if (posInBar + e.durQ > nextBeat + 1e-6) tags.push('당김음'); }
    if (prev && !prev.rest && [0.75,1.5,3,0.375].some(v => Math.abs(prev.durQ - v) < 0.01) && e.durQ < prev.durQ) tags.push('점음표 다음 짧은 음');
    if (e.tuplet) tags.push('셋잇단');
    if (e.tied) tags.push('붙임줄');
    res.durLabel = DUR_LABEL(e.baseDur || e.durQ);
    res.tags = tags;
    res.pitchOk = !res.missed && !res.wrong && Math.abs(res.cents) <= tolC;
    res.timeOk = res.err != null && Math.abs(res.err) <= tolMs;
    res.verdict = (res.missed || res.wrong) ? 'bad' : (res.pitchOk && (res.err == null || res.timeOk)) ? 'good' : 'warn';
    results.push(res);
  }
  return results;
}

function analyzeFree(s){
  const { frames, onsets } = detectOnsets(s);
  const tolC = S.tolC, tolMs = S.tolMs;
  const segs = (s.metroSegs || (s.beatSec ? [{ t0: s.t0, beatSec: s.beatSec, n: s.meter.n, grid: s.grid, end: Infinity }] : []));
  let barBase = 0; segs.forEach(g => { g.barBase = barBase; const end = g.end === Infinity ? (g.endAtStop || s.stoppedAt || g.t0) : g.end; barBase += Math.max(1, Math.ceil((end - g.t0)/(g.beatSec*g.n))); });
  const results = []; let slideFrom = null;
  for (let i=0;i<onsets.length;i++){
    const t = onsets[i].t; if (t < s.t0 - 0.05) continue;
    const tn = i+1 < onsets.length ? onsets[i+1].t : t + 1.0;
    const vf0 = frames.filter(f => f.t >= t + 0.03 && f.t <= Math.min(tn - 0.02, t + 2.5) && f.mf != null);
    if (vf0.length < 3) continue;
    const st = stableStretch(vf0, steadyMin());
    if (!st) { slideFrom = t; continue; }               // only a slide / passing pitch: not a note
    const slid = slideFrom != null && t - slideFrom < 0.6 && isStringMode(); const t1 = slid ? slideFrom : t; slideFrom = null;
    const vf = st.frames, med = st.med; const r = Math.round(med);
    const cents = (med - r)*100;
    let wob = Math.sqrt(mean(vf.map(f => ((f.mf - med)*100)**2)));
    const sd = isStringMode() ? stringDetail(frames.filter(f => f.t >= t1 - 0.02 && f.t <= Math.min(tn - 0.02, t + 2.5) && f.mf != null), r, false) : null;
    if (sd) wob = sd.drift;
    let err = null, measure = null, tags = ['메트로놈 없이']; const ta = t1;   // a slid-into note starts when the bow starts
    const g = segs.find(g => { const end = g.end === Infinity ? (g.endAtStop || Infinity) : g.end; return ta >= g.t0 - g.beatSec/2 && ta <= end + g.beatSec/2; });
    if (g) {
      const sub = g.grid, subSec = g.beatSec/sub;
      const k = Math.round((ta - g.t0)/subSec); const e = (ta - (g.t0 + k*subSec))*1000;
      if (Math.abs(e) <= subSec*1000*0.45) {
        err = e; const pos = ((k % sub) + sub) % sub; const beatInBar = ((Math.floor(k/sub) % g.n) + g.n) % g.n;
        let tag;
        if (pos === 0) tag = beatInBar === 0 ? '첫 박(강박)' : '정박';
        else if (sub === 2) tag = '8분 뒷박';
        else if (sub === 3) tag = pos === 1 ? '셋잇단 2번째' : '셋잇단 3번째';
        else tag = pos === 2 ? '8분 뒷박' : pos === 1 ? '16분 2번째' : '16분 4번째';
        tags = [tag]; measure = g.barBase + Math.floor(k/(sub*g.n)) + 1;
      }
    }
    const res = { ts:ta, measure, written: r - s.transpose, cents, wrong:false, missed:false, err, wobble: wob, str: sd,
      tags, durLabel:null, pitchOk: Math.abs(cents) <= tolC, timeOk: err != null && Math.abs(err) <= tolMs };
    res.verdict = res.pitchOk && (err == null || res.timeOk) ? 'good' : 'warn';
    results.push(res);
  }
  return results;
}

/* ---------------- report ---------------- */
function groupBy(arr, keyFn){ const m = new Map(); for (const x of arr){ const ks = [].concat(keyFn(x)); for (const k of ks){ if (k==null) continue; if(!m.has(k)) m.set(k, []); m.get(k).push(x); } } return m; }

function analyzeAndReport(s, fresh){
  const R = s.mode === 'score' ? analyzeScore(s) : analyzeFree(s);
  s.results = R;
  if (!R.length) { flash('분석할 음을 찾지 못했어요. 예비박이 끝난 뒤 연주를 시작했는지 확인해 주세요.', true); return; }
  const isScore = s.mode === 'score';
  const total = R.length;
  const pitchOk = R.filter(r=>r.pitchOk).length;
  const timed = R.filter(r=>r.err != null || r.missed);
  const timeOk = R.filter(r=>r.timeOk).length;
  const pitchAcc = Math.round(100*pitchOk/total);
  const rhythmAcc = timed.length ? Math.round(100*timeOk/timed.length) : null;
  const centsAll = R.filter(r=>r.cents != null).map(r=>r.cents);
  const errAll = R.filter(r=>r.err != null).map(r=>r.err);
  const meanC = mean(centsAll), meanE = mean(errAll);
  const missed = R.filter(r=>r.missed).length, wrong = R.filter(r=>r.wrong).length;

  $('report').hidden = false;
  const dt = new Date(s.startedAt);
  $('repSub').textContent = `${s.title} · ♩=${s.bpm} · ${dt.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}` + (isScore ? ` · ${s.measures[0].num}–${s.measures[s.measures.length-1].num}마디` : ' · 자유 연습');

  const tile = (k, v, d, col) => `<div class="tile"><div class="k">${k}</div><div class="v" ${col?`style="color:${col}"`:''}>${v}</div><div class="d">${d}</div></div>`;
  const accCol = (v) => v == null ? '' : v >= 85 ? 'var(--good)' : v >= 65 ? 'var(--warn)' : 'var(--bad)';
  $('tiles').innerHTML =
    tile('음정 정확도', pitchAcc + '%', `±${S.tolC}c 안에 든 음 ${pitchOk}/${total}`, accCol(pitchAcc)) +
    tile('박자 정확도', rhythmAcc == null ? '–' : rhythmAcc + '%', `±${S.tolMs}ms 안에 시작 ${timeOk}/${timed.length}`, accCol(rhythmAcc)) +
    tile('음정 경향', isFinite(meanC) ? fmtSigned(meanC) + 'c' : '–', !isFinite(meanC) ? '' : Math.abs(meanC) < 5 ? '대체로 중심에 맞음' : meanC > 0 ? '전체적으로 높은 편' : '전체적으로 낮은 편') +
    tile('박자 경향', isFinite(meanE) ? fmtSigned(meanE) + 'ms' : '–', !isFinite(meanE) ? '' : Math.abs(meanE) < 12 ? '앞뒤로 고르게 맞음' : meanE < 0 ? '서두르는 편 (빨리 들어감)' : '끄는 편 (늦게 들어감)');

  // string mode summary
  const SR = R.filter(r => r.str && r.cents != null); let strLand = null, strFixed = 0;
  if ($('strTiles')) {
    $('strTiles').hidden = !SR.length;
    if (SR.length) {
      const landOk = SR.filter(r => Math.abs(r.str.land) <= S.tolC).length, landAcc = Math.round(100*landOk/SR.length);
      const fm = SR.filter(r => r.str.findMs != null).map(r => r.str.findMs), findAvg = fm.length ? Math.round(mean(fm)) : null;
      const scoops = SR.filter(r => r.str.scoop).length, fixed = SR.filter(r => Math.abs(r.str.land - r.str.fin) > Math.max(8, S.tolC/2) + (r.str.vib >= 12 ? 6 : 0)).length;
      strLand = landAcc; strFixed = fixed;
      const vibs = SR.map(r => r.str.vib).filter(v => v >= 12), vibAvg = vibs.length ? Math.round(mean(vibs)) : null;
      $('strTiles').innerHTML =
        tile('첫 착지 정확도', landAcc + '%', `처음 짚은 자리가 ±${S.tolC}c 안 ${landOk}/${SR.length}`, accCol(landAcc)) +
        tile('음 찾는 시간', findAvg == null ? '–' : findAvg + 'ms', findAvg == null ? '' : findAvg <= 80 ? '바로 제자리를 짚음' : findAvg <= 200 ? '조금 찾아 들어감' : '음을 찾는 데 오래 걸림') +
        tile('짚은 뒤 고친 음', fixed + '개', `끌어서 들어간 음 ${scoops}개`) +
        tile('비브라토', vibAvg == null ? '없음' : '±' + vibAvg + 'c', vibAvg == null ? '비브라토 없이 연주' : `${vibs.length}개 음 · 중심음으로 판정`);
    }
  }
  // pitch chart by written note
  const byNote = groupBy(R.filter(r=>r.cents != null), r => r.written);
  const rowsP = [...byNote.entries()].map(([w, arr]) => { const sa = arr.filter(r => r.str); return { w, c: mean(arr.map(r=>r.cents)), n: arr.length, wob: mean(arr.map(r=>r.wobble||0)),
    land: sa.length ? mean(sa.map(r => r.str.land)) : null, find: sa.filter(r => r.str.findMs != null).length ? mean(sa.filter(r => r.str.findMs != null).map(r => r.str.findMs)) : null, sn: sa.length }; }).sort((a,b)=>b.w-a.w);
  const sc = (c) => 50 + clamp(c,-50,50); // percent
  $('pitchChart').innerHTML = rowsP.map(p => {
    const left = Math.min(sc(0), sc(p.c)), width = Math.abs(sc(p.c) - sc(0));
    const col = Math.abs(p.c) <= S.tolC ? 'var(--neutral)' : p.c > 0 ? 'var(--sharp)' : 'var(--flat)';
    return `<div class="dv-row" data-tip="${esc(`${midiName(p.w)} (${SOLFA[((p.w%12)+12)%12]}) · ${p.n}회<br>평균 ${fmtSigned(p.c,1)}c · 흔들림 ±${p.wob.toFixed(0)}c${p.land != null ? `<br>첫 착지 평균 ${fmtSigned(p.land,1)}c${p.find != null ? ` · 음 찾기 ${Math.round(p.find)}ms` : ''}` : ''}`)}">
      <span class="lab">${midiName(p.w)}</span>
      <div class="dv-track"><div class="tol" style="left:${sc(-S.tolC)}%;width:${2*S.tolC}%"></div><div class="zero"></div><div class="bar" style="left:${left}%;width:${Math.max(width,0.8)}%;background:${col}"></div></div>
      <span class="val">${fmtSigned(p.c)}c · ${p.n}회</span></div>`;
  }).join('') || '<p class="msg">음정을 판정할 음이 없었어요.</p>';

  // rhythm chart
  const rh = R.filter(r => r.err != null);
  const mkRows = (m) => [...m.entries()].map(([k, arr]) => ({ k, abs: mean(arr.map(r=>Math.abs(r.err))), sg: mean(arr.map(r=>r.err)), n: arr.length, ok: arr.filter(r=>r.timeOk).length })).sort((a,b)=>b.abs-a.abs);
  const groupsHTML = (title, rows) => {
    if (!rows.length) return '';
    const maxV = Math.max(S.tolMs*1.6, ...rows.map(r=>r.abs));
    return `<div class="subhead">${title}</div>` + rows.map(r => {
      const tend = Math.abs(r.sg) < 10 ? '고름' : r.sg < 0 ? `서두름 ${Math.round(-r.sg)}` : `끌림 ${Math.round(r.sg)}`;
      return `<div class="hb-row" data-tip="${esc(`${r.k} · ${r.n}개<br>평균 오차 ${r.abs.toFixed(0)}ms · 허용 범위 안 ${r.ok}/${r.n}<br>경향 ${fmtSigned(r.sg)}ms (−는 빨리, +는 늦게)`)}">
        <span class="lab">${esc(r.k)}</span>
        <div class="hb-track"><div class="bar ${r.abs > S.tolMs ? 'over':''}" style="width:${(100*r.abs/maxV).toFixed(1)}%"></div><div class="tolmark" style="left:${(100*S.tolMs/maxV).toFixed(1)}%"></div></div>
        <span class="val">${r.abs.toFixed(0)}ms · ${tend}</span></div>`;
    }).join('');
  };
  const rowsDur = isScore ? mkRows(groupBy(rh, r=>r.durLabel)) : [];
  const rowsCtx = mkRows(groupBy(rh, r=>r.tags));
  $('rhythmChart').innerHTML = (groupsHTML(isScore ? '음표 길이별' : '', rowsDur) + groupsHTML(isScore ? '위치 · 패턴별' : '박 안의 위치별', rowsCtx)) || '<p class="msg">박자를 판정할 음이 없었어요.</p>';

  // measures
  const byM = groupBy(R, r => r.measure);
  const mlist = isScore ? s.measures.map(m => m.num) : [...byM.keys()].sort((a,b)=>a-b);
  $('measurePanel').hidden = !mlist.length;
  const mScores = mlist.map(num => { const arr = byM.get(num) || []; const v = arr.length ? mean(arr.map(r => r.verdict==='good'?1:r.verdict==='warn'?0.5:0)) : null; return { num, v, n: arr.length, arr }; });
  const seqCol = (v) => v == null ? null : v >= 0.9 ? 'var(--seq-4)' : v >= 0.75 ? 'var(--seq-3)' : v >= 0.55 ? 'var(--seq-2)' : 'var(--seq-1)';
  $('measures').innerHTML = mScores.map(m => m.v == null ? `<div class="m na" data-tip="${m.num}마디 · 연주한 음 없음"><b>${m.num}</b></div>` :
    `<div class="m" style="background:${seqCol(m.v)};color:${m.v>=0.75?'var(--surface)':'var(--ink)'}" data-tip="${esc(`${m.num}마디 · ${Math.round(m.v*100)}점<br>음 ${m.n}개 · 정확 ${m.arr.filter(r=>r.verdict==='good').length} · 주의 ${m.arr.filter(r=>r.verdict==='warn').length} · 틀림/놓침 ${m.arr.filter(r=>r.verdict==='bad').length}`)}"><b>${m.num}</b>${Math.round(m.v*100)}</div>`).join('');

  // coaching
  const tips = [];
  if (pitchAcc >= 90 && (rhythmAcc == null || rhythmAcc >= 90) && (strLand == null || strLand >= 80)) tips.push(['ok','좋아요', `음정 ${pitchAcc}%, 박자 ${rhythmAcc ?? '–'}%. 템포를 ${Math.round(s.bpm*1.08)}까지 올려 다시 해 보세요.`]);
  const badNotes = rowsP.filter(p => p.n >= 2 && Math.abs(p.c) > S.tolC*0.6).sort((a,b)=>Math.abs(b.c)-Math.abs(a.c)).slice(0,3);
  if (badNotes.length) tips.push(['pitch','음정', badNotes.map(p => `<b>${midiName(p.w)}</b> ${p.c>0?'높음':'낮음'} ${fmtSigned(p.c)}c`).join(', ') + ' — 이 음들을 튜너를 보며 길게 소리 내 중심을 다시 잡아 보세요.']);
  const wobbly = rowsP.filter(p => p.n >= 2 && p.wob > 18).sort((a,b)=>b.wob-a.wob).slice(0,2);
  if (wobbly.length) tips.push(['pitch','음정', wobbly.map(p => `<b>${midiName(p.w)}</b>`).join(', ') + ` 은(는) 한 음 안에서 ${SR.length ? '중심음이 움직여요' : '흔들림이 커요'} (±${Math.round(wobbly[0].wob)}c). ${SR.length ? '활 속도와 압력을 고르게 유지해 보세요.' : '비브라토를 뺀 롱톤으로 확인해 보세요.'}`]);
  if (SR.length) {
    const badLand = rowsP.filter(p => p.sn >= 2 && p.land != null && Math.abs(p.land) > S.tolC && Math.abs(p.land) > Math.abs(p.c) + 5).sort((a,b)=>Math.abs(b.land)-Math.abs(a.land)).slice(0,3);
    if (badLand.length) tips.push(['pitch','손가락 자리', badLand.map(p => `<b>${midiName(p.w)}</b> 처음 ${fmtSigned(p.land)}c → 최종 ${fmtSigned(p.c)}c`).join(', ') + ' — 귀로 고치기 전에 처음 짚는 자리가 어긋나 있어요. 이 음만 천천히 짚었다 떼기를 반복하며 손가락 자리를 익혀 보세요.']);
    const slowFind = rowsP.filter(p => p.sn >= 2 && p.find != null && p.find > 200).sort((a,b)=>b.find-a.find).slice(0,3);
    if (slowFind.length) tips.push(['pitch','음 찾기', slowFind.map(p => `<b>${midiName(p.w)}</b> ${Math.round(p.find)}ms`).join(', ') + ' — 제자리를 찾는 데 시간이 걸려요. 앞 음에서 이 음으로 넘어가는 손가락 이동만 따로 연습해 보세요.']);
    if (!badLand.length && strLand != null && strLand < 80) tips.push(['pitch','손가락 자리', `최종 음정은 맞췄지만, 처음 짚은 자리가 범위를 벗어난 음이 ${SR.length - Math.round(strLand*SR.length/100)}개예요 (짚은 뒤 귀로 고친 음 ${strFixed}개). 표의 '첫 착지' 열에서 어느 음인지 확인하고, 그 음만 천천히 짚었다 떼기를 반복해 보세요.`]);
    const sc = SR.filter(r => r.str.scoop).length;
    if (sc >= 2) tips.push(['pitch','끌어서 들어감', `${sc}개 음을 아래·위에서 끌어 올리거나 내리며 들어갔어요. 손가락을 미리 자리에 두고, 활과 동시에 정확히 내려놓아 보세요. (악보에 글리산도 표시가 있는 음은 빼고 셉니다)`]);
  }
  if (wrong) { const wl = groupBy(R.filter(r=>r.wrong), r => `${midiName(r.written)}→${midiName(r.played)}`); const top = [...wl.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,3); tips.push(['pitch','틀린 음', `${wrong}개. ` + top.map(([k,a]) => `${k}${a.length>1?` (${a.length}회)`:''}`).join(', ') + ' (악보 음 → 연주한 음)']); }
  const worstR = [...rowsDur, ...rowsCtx].filter(r => r.n >= 2 && r.abs > S.tolMs*0.8).sort((a,b)=>b.abs-a.abs).slice(0,2);
  for (const r of worstR) tips.push(['rhythm','리듬', `<b>${esc(r.k)}</b>에서 평균 ${Math.round(r.abs)}ms 어긋남${Math.abs(r.sg)>=10 ? (r.sg<0?', 주로 서두름':', 주로 늦음'):''}. 이 리듬만 템포 ${Math.round(s.bpm*0.8)}로 낮춰 반복해 보세요.`]);
  const weakM = mScores.filter(m => m.v != null && m.v < 0.7).sort((a,b)=>a.v-b.v).slice(0,3);
  if (weakM.length && isScore) tips.push(['measure','마디', `${weakM.map(m=>m.num+'마디').join(', ')}의 정확도가 가장 낮아요. 연습 구간을 <b>${Math.min(...weakM.map(m=>m.num))}~${Math.max(...weakM.map(m=>m.num))}마디</b>로 좁혀 반복해 보세요.`]);
  if (missed) tips.push(['measure','놓친 음', `${missed}개 음에서 소리가 감지되지 않았어요. 쉬었거나 소리가 작았을 수 있어요.`]);
  if (!tips.length) tips.push(['ok','안정적', '눈에 띄는 약점이 없어요. 허용 범위를 좁혀(설정) 더 정밀하게 확인해 보세요.']);
  $('coach').innerHTML = tips.map(([cls,tag,txt]) => `<li><span class="tag ${cls}">${tag}</span><span>${txt}</span></li>`).join('');

  // note table
  const vtxt = { good:'정확', warn:'주의', bad:'틀림/놓침' };
  $('noteTable').innerHTML = `<thead><tr><th>#</th><th>마디</th><th>음</th>${isScore?'<th>음표</th>':''}<th>위치</th><th style="text-align:right">음정(c)</th>${SR.length?'<th style="text-align:right">첫 착지(c)</th><th style="text-align:right">음 찾기(ms)</th>':''}<th style="text-align:right">타이밍(ms)</th><th>판정</th></tr></thead><tbody>` +
    R.map((r,i) => `<tr><td class="n">${i+1}</td><td class="n">${r.measure ?? '–'}</td><td>${midiName(r.written)}${r.wrong?` → ${midiName(r.played)}`:''}</td>${isScore?`<td>${r.durLabel}</td>`:''}<td>${r.tags.join(', ')}</td>
      <td class="n">${r.cents!=null?fmtSigned(r.cents):r.missed?'소리 없음':'–'}</td>${SR.length?`<td class="n">${r.str?fmtSigned(r.str.land)+(r.str.scoop?' ↗':r.str.gliss?' (글리산도)':''):'–'}</td><td class="n">${r.str&&r.str.findMs!=null?r.str.findMs:'–'}</td>`:''}<td class="n">${r.err!=null?fmtSigned(r.err):'–'}</td><td><span class="verdict ${r.verdict}">${vtxt[r.verdict]}</span></td></tr>`).join('') + '</tbody>';

  if (isScore) colorNotes(R);
  if (fresh) {
    saveHistory({ at: s.startedAt, title: s.title, mode: s.mode, bpm: s.bpm, pitch: pitchAcc, rhythm: rhythmAcc, n: total, range: isScore ? `${s.measures[0].num}–${s.measures[s.measures.length-1].num}` : '' });
    $('report').scrollIntoView({ behavior:'smooth', block:'start' });
  }
}

/* color noteheads on the score */
let coloredEls = [];
function clearNoteColors(){ for (const el of coloredEls) { el.querySelectorAll('path,rect,ellipse').forEach(p => { p.style.fill=''; p.style.stroke=''; }); } coloredEls = []; noteResults = new Map(); $('noteLegend').hidden = true; }
let noteResults = new Map();
/* every note on the score is clickable: plays its pitch, and shows analysis if there is one */
function attachNoteHandlers(){
  if (!score) return;
  const bySrc = new Map(); for (const e of score.notes) if (!e.rest) for (const n of e.src) bySrc.set(n, e);
  try {
    for (const row of osmd.GraphicSheet.MeasureList) for (const gm of row) { if (!gm) continue;
      for (const gse of gm.staffEntries) for (const gve of gse.graphicalVoiceEntries) for (const gn of gve.notes) {
        const e = bySrc.get(gn.sourceNote); if (!e) continue;
        const el = gn.getSVGGElement ? gn.getSVGGElement() : null; if (!el) continue;
        el.style.cursor = 'pointer';
        el.onclick = (ev) => {
          ev.stopPropagation();
          if (!session) previewNote(e.written, Math.min(1.2, Math.max(0.35, e.durQ*60/S.bpm)));
          const r = noteResults.get(e);
          showTip(r ? noteTip(r) : `<b>${midiName(e.written)}</b> (${SOLFA[((e.written%12)+12)%12]}) · ${DUR_LABEL(e.baseDur || e.durQ)}`, ev.clientX, ev.clientY, r ? 3500 : 1600);
        };
      }
    }
  } catch(err) { console.warn('note handlers failed', err); }
}
function colorNotes(R){
  clearNoteColors();
  const bySrc = new Map(); for (const r of R) for (const n of r.e.src) bySrc.set(n, r);
  const COL = { good:'#1e8a4c', warn:'#b86e00', bad:'#c8323c' };
  try {
    for (const row of osmd.GraphicSheet.MeasureList) for (const gm of row) { if (!gm) continue;
      for (const gse of gm.staffEntries) for (const gve of gse.graphicalVoiceEntries) for (const gn of gve.notes) {
        const r = bySrc.get(gn.sourceNote); if (!r) continue;
        const el = gn.getSVGGElement ? gn.getSVGGElement() : null; if (!el) continue;
        el.querySelectorAll('path,rect,ellipse').forEach(p => { p.style.fill = COL[r.verdict]; p.style.stroke = COL[r.verdict]; });
        noteResults.set(r.e, r);
        coloredEls.push(el);
      }
    }
    $('noteLegend').hidden = false;
  } catch(e) { console.warn('note coloring failed', e); }
}
function noteTip(r){
  const p = r.missed ? '소리 감지 안 됨' : r.wrong ? `틀린 음: ${midiName(r.played)} 연주` : `음정 ${fmtSigned(r.cents)}c ${Math.abs(r.cents)<=S.tolC?'(범위 안)':r.cents>0?'(높음)':'(낮음)'}`;
  const t = r.err == null ? '시작 시점 감지 안 됨' : `타이밍 ${fmtSigned(r.err)}ms ${Math.abs(r.err)<=S.tolMs?'(범위 안)':r.err<0?'(빠름)':'(늦음)'}`;
  const sx = r.str ? `<br>첫 착지 ${fmtSigned(r.str.land)}c → 최종 ${fmtSigned(r.str.fin)}c${r.str.findMs != null ? ` · 음 찾기 ${r.str.findMs}ms` : ''}${r.str.scoop ? '<br>끌어서 들어감' : ''}${r.str.vib >= 12 ? `<br>비브라토 ±${r.str.vib}c` : ''}` : '';
  return `<b>${r.measure}마디 · ${midiName(r.written)}</b> ${r.durLabel||''}<br>${p}${sx}<br>${t}`;
}


/* ---------- click a measure to hear the example from there ---------- */
const hotTap = { num: null, n: 0, t: 0 };
function addMeasureHotspots(container, onPick, label, onStop){
  const svg = container.querySelector('svg'); if (!svg) return;
  svg.querySelectorAll('rect.mhot').forEach(r => r.remove());
  const NS = 'http://www.w3.org/2000/svg';
  const groups = [...svg.querySelectorAll('g.vf-measure')];
  for (const g of groups) {
    let bb; try { bb = g.getBBox(); } catch(e) { continue; }
    if (!bb || !bb.width) continue;
    const num = parseInt(g.id, 10); if (!isFinite(num)) continue;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', bb.x); r.setAttribute('y', bb.y - 22); r.setAttribute('width', bb.width); r.setAttribute('height', bb.height + 44);
    r.setAttribute('class', 'mhot'); r.setAttribute('rx', 4);
    const t = document.createElementNS(NS, 'title'); t.textContent = label(num); r.appendChild(t);
    svg.insertBefore(r, svg.firstChild);
    const on = () => r.classList.add('hov'), off = () => r.classList.remove('hov');
    const pick = (ev) => {
      if (ev.target.closest && ev.target.closest('.vf-stavenote')) return; ev.stopPropagation();
      const now = Date.now();
      if (hotTap.num === num && now - hotTap.t < 600) hotTap.n++; else hotTap.n = 1;   // three quick taps on the same measure
      hotTap.num = num; hotTap.t = now;
      r.classList.add('tap' + Math.min(hotTap.n, 2)); setTimeout(() => r.classList.remove('tap1', 'tap2'), 600);
      if (hotTap.n === 1 && onStop && onStop()) return;   // one tap while playing stops it (two more taps jump here)
      if (hotTap.n >= 3) { hotTap.n = 0; onPick(num); }
    };
    for (const el of [r, g]) { el.addEventListener('mouseenter', on); el.addEventListener('mouseleave', off); el.addEventListener('click', pick); el.style.cursor = 'pointer'; }
  }
}

/* tooltip */
let tipTimer = null;
function showTip(html, x, y, ms){ const t = $('tip'); t.innerHTML = html; t.hidden = false; const w = t.offsetWidth, h = t.offsetHeight; t.style.left = clamp(x + 12, 8, innerWidth - w - 8) + 'px'; t.style.top = clamp(y + 12, 8, innerHeight - h - 8) + 'px'; clearTimeout(tipTimer); if (ms) tipTimer = setTimeout(()=>t.hidden=true, ms); }
document.addEventListener('mousemove', (ev) => { const el = ev.target.closest && ev.target.closest('[data-tip]'); if (el) showTip(el.getAttribute('data-tip'), ev.clientX, ev.clientY); else if (!tipTimer || $('tip').dataset.sticky!=='1') { if (!ev.target.closest('#osmd')) $('tip').hidden = true; } });
document.addEventListener('click', (ev) => { if (!ev.target.closest('#osmd')) $('tip').hidden = true; });

function flash(text, err){ const m = $('sideMsg'); m.textContent = text; m.classList.toggle('err', !!err); }

/* ---------------- history ---------------- */
function loadHistory(){ try { return JSON.parse(localStorage.getItem(LS_HIST) || '[]'); } catch(e) { return []; } }
function saveHistory(item){ const h = loadHistory(); h.push(item); while (h.length > 200) h.shift(); try { localStorage.setItem(LS_HIST, JSON.stringify(h)); } catch(e) {} renderHistory(item.title); }
function renderHistory(selectTitle){
  const all = loadHistory();
  const titles = [...new Set(all.map(h=>h.title))];
  const sel = $('histFilter'); const cur = selectTitle !== undefined ? selectTitle : sel.value;
  sel.innerHTML = '<option value="">모든 곡</option>' + titles.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  sel.value = titles.includes(cur) ? cur : '';
  const list = all.filter(h => !sel.value || h.title === sel.value);
  const svg = $('histChart');
  if (!list.length) { svg.innerHTML = `<text x="400" y="95" text-anchor="middle" font-size="14" fill="var(--ink-3)">연습을 마치면 여기에 음정·박자 정확도 추이가 쌓입니다.</text>`; $('hlist').innerHTML=''; return; }
  const pts = list.slice(-30);
  const W=800,H=180,L=40,Rr=16,T=14,B=26; const iw=W-L-Rr, ih=H-T-B;
  const x = (i) => L + (pts.length===1 ? iw/2 : i*iw/(pts.length-1)); const y = (v) => T + ih*(1 - v/100);
  let g = '';
  for (const v of [0,50,100]) g += `<line x1="${L}" x2="${W-Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${v}%</text>`;
  const line = (key, col) => { const p = pts.map((h,i) => h[key]==null?null:[x(i), y(h[key])]).filter(Boolean); if (!p.length) return ''; return `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" points="${p.map(q=>q.join(',')).join(' ')}"/>` + p.map((q,i)=> `<circle cx="${q[0]}" cy="${q[1]}" r="${i===p.length-1?4.5:3}" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`).join(''); };
  g += line('pitch','var(--accent)') + line('rhythm','var(--sharp)');
  // hover targets
  pts.forEach((h,i) => { const d = new Date(h.at); g += `<rect x="${x(i)-Math.max(6, iw/pts.length/2)}" y="${T}" width="${Math.max(12, iw/pts.length)}" height="${ih}" fill="transparent" data-tip="${esc(`${d.toLocaleDateString('ko-KR')} ${d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}<br>${h.title}${h.range?` (${h.range}마디)`:''} · ♩=${h.bpm}<br>음정 ${h.pitch}% · 박자 ${h.rhythm ?? '–'}%`)}"/>`; });
  const lastP = pts[pts.length-1];
  const pUp = lastP.rhythm == null || lastP.pitch >= lastP.rhythm;
  const lab = (v, up) => `<text x="${x(pts.length-1)-8}" y="${up ? y(v)-9 : y(v)+18}" text-anchor="end" font-size="11.5" font-weight="600" fill="var(--ink)">${v}%</text>`;
  g += lab(lastP.pitch, pUp);
  if (lastP.rhythm != null) g += lab(lastP.rhythm, !pUp);
  g += `<text x="${L}" y="${H-6}" font-size="11" fill="var(--ink-3)">최근 ${pts.length}회</text>`;
  svg.innerHTML = g;
  $('hlist').innerHTML = `<div class="hitem head"><span>날짜</span><span>곡 · 구간</span><span>음정</span><span>박자</span><span class="bpmc">템포</span></div>` +
    list.slice(-8).reverse().map(h => { const d=new Date(h.at); return `<div class="hitem"><span class="num">${d.toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'})} ${d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}</span><span class="t">${esc(h.title)}${h.range?` · ${h.range}마디`:h.mode==='free'?' · 자유':''}</span><span class="num">${h.pitch}%</span><span class="num">${h.rhythm ?? '–'}${h.rhythm!=null?'%':''}</span><span class="num bpmc">${h.bpm}</span></div>`; }).join('');
}
$('histFilter').onchange = () => renderHistory();
let clearArmed = false;
$('histClear').onclick = () => { if (!clearArmed) { clearArmed = true; $('histClear').textContent = '한 번 더 누르면 삭제'; setTimeout(()=>{clearArmed=false; $('histClear').textContent='기록 지우기';}, 3000); return; } try { localStorage.removeItem(LS_HIST); } catch(e) {} clearArmed=false; $('histClear').textContent='기록 지우기'; renderHistory(''); };

/* ---------------- latency calibration ---------------- */
$('calBtn').onclick = async () => {
  if (session) return;
  if (!(await ensureMic())) return;
  const msg = $('calMsg'); const bpm = 100, n = 10, spb = 60/bpm;
  const t0 = ctx.currentTime + 0.4; const clicks = [];
  for (let i=0;i<n;i++){ const t = t0 + i*spb; clicks.push(t); playClick(t, i%4===0?'acc':'norm'); }
  const rec = { frames:[], onsets:[] }; const proc = makeProcessor();
  msg.textContent = '측정 중… (약 6초)'; $('calBtn').disabled = true;
  const prevVol = S.vol; if (S.vol < 0.5) S.vol = 0.8;
  await new Promise(res => { const step = () => { if (ctx.currentTime > t0 + n*spb + 0.4) return res(); analyser.getFloatTimeDomainData(buf); proc(buf, ctx.currentTime, sr, Math.min(S.gate, 0.004), rec); requestAnimationFrame(step); }; step(); });
  S.vol = prevVol; $('calBtn').disabled = false;
  const diffs = [];
  for (const c of clicks.slice(1)) { const o = rec.onsets.find(o => o.t >= c - 0.02 && o.t <= c + 0.35); if (o) diffs.push(o.t - c); }
  if (diffs.length < 4) { msg.textContent = '클릭 소리를 충분히 듣지 못했어요. 볼륨을 올리거나, 이어폰이면 손뼉을 쳐 주세요.'; msg.classList.add('err'); return; }
  const lat = Math.round(median(diffs)*1000);
  S.latency = lat; saveSettings(); updateLatChip(); msg.classList.remove('err');
  msg.textContent = `보정 완료: ${lat}ms (${diffs.length}회 측정)`;
};

/* ---------------- sample score (original etude) ---------------- */
function buildSampleXML(){
  const div = 12;
  const DUR = { w:[48,'whole'], h:[24,'half'], q:[12,'quarter'], e:[6,'eighth'], s:[3,'16th'] };
  const bars = [
    'G4:q B4:q D5:q B4:q',
    'C5:e B4:e A4:e G4:e A4:h',
    'B4:q. C5:e D5:q r:q',
    'E5:s D5:s C5:s B4:s A4:q F#4:q G4:q',
    'B4:e D5:q C5:e~ C5:q A4:q',
    'G4:e3 A4:e3 B4:e3 C5:e3 D5:e3 E5:e3 D5:h',
    'E5:q C5:q A4:q. B4:e',
    'G4:h. r:q'
  ];
  let trip = 0, xml = '';
  bars.forEach((bar, bi) => {
    xml += `<measure number="${bi+1}">`;
    if (bi === 0) xml += `<attributes><divisions>${div}</divisions><key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>80</per-minute></metronome></direction-type><sound tempo="80"/></direction>`;
    const toks = bar.split(' ');
    toks.forEach((tok, ti) => {
      let [p, d] = tok.split(':'); const tieStart = d.endsWith('~'); d = d.replace('~','');
      const dotted = d.includes('.'), triplet = d.includes('3'); const base = d[0];
      let [len, type] = DUR[base]; if (dotted) len *= 1.5; if (triplet) len = len*2/3;
      const prevTie = ti>0 && toks[ti-1].endsWith('~');
      xml += '<note>';
      if (p === 'r') xml += '<rest/>';
      else { const m = p.match(/^([A-G])(#|b)?(\d)$/); xml += `<pitch><step>${m[1]}</step>${m[2]?`<alter>${m[2]==='#'?1:-1}</alter>`:''}<octave>${m[3]}</octave></pitch>`; }
      xml += `<duration>${len}</duration>`;
      if (tieStart) xml += '<tie type="start"/>'; if (prevTie) xml += '<tie type="stop"/>';
      xml += `<voice>1</voice><type>${type}</type>${dotted?'<dot/>':''}`;
      if (triplet) xml += '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
      let nota = '';
      if (tieStart) nota += '<tied type="start"/>'; if (prevTie) nota += '<tied type="stop"/>';
      if (triplet) { if (trip%3===0) nota += '<tuplet type="start" bracket="yes"/>'; if (trip%3===2) nota += '<tuplet type="stop"/>'; trip++; }
      if (nota) xml += `<notations>${nota}</notations>`;
      xml += '</note>';
    });
    if (bi === bars.length-1) xml += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    xml += '</measure>';
  });
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>샘플 에튀드 (G장조)</work-title></work><identification><creator type="composer">연습용 예제</creator></identification><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">${xml}</part></score-partwise>`;
}
const SAMPLE_XML = buildSampleXML();

/* ---------------- boot ---------------- */
let resizeT = null;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (mode==='score' && osmd && osmd.Sheet && !session) { osmd.render(); osmd.cursor.show(); buildCursorTimes(); attachNoteHandlers(); addPracticeHotspots(); if (lastSession && lastSession.results && lastSession.mode==='score') colorNotes(lastSession.results); } }, 300); });
// settings popover: keep it inside the screen, close on outside tap
function initSettingsPopover(){
  const d = $('settings'); if (!d) return;
  const panel = d.querySelector('.settings-panel'), sum = d.querySelector('summary');
  const place = () => {
    if (!d.open) { d.classList.remove('placed'); return; }
    d.classList.add('placed');
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 12;
    const r = sum.getBoundingClientRect(), w = panel.offsetWidth, h = panel.offsetHeight;
    let left = r.right - w; if (left + w > vw - m) left = vw - m - w; if (left < m) left = m;
    let top = r.bottom + 8; if (top + h > vh - m) top = Math.max(m, vh - m - h);
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
  };
  d.addEventListener('toggle', place);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, { passive: true });
  document.addEventListener('click', (ev) => { if (d.open && !panel.contains(ev.target) && !sum.contains(ev.target)) d.open = false; });
}
async function boot(){
  if (window.claude) document.body.classList.add('nomic');
  bindSettings(); initSettingsPopover(); drawGaugeTicks(); initSongs();
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([$('pdfWorkerSrc').textContent], { type:'text/javascript' })); } catch(e) {}
  initOSMD();
  loadNoScore();
  if (S.transpose) $('transpose').value = S.transpose;
  renderHistory();
  document.addEventListener('keydown', (ev) => { if (ev.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { ev.preventDefault(); startPractice(); } });
}
// test hooks
window.__coach = { get master(){return master;}, get ctx(){return ctx;}, loadInstrument, instCache, playTone, makeProcessor, yin, detectOnsets, analyzeScore, analyzeFree, analyzeAndReport, get score(){return score;}, S, setLast(s){ lastSession = s; }, buildClicks };
boot();
})();
