<div class="wrap">
  <header class="appbar">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/><g stroke="var(--accent-ink)" stroke-width="1.4" opacity=".55"><line x1="6" y1="10" x2="26" y2="10"/><line x1="6" y1="14" x2="26" y2="14"/><line x1="6" y1="18" x2="26" y2="18"/><line x1="6" y1="22" x2="26" y2="22"/></g><ellipse cx="13" cy="20" rx="3.6" ry="2.7" fill="var(--accent-ink)" transform="rotate(-20 13 20)"/><rect x="15.6" y="7" width="1.8" height="13" fill="var(--accent-ink)"/></svg>
      <div><h1>파인튠 <span class="brand-en">Finetune</span></h1><small>연주를 듣고 음정·박자를 짚어 주는 연습 앱</small></div>
    </div>
    <div class="spacer"></div>
    <span class="chip" id="micChip"><span class="dot"></span><span id="micText">마이크 꺼짐</span></span>
    <span class="chip" id="latChip" title="소리 지연 보정값"><span class="num" id="latText">지연 보정 0ms</span></span>
  </header>

  <section class="rail" aria-label="연습 설정">
    <div class="group">
      <span class="glabel">악보</span>
      <div class="row">
        <button class="btn songs-btn" id="songsBtn" type="button">내 곡 <span class="cnt" id="songCount"></span></button>
        <label class="btn" for="fileIn">악보 열기</label>
        <input type="file" id="fileIn" accept=".musicxml,.xml,.mxl,.pdf,.png,.jpg,.jpeg,.webp" hidden>
        <button class="btn ghost" id="sampleBtn">샘플 악보</button>
        <button class="btn ghost" id="noScoreBtn" title="악보 없이 메트로놈·튜너·기준음으로 연습">개인 연습</button>
        <span class="file-name" id="fileName">개인 연습</span>
      </div>
    </div>
    <div class="group" id="partGroup" hidden>
      <span class="glabel">파트</span>
      <div class="row"><select class="inp" id="partSel" aria-label="연주할 파트" style="max-width:220px"></select><select class="inp" id="viewSel" aria-label="악보 보기"><option value="part">고른 파트만</option><option value="all">전체 스코어</option></select></div>
    </div>
    <div class="group more" id="rangeGroup">
      <span class="glabel">연습 구간 (마디)</span>
      <div class="row"><input class="inp n" id="rangeFrom" type="number" min="0" value="1"> ~ <input class="inp n" id="rangeTo" type="number" min="0" placeholder="끝"></div>
    </div>
    <div class="group more" id="freeGroup" hidden>
      <span class="glabel">박자 · 분석 격자</span>
      <div class="row">
        <select class="inp" id="freeMeter">
          <option value="2/4">2/4</option><option value="3/4">3/4</option><option value="4/4" selected>4/4</option>
          <option value="6/8">6/8</option><option value="2/2">2/2</option>
        </select>
        <select class="inp" id="freeGrid" title="박자 정확도를 잴 가장 작은 단위">
          <option value="1">박 단위</option><option value="2" selected>8분음표</option><option value="3">셋잇단</option><option value="4">16분음표</option>
        </select>
      </div>
    </div>
    <div class="group">
      <span class="glabel">템포 (♩=)</span>
      <div class="row">
        <button class="btn sm" id="bpmDown" aria-label="템포 내리기">−</button>
        <input class="bpm" id="bpm" type="number" min="20" max="300" value="80">
        <button class="btn sm" id="bpmUp" aria-label="템포 올리기">+</button>
        <input type="range" id="bpmRange" min="30" max="240" value="80" aria-label="템포 슬라이더">
      </div>
    </div>
    <div class="group more">
      <span class="glabel">메트로놈</span>
      <div class="row">
        <select class="inp" id="countIn" title="시작 전 예비 마디"><option value="0">예비박 없음</option><option value="1" selected>예비 1마디</option><option value="2">예비 2마디</option></select>
        <select class="inp clickSoundSel" id="clickSound" aria-label="메트로놈 소리" title="메트로놈 소리"></select>
        <input type="range" id="vol" min="0" max="2" step="0.05" value="1" aria-label="메트로놈 크기 (최대 200%)" title="메트로놈 크기 (최대 200%)" style="width:110px">
      </div>
    </div>
    <div class="group" id="demoGroup">
      <span class="glabel">예시 연주</span>
      <div class="row">
        <button class="btn demo" id="demoBtn" title="악보를 현재 템포로 들려줍니다">▶ 예시 듣기</button>
        <select class="inp" id="demoCountIn" aria-label="예시 듣기 예비박" title="예시 듣기 전에 칠 예비박"><option value="0">예비박 없이</option><option value="1">예비박 1마디</option><option value="2">예비박 2마디</option></select>
        <select class="inp" id="toneInst" aria-label="예시 악기" title="예시 연주에 쓸 악기 소리"></select>
        <input type="range" id="toneVol" min="0" max="1" step="0.05" value="0.6" aria-label="예시 음량" title="예시 음량" style="width:80px">
        <label class="chk" title="연습할 때 작은 소리로 악보 음을 함께 들려줍니다. 이어폰을 쓰세요."><input type="checkbox" id="guide"> 연습 중 가이드 음</label>
      </div>
    </div>
    <button class="btn more-toggle" id="moreBtn" type="button">구간·메트로놈·설정 ▾</button>
    <details class="settings more" id="settings">
      <summary class="btn">설정</summary>
      <div class="settings-panel">
        <label for="a4">기준음 A4 (Hz)</label><input class="inp n" id="a4" type="number" min="415" max="450" value="440">
        <label for="transpose">악기 조성</label>
        <select class="inp" id="transpose">
          <option value="0">C (콘서트 음)</option><option value="-2">B♭ (클라리넷·트럼펫)</option><option value="-14">B♭ 테너 색소폰</option>
          <option value="-9">E♭ 알토 색소폰</option><option value="-21">E♭ 바리톤 색소폰</option><option value="-7">F (호른)</option>
          <option value="-3">A (A 클라리넷)</option><option value="3">E♭ (E♭ 클라리넷)</option><option value="12">옥타브 위 (피콜로)</option><option value="-12">옥타브 아래 (콘트라베이스·기타)</option>
        </select>
        <span class="hint">악보에 적힌 음 기준으로 비교하려면 실제 울리는 음과의 차이를 고르세요. MusicXML에 이조 정보가 있으면 자동으로 맞춥니다.</span>
        <label for="octFree">옥타브 차이 무시</label><input id="octFree" type="checkbox" checked>
        <hr>
        <label for="tolC">음정 허용 범위 (±cent)</label><input class="inp n" id="tolC" type="number" min="5" max="50" value="20">
        <label for="tolMs">박자 허용 범위 (±ms)</label><input class="inp n" id="tolMs" type="number" min="20" max="200" value="60">
        <label for="gate">마이크 감도</label>
        <select class="inp" id="gate"><option value="0.004">높음 (작은 소리)</option><option value="0.008" selected>보통</option><option value="0.018">낮음 (시끄러운 방)</option></select>
        <label for="clickFilter">스피커 클릭 소리 걸러내기</label><input id="clickFilter" type="checkbox" checked>
        <label for="glideFilter">미끄러지는 음 거르기 (트롬본 슬라이드·글리산도)</label><input id="glideFilter" type="checkbox" checked>
        <span class="hint">켜 두면 음이 0.2초쯤 한 높이에 머물러야 한 음으로 셉니다. 아주 빠른 패시지가 덜 세어지면 끄세요.</span>
        <label for="stringMode">현악기 모드</label>
        <select class="inp" id="stringMode"><option value="auto">자동 (현악기 소리를 고르면 켜짐)</option><option value="on">항상 켜기</option><option value="off">끄기</option></select>
        <span class="hint">비브라토는 흔들림의 중심음으로 판정하고, 음마다 처음 짚은 자리(첫 착지)·최종 음정·음 찾는 시간·끌어서 들어간 음을 따로 보여 줍니다. 악보에 글리산도 표시가 있는 음은 끌어도 감점하지 않아요.</span>
        <hr>
        <label for="latency">지연 보정 (ms)</label><input class="inp n" id="latency" type="number" min="0" max="400" value="0">
        <div class="full row"><button class="btn sm" id="calBtn">자동 보정 측정</button><span class="msg" id="calMsg">스피커면 그대로 두고, 이어폰이면 클릭에 맞춰 손뼉을 치세요.</span></div>
        <hr>
        <label for="theme">화면 테마</label>
        <select class="inp" id="theme"><option value="">시스템</option><option value="light">밝게</option><option value="dark">어둡게</option></select>
      </div>
    </details>
    <div class="go">
      <button class="btn" id="metroBtn" type="button" hidden>메트로놈 켜기</button>
      <button class="btn" id="tunerBtn">튜너 켜기</button>
      <button class="btn primary" id="playBtn">연습 시작</button>
    </div>
  </section>

  <main class="stage">
    <div class="paper">
      <div class="paper-head">
        <span class="mode" id="modeLabel">분석 모드 · MusicXML</span>
        <span id="scoreInfo"></span>
        <a class="omr-link" id="omrLink" href="https://claude.ai/artifact/TuXUUgCZYA79qY67MGP9Vp" target="_blank" rel="noopener" hidden>예시 듣기·분석을 하려면 → 악보 인식기로 변환</a>
        <div class="legend" id="noteLegend" hidden>
          <span><i style="background:#1e8a4c"></i>정확</span><span><i style="background:#b86e00"></i>음정·박자 벗어남</span><span><i style="background:#c8323c"></i>틀린 음·놓침</span></div>
        <span class="note-hint" id="noteHint">음표: 그 음 듣기 · 오선 빈 곳 세 번: 그 마디부터 예시 · 한 번: 정지</span>
      </div>
      <div class="score-scroll" id="scoreScroll">
        <div id="osmd"></div>
        <div id="pdfView" hidden></div>
      </div>
      <div class="countdown" id="countdown" hidden></div>
    </div>

    <aside class="side">
      <div class="card tuner">
        <h3>튜너</h3>
        <div class="tuner-target" id="tTarget">악보 음: <b>–</b></div>
        <div class="tuner-note"><span class="big" id="tNote">–</span><span class="oct" id="tOct"></span></div>
        <svg id="gauge" viewBox="0 0 260 120" role="img" aria-label="음정 게이지">
          <path d="M20 110 A110 110 0 0 1 240 110" fill="none" stroke="var(--line)" stroke-width="14" stroke-linecap="round"/>
          <path id="gTol" fill="none" stroke="var(--good)" stroke-opacity=".28" stroke-width="14"/>
          <g id="gTicks"></g>
          <line id="gNeedle" x1="130" y1="110" x2="130" y2="18" stroke="var(--ink-3)" stroke-width="3" stroke-linecap="round"/>
          <circle cx="130" cy="110" r="6" fill="var(--ink)"/>
          <text x="22" y="98" font-size="11" fill="var(--ink-3)">낮음</text><text x="215" y="98" font-size="11" fill="var(--ink-3)">높음</text>
        </svg>
        <div class="cents-read" id="tCents">±0 c</div>
        <div class="mini-meter" aria-hidden="true"><span class="mm-tol"></span><span class="mm-mid"></span><i id="mmNeedle"></i></div>
        <div class="tuner-meta"><span class="num" id="tHz">– Hz</span><span id="tLevel">입력 –</span></div>
      </div>
      <div class="card">
        <h3>박</h3>
        <div class="beats" id="beats"></div>
        <div class="msg" id="posText" style="text-align:center;margin-top:6px">대기 중</div>
      </div>
      <div class="card">
        <h3>지금까지</h3>
        <div class="livebar"><div><b id="liveNotes">0</b><span>감지한 음</span></div><div><b id="liveIn">–</b><span>음정 범위 안</span></div><div><b id="liveRh">–</b><span>박자 범위 안</span></div></div>
        <p class="msg" id="sideMsg" style="margin:8px 0 0">이어폰으로 메트로놈을 들으면 분석이 더 정확해요.</p>
      </div>
    </aside>
  </main>

  <section class="report" id="report" hidden>
    <div class="report-head"><h2>연습 결과</h2><span class="sub" id="repSub"></span><span style="flex:1"></span><button class="btn sm" id="againBtn">같은 구간 다시</button></div>
    <div class="tiles" id="tiles"></div>
    <div class="tiles str-tiles" id="strTiles" hidden></div>
    <div>
      <div class="subhead">코칭 포인트</div>
      <ul class="coach" id="coach"></ul>
    </div>
    <div class="cols">
      <div class="panel">
        <h3>음별 음정 편차</h3>
        <div class="cap">평균 cent. 오른쪽은 높게, 왼쪽은 낮게 연주한 음. 회색 띠는 허용 범위.</div>
        <div class="axis"><div></div><div><span>−50</span><span>0</span><span>+50</span></div><div></div></div>
        <div id="pitchChart"></div>
      </div>
      <div class="panel">
        <h3>리듬별 박자 정확도</h3>
        <div class="cap">평균 타이밍 오차(ms, 절댓값). 점선은 허용 범위. 오른쪽 숫자는 주된 경향.</div>
        <div id="rhythmChart"></div>
      </div>
    </div>
    <div class="panel" id="measurePanel">
      <h3>마디별 정확도</h3>
      <div class="cap">음정과 박자를 합친 점수. 진할수록 정확합니다.</div>
      <div class="measures" id="measures"></div>
      <div class="scale"><span>낮음</span><i style="background:var(--seq-1)"></i><i style="background:var(--seq-2)"></i><i style="background:var(--seq-3)"></i><i style="background:var(--seq-4)"></i><span>높음</span></div>
    </div>
    <details>
      <summary class="btn sm" style="display:inline-block">음표별 상세 보기</summary>
      <div class="tablewrap" style="margin-top:10px"><table class="notes" id="noteTable"></table></div>
    </details>
  </section>

  <section class="history" id="history">
    <div class="top"><h2>연습 기록</h2><span class="msg" id="histSub">이 브라우저에 저장됩니다.</span><span style="flex:1"></span>
      <select class="inp" id="histFilter"><option value="">모든 곡</option></select>
      <button class="btn sm ghost" id="histClear">기록 지우기</button>
    </div>
    <div class="series-key"><span><i style="background:var(--accent)"></i>음정 정확도</span><span><i style="background:var(--sharp)"></i>박자 정확도</span></div>
    <svg id="histChart" viewBox="0 0 800 180" role="img" aria-label="연습 기록 추이"></svg>
    <div class="hlist" id="hlist"></div>
  </section>

  <footer class="foot">
    <b>사용 순서</b> ① MusicXML 악보를 열거나 샘플로 시작 → ② 템포와 연습 구간을 정하고 → ③ 연습 시작. 예비 마디 클릭 뒤 커서가 악보를 따라갑니다. 끝까지 가면 자동으로 결과가 나옵니다.<br>
    <b>악보 형식</b> MusicXML(.musicxml · .xml · .mxl)은 음표별 음정·박자 분석까지 됩니다. MuseScore에서 <i>파일 → 내보내기 → MusicXML</i>로 만들 수 있어요. PDF·사진 악보는 보면서 연습하고, 분석은 메트로놈 격자와 가장 가까운 음 기준으로 합니다.<br>
    <b>악기 소리</b> 예시 연주의 악기 음원은 tonejs-instruments(nbrosowsky, CC-BY 3.0) 샘플을 줄여서 넣었습니다.<br>
    <b>사진·PDF 악보 변환</b> <a href="https://claude.ai/artifact/TuXUUgCZYA79qY67MGP9Vp" target="_blank" rel="noopener">악보 인식기</a>에 올리면 Claude가 음표를 읽어 MusicXML로 바꿔 줍니다. 저장한 파일을 여기서 열면 예시 듣기와 분석까지 됩니다.<br>
    <b>정확도 팁</b> 처음 한 번은 설정에서 <i>자동 보정 측정</i>을 해 주세요. 단선율 악기 기준이며, 화음은 가장 높은 음으로 비교합니다. 도돌이표는 펼치지 않고 적힌 순서대로 진행합니다.
  </footer>
</div>
<div class="tip" id="tip" hidden></div>
<div class="drawer" id="songDrawer" hidden role="dialog" aria-label="내 곡">
  <div class="drawer-box">
    <div class="drawer-head"><h2>악보함</h2><span style="flex:1"></span><button class="btn sm" id="songClose" type="button">닫기</button></div>
    <div class="seg2"><button id="tabMine" type="button" class="on">내 곡</button><button id="tabBuiltin" type="button">기본 연습곡</button></div>
    <input class="inp" id="songSearch" placeholder="이름으로 찾기">
    <div id="mineBox">
      <div class="row" style="margin-bottom:8px"><span class="msg" id="songSub" style="flex:1"></span><label class="btn primary" for="fileIn">+ 곡 추가</label></div>
      <p class="msg" style="margin:0 0 8px">MusicXML·PDF·사진 악보를 넣어 두면 템포·파트·연습 구간까지 곡마다 기억해요.</p>
      <div class="songlist" id="songList"></div>
    </div>
    <div id="builtinBox" hidden>
      <div class="row" style="margin-bottom:6px"><button class="btn sm" data-bi-inst="all" type="button">전체</button><button class="btn sm" data-bi-inst="trumpet" type="button">트럼펫</button><button class="btn sm" data-bi-inst="trombone" type="button">트롬본</button><button class="btn sm" data-bi-inst="violin" type="button">바이올린</button><button class="btn sm" data-bi-inst="viola" type="button">비올라</button><button class="btn sm" data-bi-inst="cello" type="button">첼로</button></div>
      <p class="msg" style="margin:0 0 8px">파인튠이 직접 만든 기초 연습곡과 저작권이 끝난 쉬운 곡이에요. 트럼펫(B♭)·트롬본 곡은 같은 조라 함께 불 수 있고, 바이올린·비올라·첼로 곡은 같은 손가락 모양으로 연습하도록 조를 맞췄어요.</p>
      <div class="songlist" id="builtinList"></div>
    </div>
  </div>
</div>
