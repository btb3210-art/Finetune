# Original practice exercises (written from scratch) + public-domain melodies, as MusicXML.
import json, re, html
DIV = 4
DUR = {'w':(16,'whole'),'h':(8,'half'),'q':(4,'quarter'),'e':(2,'eighth'),'s':(1,'16th')}
STEPS = 'CDEFGAB'
def pitch_xml(p):
    m = re.match(r'^([A-G])(#|b)?(\d)$', p); st, acc, o = m.groups()
    alt = {'#':1,'b':-1}.get(acc, 0)
    return f'<pitch><step>{st}</step>{f"<alter>{alt}</alter>" if alt else ""}<octave>{o}</octave></pitch>'
def note_xml(tok, state):
    m = re.match(r'^(r|[A-G][#b]?\d):([whqes])(\.?)(~?)([()]?)$', tok); assert m, tok
    p, d, dot, tie, slur = m.groups()
    ln, typ = DUR[d]; ln = int(ln*1.5) if dot else ln
    x = '<note>' + ('<rest/>' if p == 'r' else pitch_xml(p)) + f'<duration>{ln}</duration>'
    stop = state.get('tie') and p != 'r'
    if stop: x += '<tie type="stop"/>'
    if tie: x += '<tie type="start"/>'
    x += f'<voice>1</voice><type>{typ}</type>' + ('<dot/>' if dot else '')
    n = ''
    if stop: n += '<tied type="stop"/>'
    if tie: n += '<tied type="start"/>'
    if slur == '(': n += '<slur type="start" number="1"/>'
    if slur == ')': n += '<slur type="stop" number="1"/>'
    if n: x += f'<notations>{n}</notations>'
    state['tie'] = bool(tie)
    return x + '</note>', ln
def build(title, inst, measures, key=0, time=(4,4), tempo=80, pickup=False, sub=''):
    trumpet = inst == 'trumpet'
    sign, line = {'trumpet':('G',2),'violin':('G',2),'viola':('C',3)}.get(inst, ('F',4))
    clef = f'<clef><sign>{sign}</sign><line>{line}</line></clef>'
    tr = '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>' if trumpet else ''
    state = {}; out = ''; cur_key = key
    for i, ms in enumerate(measures):
        if isinstance(ms, str): ms = {'n': ms}
        num = i if pickup else i + 1
        out += f'<measure number="{num}"{" implicit=\"yes\"" if pickup and i == 0 else ""}>'
        if i == 0:
            out += f'<attributes><divisions>{DIV}</divisions><key><fifths>{key}</fifths></key><time><beats>{time[0]}</beats><beat-type>{time[1]}</beat-type></time>{clef}{tr}</attributes>'
            out += f'<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>{tempo}</per-minute></metronome></direction-type><sound tempo="{tempo}"/></direction>'
        if 'key' in ms and ms['key'] != cur_key:
            out += f'<attributes><key><fifths>{ms["key"]}</fifths></key></attributes>'; cur_key = ms['key']
        if ms.get('words'):
            out += f'<direction placement="above"><direction-type><words font-weight="bold">{html.escape(ms["words"])}</words></direction-type></direction>'
        total = 0
        for t in ms['n'].split():
            x, ln = note_xml(t, state); out += x; total += ln
        full = time[0]*16//time[1]
        assert total == full or (pickup and i == 0) or i == len(measures)-1 and total < full, (title, i, total, ms['n'])
        if i == len(measures) - 1: out += '<barline location="right"><bar-style>light-heavy</bar-style></barline>'
        out += '</measure>'
    part = {'trumpet':'Trumpet in Bb','violin':'Violin','viola':'Viola','cello':'Violoncello'}.get(inst, 'Trombone')
    return (f'<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>{html.escape(title)}</work-title></work>'
            f'<identification><creator type="composer">{html.escape(sub or "파인튠 기본 연습곡")}</creator></identification>'
            f'<part-list><score-part id="P1"><part-name>{part}</part-name></score-part></part-list><part id="P1">{out}</part></score-partwise>')

def scale_notes(root, octv, letters_acc, n=8):
    # letters_acc: list of 7 note names with accidentals in scale order starting at root, e.g. ['F','G','A','Bb','C','D','E']
    res = []; o = octv; prev = None
    for i in range(n):
        name = letters_acc[i % 7]; L = name[0]
        if prev is not None and STEPS.index(L) < STEPS.index(prev): o += 1
        res.append(f'{name}{o}'); prev = L
    return res
SCALES = {
 'C':['C','D','E','F','G','A','B'], 'F':['F','G','A','Bb','C','D','E'], 'G':['G','A','B','C','D','E','F#'],
 'Bb':['Bb','C','D','Eb','F','G','A'], 'D':['D','E','F#','G','A','B','C#'], 'Eb':['Eb','F','G','Ab','Bb','C','D'],
 'Ab':['Ab','Bb','C','Db','Eb','F','G'] }
FIFTHS = {'C':0,'F':-1,'G':1,'Bb':-2,'D':2,'Eb':-3,'Ab':-4}
KEYKO = {'C':'다장조','F':'바장조','G':'사장조','Bb':'내림나장조','D':'라장조','Eb':'내림마장조','Ab':'내림가장조'}

def longtone(notes, words=None):
    ms = []
    for i, n in enumerate(notes):
        ms.append({'n': f'{n}:w', 'words': (words[i] if words else None)}); ms.append('r:w')
    return ms
def lipslur2(pairs):
    ms = []
    for w, lo, hi in pairs:
        ms += [{'n': f'{lo}:h( {hi}:h)', 'words': w}, f'{lo}:h( {hi}:h)', f'{hi}:h( {lo}:h)', f'{lo}:w', 'r:w']
    return ms
def lipslur3(tris):
    ms = []
    for w, a, b, c in tris:
        ms += [{'n': f'{a}:q( {b}:q {c}:q {b}:q)', 'words': w}, f'{a}:q( {b}:q {c}:q {b}:q)', f'{a}:w', 'r:w']
    return ms
def scales(keys):
    ms = []
    for k, o in keys:
        s = scale_notes(k, o, SCALES[k]); up = s; dn = s[::-1]
        ms += [{'n': ' '.join(f'{x}:q' for x in up[:4]), 'key': FIFTHS[k], 'words': KEYKO[k]}, ' '.join(f'{x}:q' for x in up[4:]),
               ' '.join(f'{x}:q' for x in dn[:4]), ' '.join(f'{x}:q' for x in dn[4:7]) + f' {dn[7]}:q', f'{s[0]}:w', 'r:w']
    return ms
def arps(keys):
    ms = []
    for k, o in keys:
        s = scale_notes(k, o, SCALES[k])
        ms += [{'n': f'{s[0]}:q {s[2]}:q {s[4]}:q {s[7]}:q', 'key': FIFTHS[k], 'words': KEYKO[k]}, f'{s[4]}:q {s[2]}:q {s[0]}:h', f'{s[0]}:q {s[2]}:q {s[4]}:q {s[7]}:q', f'{s[7]}:q {s[4]}:q {s[2]}:q {s[0]}:q', f'{s[0]}:w', 'r:w']
    return ms
def tonguing(notes):
    ms = []
    for n in notes:
        ms += [' '.join([f'{n}:q']*4), ' '.join([f'{n}:e']*8), f'{n}:h r:h']
    return ms

pieces = []
SRC = {}
def add(pid, inst, cat, level, title, measures, desc, **kw):
    SRC[pid] = {'m': measures, 'key': kw.get('key', 0), 'pickup': kw.get('pickup', False)}
    sub = kw.pop('sub', '')
    pieces.append({'id': pid, 'inst': inst, 'cat': cat, 'level': level, 'title': title, 'desc': desc, 'xml': build(title, inst, measures, sub=sub, **kw)})

# ---------------- Trumpet (written pitch, sounds a major 2nd lower) ----------------
add('tp-long1','trumpet','롱톤','초급','트럼펫 롱톤 1 · 가운데 음역',
    longtone(['C4','D4','E4','F4','G4','A4','B4','C5','B4','A4','G4','F4','E4','D4','C4']), '한 음을 4박 동안 흔들림 없이. 튜너를 보며 중심을 맞추세요.', tempo=60)
add('tp-long2','trumpet','롱톤','초중급','트럼펫 롱톤 2 · 반음씩 내려가기',
    longtone(['G4','F#4','F4','E4','Eb4','D4','C#4','C4','B3','Bb3','A3','Ab3','G3','F#3']), '반음씩 내려가며 낮은 음역 소리 만들기.', tempo=60)
add('tp-slur1','trumpet','립 슬러','초급','트럼펫 립 슬러 1 · 두 음',
    lipslur2([('0',  'C4','G4'),('2','B3','F#4'),('1','Bb3','F4'),('1-2','A3','E4'),('2-3','Ab3','Eb4'),('1-3','G3','D4'),('1-2-3','F#3','C#4')]),
    '위에 적힌 밸브를 누른 채 입술만으로 두 음을 오가기. 슬러로 부드럽게.', tempo=72)
add('tp-slur2','trumpet','립 슬러','중급','트럼펫 립 슬러 2 · 세 음',
    lipslur3([('0','C4','G4','C5'),('2','B3','F#4','B4'),('1','Bb3','F4','Bb4'),('1-2','A3','E4','A4'),('2-3','Ab3','Eb4','Ab4'),('1-3','G3','D4','G4'),('1-2-3','F#3','C#4','F#4')]),
    '같은 밸브로 세 음을 오르내리기. 높은 음에서 힘 대신 바람 속도로.', tempo=72)
add('tp-scale','trumpet','스케일','초중급','트럼펫 장음계 6개 (한 옥타브)',
    scales([('C',4),('F',4),('G',3),('Bb',3),('D',4),('Eb',4)]), '다·바·사·내림나·라·내림마장조. 처음엔 느리게, 고른 소리로.', tempo=80)
add('tp-arp','trumpet','아르페지오','초중급','트럼펫 아르페지오 (1-3-5-8)',
    arps([('C',4),('F',4),('G',3),('Bb',3),('D',4),('Eb',4)]), '화음 음을 건너뛰며 음정 감각 익히기.', tempo=80)
add('tp-tongue','trumpet','텅잉','초급','트럼펫 텅잉 · 4분·8분 반복',
    tonguing(['C4','D4','E4','F4','G4']), '"투" 발음으로 또렷하게. 메트로놈에 정확히 맞추기.', tempo=80)
add('tp-third','trumpet','음정','중급','트럼펫 3도 음정 (다장조)',
    ['C4:q E4:q D4:q F4:q','E4:q G4:q F4:q A4:q','G4:q B4:q A4:q C5:q','B4:q D5:q C5:h','C5:q A4:q B4:q G4:q','A4:q F4:q G4:q E4:q','F4:q D4:q E4:q C4:q','D4:q B3:q C4:h'],
    '3도씩 건너뛰며 정확한 음 찾기.', tempo=76)
add('tp-chrom','trumpet','반음계','중급','트럼펫 반음계 (C4–C5)',
    ['C4:e C#4:e D4:e D#4:e E4:e F4:e F#4:e G4:e','G#4:e A4:e A#4:e B4:e C5:h','C5:e B4:e Bb4:e A4:e Ab4:e G4:e Gb4:e F4:e','E4:e Eb4:e D4:e Db4:e C4:h'],
    '밸브와 혀를 정확히 맞추기.', tempo=72)
add('tp-twinkle','trumpet','쉬운 곡','초급','반짝반짝 작은 별 (트럼펫)',
    ['C4:q C4:q G4:q G4:q','A4:q A4:q G4:h','F4:q F4:q E4:q E4:q','D4:q D4:q C4:h','G4:q G4:q F4:q F4:q','E4:q E4:q D4:h','G4:q G4:q F4:q F4:q','E4:q E4:q D4:h','C4:q C4:q G4:q G4:q','A4:q A4:q G4:h','F4:q F4:q E4:q E4:q','D4:q D4:q C4:h'],
    '프랑스 민요. 트롬본 버전과 같은 조라서 함께 불 수 있어요.', tempo=90, sub='프랑스 민요')
add('tp-ode','trumpet','쉬운 곡','초급','환희의 송가 (트럼펫)',
    ['E4:q E4:q F4:q G4:q','G4:q F4:q E4:q D4:q','C4:q C4:q D4:q E4:q','E4:q. D4:e D4:h','E4:q E4:q F4:q G4:q','G4:q F4:q E4:q D4:q','C4:q C4:q D4:q E4:q','D4:q. C4:e C4:h',
     'D4:q D4:q E4:q C4:q','D4:q E4:e F4:e E4:q C4:q','D4:q E4:e F4:e E4:q D4:q','C4:q D4:q G3:h','E4:q E4:q F4:q G4:q','G4:q F4:q E4:q D4:q','C4:q C4:q D4:q E4:q','D4:q. C4:e C4:h'],
    '베토벤 교향곡 9번의 주제. 트롬본 버전과 함께 불 수 있어요.', tempo=100, sub='L. v. 베토벤')
add('tp-grace','trumpet','쉬운 곡','초급','어메이징 그레이스 (트럼펫)',
    ['G3:q','C4:h E4:e C4:e','E4:h D4:q','C4:h A3:q','G3:h G3:q','C4:h E4:e C4:e','E4:h D4:q','G4:h.','G4:h E4:q','G4:h E4:e C4:e','E4:h D4:q','C4:h A3:q','G3:h G3:q','C4:h E4:e C4:e','E4:h D4:q','C4:h.~','C4:h'],
    '미국 찬송가 선율(1829). 3/4박자, 못갖춘마디로 시작해요.', tempo=80, time=(3,4), pickup=True, sub='전래 선율 (New Britain)')

# ---------------- Trombone (concert pitch, bass clef) ----------------
add('tb-long1','trombone','롱톤','초급','트롬본 롱톤 1 · 내림나장조',
    longtone(['Bb2','C3','D3','Eb3','F3','G3','A3','Bb3','A3','G3','F3','Eb3','D3','C3','Bb2']), '한 음을 4박 동안 흔들림 없이. 튜너를 보며 슬라이드 위치를 맞추세요.', key=-2, tempo=60)
add('tb-long2','trombone','롱톤','초중급','트롬본 롱톤 2 · 반음씩 내려가기',
    longtone(['F3','E3','Eb3','D3','Db3','C3','B2','Bb2','A2','Ab2','G2','Gb2','F2','E2']), '1포지션에서 7포지션까지 반음씩. 포지션마다 음정 확인.', tempo=60)
add('tb-slur1','trombone','립 슬러','초급','트롬본 립 슬러 1 · 두 음',
    lipslur2([('1포지션','Bb2','F3'),('2포지션','A2','E3'),('3포지션','Ab2','Eb3'),('4포지션','G2','D3'),('5포지션','Gb2','Db3'),('6포지션','F2','C3'),('7포지션','E2','B2')]),
    '슬라이드를 위에 적힌 포지션에 고정하고 입술로만 두 음을 오가기.', tempo=72)
add('tb-slur2','trombone','립 슬러','중급','트롬본 립 슬러 2 · 세 음',
    lipslur3([('1포지션','Bb2','F3','Bb3'),('2포지션','A2','E3','A3'),('3포지션','Ab2','Eb3','Ab3'),('4포지션','G2','D3','G3'),('5포지션','Gb2','Db3','Gb3'),('6포지션','F2','C3','F3'),('7포지션','E2','B2','E3')]),
    '같은 포지션으로 세 음을 오르내리기. 슬라이드는 움직이지 않아요.', tempo=72)
add('tb-scale','trombone','스케일','초중급','트롬본 장음계 6개 (한 옥타브)',
    scales([('Bb',2),('F',2),('Eb',3),('C',3),('Ab',2),('G',2)]), '내림나·바·내림마·다·내림가·사장조. 슬라이드를 빠르고 정확하게.', key=-2, tempo=80)
add('tb-arp','trombone','아르페지오','초중급','트롬본 아르페지오 (1-3-5-8)',
    arps([('Bb',2),('F',2),('Eb',3),('C',3),('Ab',2),('G',2)]), '화음 음을 건너뛰며 음정 감각 익히기.', key=-2, tempo=80)
add('tb-tongue','trombone','텅잉','초급','트롬본 텅잉 · 4분·8분 반복',
    tonguing(['Bb2','C3','D3','Eb3','F3']), '"다" 발음으로 또렷하게. 슬라이드 움직임과 혀를 맞추기.', key=-2, tempo=80)
add('tb-third','trombone','음정','중급','트롬본 3도 음정 (내림나장조)',
    ['Bb2:q D3:q C3:q Eb3:q','D3:q F3:q Eb3:q G3:q','F3:q A3:q G3:q Bb3:q','A3:q C4:q Bb3:h','Bb3:q G3:q A3:q F3:q','G3:q Eb3:q F3:q D3:q','Eb3:q C3:q D3:q Bb2:q','C3:q A2:q Bb2:h'],
    '3도씩 건너뛰며 정확한 음 찾기.', key=-2, tempo=76)
add('tb-chrom','trombone','반음계','중급','트롬본 반음계 (Bb2–Bb3)',
    ['Bb2:e B2:e C3:e C#3:e D3:e D#3:e E3:e F3:e','F#3:e G3:e G#3:e A3:e Bb3:h','Bb3:e A3:e Ab3:e G3:e Gb3:e F3:e E3:e Eb3:e','D3:e Db3:e C3:e B2:e Bb2:h'],
    '포지션을 하나씩 정확히 옮기기.', tempo=72)
add('tb-twinkle','trombone','쉬운 곡','초급','반짝반짝 작은 별 (트롬본)',
    ['Bb2:q Bb2:q F3:q F3:q','G3:q G3:q F3:h','Eb3:q Eb3:q D3:q D3:q','C3:q C3:q Bb2:h','F3:q F3:q Eb3:q Eb3:q','D3:q D3:q C3:h','F3:q F3:q Eb3:q Eb3:q','D3:q D3:q C3:h','Bb2:q Bb2:q F3:q F3:q','G3:q G3:q F3:h','Eb3:q Eb3:q D3:q D3:q','C3:q C3:q Bb2:h'],
    '프랑스 민요. 트럼펫 버전과 같은 조라서 함께 불 수 있어요.', key=-2, tempo=90, sub='프랑스 민요')
add('tb-ode','trombone','쉬운 곡','초급','환희의 송가 (트롬본)',
    ['D3:q D3:q Eb3:q F3:q','F3:q Eb3:q D3:q C3:q','Bb2:q Bb2:q C3:q D3:q','D3:q. C3:e C3:h','D3:q D3:q Eb3:q F3:q','F3:q Eb3:q D3:q C3:q','Bb2:q Bb2:q C3:q D3:q','C3:q. Bb2:e Bb2:h',
     'C3:q C3:q D3:q Bb2:q','C3:q D3:e Eb3:e D3:q Bb2:q','C3:q D3:e Eb3:e D3:q C3:q','Bb2:q C3:q F2:h','D3:q D3:q Eb3:q F3:q','F3:q Eb3:q D3:q C3:q','Bb2:q Bb2:q C3:q D3:q','C3:q. Bb2:e Bb2:h'],
    '베토벤 교향곡 9번의 주제. 트럼펫 버전과 함께 불 수 있어요.', key=-2, tempo=100, sub='L. v. 베토벤')
add('tb-grace','trombone','쉬운 곡','초급','어메이징 그레이스 (트롬본)',
    ['F2:q','Bb2:h D3:e Bb2:e','D3:h C3:q','Bb2:h G2:q','F2:h F2:q','Bb2:h D3:e Bb2:e','D3:h C3:q','F3:h.','F3:h D3:q','F3:h D3:e Bb2:e','D3:h C3:q','Bb2:h G2:q','F2:h F2:q','Bb2:h D3:e Bb2:e','D3:h C3:q','Bb2:h.~','Bb2:h'],
    '미국 찬송가 선율(1829). 3/4박자, 못갖춘마디로 시작해요.', key=-2, time=(3,4), tempo=80, pickup=True, sub='전래 선율 (New Britain)')


# ---------------- more public-domain melodies: written once for B♭ trumpet, trombone version derived (same concert key) ----------------
NAT = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def tr_pitch(p, oct_shift):
    m = re.match(r'^([A-G])(#|b)?(\d)$', p); L, acc, o = m.group(1), m.group(2), int(m.group(3))
    alt = {'#':1,'b':-1}.get(acc, 0); midi = (o+1)*12 + NAT[L] + alt - 2 + 12*oct_shift
    i = STEPS.index(L) - 1; nl = STEPS[i % 7]; no = o - (1 if i < 0 else 0) + oct_shift
    a = midi - ((no+1)*12 + NAT[nl]); assert -2 <= a <= 2, p
    return nl + {-2:'bb',-1:'b',0:'',1:'#',2:'##'}[a] + str(no)
def to_trombone(measures, oct_shift=-1):
    out = []
    for ms in measures:
        d = dict(ms) if isinstance(ms, dict) else {'n': ms}
        d['n'] = ' '.join(t if t.startswith('r:') else re.sub(r'^([A-G][#b]?\d)', lambda m: tr_pitch(m.group(1), oct_shift), t) for t in d['n'].split())
        out.append(d)
    return out
def pair(pid, cat, level, name, measures, desc, key=0, sub='', **kw):
    add('tp-'+pid, 'trumpet', cat, level, f'{name} (트럼펫)', measures, desc, key=key, sub=sub, **kw)
    add('tb-'+pid, 'trombone', cat, level, f'{name} (트롬본)', to_trombone(measures), desc, key=key-2, sub=sub, **kw)

pair('mary','쉬운 곡','초급','메리의 어린 양',
  ['E4:q D4:q C4:q D4:q','E4:q E4:q E4:h','D4:q D4:q D4:h','E4:q G4:q G4:h','E4:q D4:q C4:q D4:q','E4:q E4:q E4:q E4:q','D4:q D4:q E4:q D4:q','C4:w'],
  '세 음으로 시작하는 첫 곡. 소리를 고르게 이어 보세요.', tempo=96, sub='미국 동요 (1830)')
pair('macdonald','쉬운 곡','초급','맥도널드 할아버지',
  ['C4:q C4:q C4:q G3:q','A3:q A3:q G3:h','E4:q E4:q D4:q D4:q','C4:h r:q G3:q','C4:q C4:q C4:q G3:q','A3:q A3:q G3:h','E4:q E4:q D4:q D4:q','C4:w'],
  '낮은 음과 가운데 음을 오가는 연습.', tempo=110, sub='전래 동요')
pair('london','쉬운 곡','초급','런던 다리',
  ['G4:q. A4:e G4:q F4:q','E4:q F4:q G4:h','D4:q E4:q F4:h','E4:q F4:q G4:h','G4:q. A4:e G4:q F4:q','E4:q F4:q G4:h','D4:h G4:h','E4:q C4:h.'],
  '점음표 리듬 익히기.', tempo=100, sub='영국 전래 동요')
pair('jacques','쉬운 곡','초급','프레르 자크 (돌림노래)',
  ['C4:q D4:q E4:q C4:q','C4:q D4:q E4:q C4:q','E4:q F4:q G4:h','E4:q F4:q G4:h','G4:e A4:e G4:e F4:e E4:q C4:q','G4:e A4:e G4:e F4:e E4:q C4:q','C4:q G3:q C4:h','C4:q G3:q C4:h'],
  '두 명이 2마디 간격으로 들어가면 돌림노래가 돼요.', tempo=100, sub='프랑스 민요')
pair('row','쉬운 곡','초급','노를 저어라 (돌림노래)',
  ['C4:q. C4:q.','C4:q D4:e E4:q.','E4:q D4:e E4:q F4:e','G4:h.','C5:e C5:e C5:e G4:e G4:e G4:e','E4:e E4:e E4:e C4:e C4:e C4:e','G4:q F4:e E4:q D4:e','C4:h.'],
  '6/8박자. 두 명이 2마디 간격으로 들어가는 돌림노래.', tempo=120, time=(6,8), sub='영미 전래 동요 (Row, Row, Row Your Boat)')
pair('aura','쉬운 곡','초급','아우라 리',
  ['G4:q C5:q B4:q C5:q','D5:q A4:q D5:h','C5:q B4:q A4:q B4:q','C5:w','G4:q C5:q B4:q C5:q','D5:q A4:q D5:h','C5:q B4:q A4:q B4:q','C5:w',
   'E5:q E5:q E5:h','E5:q E5:q E5:h','E5:q D5:q C5:q D5:q','E5:w','E5:q E5:q F5:q E5:q','D5:q A4:q D5:h','C5:q B4:q A4:q B4:q','C5:w'],
  '느린 레가토 노래. 음과 음 사이를 끊지 말고 이어서.', tempo=76, sub='G. R. 풀턴 (1861)')
pair('jingle','캐럴','초급','징글벨 (후렴)',
  ['E4:q E4:q E4:h','E4:q E4:q E4:h','E4:q G4:q C4:q. D4:e','E4:w','F4:q F4:q F4:q. F4:e','F4:q E4:q E4:q E4:e E4:e','E4:q D4:q D4:q E4:q','D4:h G4:h',
   'E4:q E4:q E4:h','E4:q E4:q E4:h','E4:q G4:q C4:q. D4:e','E4:w','F4:q F4:q F4:q F4:q','F4:q E4:q E4:q E4:e E4:e','G4:q G4:q F4:q D4:q','C4:w'],
  '같은 음 반복으로 텅잉 연습.', tempo=120, sub='J. 피어폰트 (1857)')
pair('silent','캐럴','초중급','고요한 밤 거룩한 밤',
  ['G4:q. A4:e G4:q','E4:h.','G4:q. A4:e G4:q','E4:h.','D5:h D5:q','B4:h.','C5:h C5:q','G4:h.','A4:h A4:q','C5:q. B4:e A4:q','G4:q. A4:e G4:q','E4:h.',
   'A4:h A4:q','C5:q. B4:e A4:q','G4:q. A4:e G4:q','E4:h.','D5:h D5:q','F5:q. D5:e B4:q','C5:h.','E5:h.','C5:q. G4:e E4:q','G4:q. F4:e D4:q','C4:h.~','C4:h.'],
  '6/8박자. 길게 끄는 음에서 음정이 처지지 않게.', tempo=84, time=(6,8), sub='F. X. 그루버 (1818)')
pair('joy','캐럴','초중급','기쁘다 구주 오셨네',
  ['C5:q B4:e. A4:s','G4:q. F4:e','E4:q D4:q','C4:q. G4:e','A4:q. A4:e','B4:q. B4:e','C5:q. C5:e','C5:e B4:e A4:e G4:e','G4:e. F4:s E4:e C5:e','C5:e B4:e A4:e G4:e','G4:e. F4:s E4:e E4:e',
   'E4:e E4:e E4:e E4:s F4:s','G4:q. F4:s E4:s','D4:e D4:e D4:e D4:s E4:s','F4:q. E4:s D4:s','C4:e C5:q A4:e','G4:e. F4:s E4:e F4:e','E4:q D4:q','C4:h'],
  '첫 줄이 장음계를 그대로 내려가요. 음계 연습 후에 불기 좋아요.', tempo=96, time=(2,4), sub='G. F. 헨델 선율, L. 메이슨 편곡 (1839)')
pair('greensleeves','클래식 주제','중급','그린슬리브스',
  ['A4:q','C5:h D5:q','E5:q. F5:e E5:q','D5:h B4:q','G4:q. A4:e B4:q','C5:h A4:q','A4:q. G#4:e A4:q','B4:h G#4:q','E4:h A4:q','C5:h D5:q','E5:q. F5:e E5:q','D5:h B4:q','G4:q. A4:e B4:q','C5:q. B4:e A4:q','G#4:q. F#4:e G#4:q','A4:h.','A4:h.',
   'G5:h.','G5:q. F#5:e E5:q','D5:h B4:q','G4:q. A4:e B4:q','C5:h A4:q','A4:q. G#4:e A4:q','B4:h G#4:q','E4:h.','G5:h.','G5:q. F#5:e E5:q','D5:h B4:q','G4:q. A4:e B4:q','C5:q. B4:e A4:q','G#4:q. F#4:e G#4:q','A4:h.'],
  '단조 3/4박자. 올림표(♯)가 붙는 음의 음정에 주의.', tempo=108, time=(3,4), pickup=True, sub='영국 전래 선율 (16세기)')
pair('minuet','클래식 주제','중급','미뉴에트 G장조',
  ['D5:q G4:e A4:e B4:e C5:e','D5:q G4:q G4:q','E5:q C5:e D5:e E5:e F#5:e','G5:q G4:q G4:q','C5:q D5:e C5:e B4:e A4:e','B4:q C5:e B4:e A4:e G4:e','F#4:q G4:e A4:e B4:e G4:e','A4:h.',
   'D5:q G4:e A4:e B4:e C5:e','D5:q G4:q G4:q','E5:q C5:e D5:e E5:e F#5:e','G5:q G4:q G4:q','C5:q D5:e C5:e B4:e A4:e','B4:q C5:e B4:e A4:e G4:e','A4:q B4:e A4:e G4:e F#4:e','G4:h.'],
  '바흐 「안나 막달레나를 위한 음악 수첩」 수록 곡(C. 페촐트 작). 8분음표를 고르게.', key=1, tempo=100, time=(3,4), sub='C. 페촐트 (1677–1733)')
pair('canon','클래식 주제','중급','캐논 주제',
  ['E5:h D5:h','C5:h B4:h','A4:h G4:h','A4:h B4:h','C5:q E5:q G5:q F5:q','E5:q C5:q E5:q D5:q','C5:q A4:q C5:q G4:q','F4:q A4:q G4:q F4:q','E5:h D5:h','C5:h B4:h','A4:h G4:h','A4:h B4:h','C5:w'],
  '앞 4마디는 긴 음으로 음정, 뒤 4마디는 도약 연습.', tempo=72, sub='J. 파헬벨 (1653–1706)')
pair('largo','클래식 주제','초중급','라르고 주제 (신세계 교향곡)',
  ['E4:q. G4:e G4:h','E4:q. D4:e C4:h','D4:q E4:q G4:q E4:q','D4:w','E4:q. G4:e G4:h','E4:q. D4:e C4:h','D4:q E4:q D4:q C4:q','C4:w'],
  '아주 느리게. 한 호흡에 2마디씩 노래하듯.', tempo=60, sub='A. 드보르작 (1841–1904)')

# ---------------- strings: written for violin, viola = a fifth lower, cello = an octave below viola ----------------
def tr_gen(p, letters, semis):
    m = re.match(r'^([A-G])(#|b)?(\d)$', p); L, acc, o = m.group(1), m.group(2), int(m.group(3))
    midi = (o+1)*12 + NAT[L] + {'#':1,'b':-1}.get(acc, 0) + semis
    i = STEPS.index(L) + letters; nl = STEPS[i % 7]; no = o + i // 7
    a = midi - ((no+1)*12 + NAT[nl]); assert -2 <= a <= 2, (p, letters, semis)
    return nl + {-2:'bb',-1:'b',0:'',1:'#',2:'##'}[a] + str(no)
def tr_meas(measures, letters, semis):
    out = []
    for ms in measures:
        d = dict(ms) if isinstance(ms, dict) else {'n': ms}
        if 'key' in d: d['key'] = d['key'] + {0:0, 1:2, -4:-1, -11:-1}[letters]   # only the shifts used below
        d['n'] = ' '.join(t if t.startswith('r:') else re.sub(r'^([A-G][#b]?\d)', lambda m: tr_gen(m.group(1), letters, semis), t) for t in d['n'].split())
        out.append(d)
    return out
SNAME = {'violin':'바이올린','viola':'비올라','cello':'첼로'}
SPFX = {'violin':'vn','viola':'va','cello':'vc'}
def strings(pid, cat, level, name, vn_measures, desc, key, **kw):
    for inst, letters, semis, dk in (('violin',0,0,0), ('viola',-4,-7,-1), ('cello',-11,-19,-1)):
        ms = vn_measures if inst == 'violin' else tr_meas(vn_measures, letters, semis)
        add(f'{SPFX[inst]}-{pid}', inst, cat, level, name.replace('{i}', SNAME[inst]), ms, desc, key=key+(0 if pid == 'open' else dk), **kw)

strings('open','개방현','초급','{i} 개방현 롱톤',
  [{'n':'G3:w','words':'4번 줄'},'G3:w',{'n':'D4:w','words':'3번 줄'},'D4:w',{'n':'A4:w','words':'2번 줄'},'A4:w',{'n':'E5:w','words':'1번 줄'},'E5:w','A4:w','D4:w','G3:w~','G3:w'],
  '활을 끝까지 고르게 쓰며 한 음을 길게. 줄을 바꿀 때 소리가 끊기거나 흔들리지 않게. 개방현은 튜너로 줄 조율 확인용으로도 좋아요.', key=0, tempo=60)
strings('finger','음정','초급','{i} 손가락 자리 익히기 (1포지션)',
  [{'n':'D4:h E4:h','words':'개방현 + 한 음'},'D4:h E4:h',{'n':'D4:q E4:q F#4:h','words':'+ 두 음'},'F#4:q E4:q D4:h',{'n':'D4:q E4:q F#4:q G4:q','words':'+ 세 음'},'G4:q F#4:q E4:q D4:q',
   {'n':'A4:h B4:h','words':'다음 줄: 개방현 + 한 음'},'A4:h B4:h','A4:q B4:q C#5:h','C#5:q B4:q A4:h','A4:q B4:q C#5:q D5:q','D5:q C#5:q B4:q A4:q','D4:w'],
  '손가락을 하나씩 더해 가며 같은 자리를 반복해서 짚기. 현악기 모드를 켜면 "첫 착지 음정"으로 처음 짚은 자리가 맞는지 볼 수 있어요.', key=2, tempo=72)
strings('ring','음정','초중급','{i} 공명음 맞추기',
  [{'n':'G3:q A3:q B3:q C#4:q','words':'올라가서'},{'n':'D4:w','words':'옆 개방현과 같은 음'},'D4:q E4:q F#4:q G4:q',{'n':'G4:w','words':'개방현이 함께 울림'},'D4:q E4:q F#4:q G4:q',{'n':'A4:w','words':'옆 개방현과 같은 음'},
   'A4:q B4:q C#5:q D5:q',{'n':'D5:w','words':'개방현이 함께 울림'},'D5:q C#5:q B4:q A4:q','G4:q F#4:q E4:q D4:q','D4:w'],
  '맞는 자리를 짚으면 옆의 개방현이 함께 울려요. 귀로 울림을 찾고, 튜너로 확인하세요.', key=2, tempo=66)
strings('scale1','스케일','초급','{i} 장음계 한 옥타브',
  ['D4:h E4:h','F#4:h G4:h','A4:h B4:h','C#5:h D5:h','D5:h C#5:h','B4:h A4:h','G4:h F#4:h','E4:h D4:h',
   'D4:q E4:q F#4:q G4:q','A4:q B4:q C#5:q D5:q','D5:q C#5:q B4:q A4:q','G4:q F#4:q E4:q D4:q','D4:w'],
  '2분음표로 한 번, 4분음표로 한 번. 반음 자리(3–4음, 7–8음)에서 손가락을 붙여 짚기.', key=2, tempo=72)
strings('scale2','스케일','중급','{i} 장음계 두 옥타브',
  ['G3:q A3:q B3:q C4:q','D4:q E4:q F#4:q G4:q','A4:q B4:q C5:q D5:q','E5:q F#5:q G5:h','G5:q F#5:q E5:q D5:q','C5:q B4:q A4:q G4:q','F#4:q E4:q D4:q C4:q','B3:q A3:q G3:h','G3:w'],
  '가장 낮은 개방현부터 두 옥타브. 줄을 넘어갈 때도 음정이 끊기지 않게.', key=1, tempo=72)
for pid, cat, lvl, nm, src_id, desc, kw in [
    ('twinkle','쉬운 곡','초급','반짝반짝 작은 별 ({i})','tp-twinkle','프랑스 민요. 첫 곡으로 개방현과 손가락 자리 확인.', dict(tempo=90, sub='프랑스 민요')),
    ('ode','쉬운 곡','초급','환희의 송가 ({i})','tp-ode','베토벤 교향곡 9번의 주제.', dict(tempo=96, sub='L. v. 베토벤')),
    ('aura','쉬운 곡','초급','아우라 리 ({i})','tp-aura','긴 활로 레가토. 음과 음 사이를 끊지 말고.', dict(tempo=76, sub='G. R. 풀턴 (1861)')),
    ('silent','캐럴','초중급','고요한 밤 거룩한 밤 ({i})','tp-silent','6/8박자. 긴 음에서 음정이 처지지 않게.', dict(tempo=84, time=(6,8), sub='F. X. 그루버 (1818)')),
    ('minuet','클래식 주제','중급','미뉴에트 G장조 ({i})','tp-minuet','C. 페촐트 작. 8분음표를 고른 활로.', dict(tempo=100, time=(3,4), sub='C. 페촐트 (1677–1733)')),
    ('canon','클래식 주제','중급','캐논 주제 ({i})','tp-canon','앞은 긴 음으로 음정, 뒤는 손가락 이동 연습.', dict(tempo=72, sub='J. 파헬벨 (1653–1706)')),
]:
    src = SRC[src_id]
    shift = (0,0,0) if pid == 'minuet' else (1,2,2)      # trumpet C major -> violin D major (minuet stays in G)
    vn = tr_meas(src['m'], shift[0], shift[1]) if shift[0] else src['m']
    strings(pid, cat, lvl, nm, vn, desc, key=src['key'] + shift[2], pickup=src.get('pickup', False), **kw)

for p in pieces:
    if p['inst'] == 'trumpet' and p['cat'] in ('곡',) : pass
json.dump([{k: v for k, v in p.items()} for p in pieces], open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'builtin.json'),'w'), ensure_ascii=False)
print(len(pieces), sum(len(p['xml']) for p in pieces)//1024, 'KB')
for p in pieces: print(p['id'], p['title'])
