# 파인튠 (Finetune) — 작업 안내

악기 연습 앱(악보·메트로놈·튜너 + 음정·박자 피드백). 공개 주소: https://btb3210-art.github.io/Finetune/
(GitHub Pages, main 브랜치 루트에서 배포)

## 사용자
- 저장소 주인은 고등학교 음악 교사이고 코드를 모른다. 답은 항상 쉬운 한국어로, 전문 용어 없이.
- 결과를 줄 때 바로 확인할 수 있는 것(화면 캡처 등)도 함께.

## 구조
- 저장소 루트: 배포된 웹앱 (index.html, manifest.webmanifest, sw.js, icon-*.png) — 직접 고치지 말고 빌드 결과로만 덮어쓴다.
- src/app: 앱 본체 app.js, app.css, body.html. build.py 가 라이브러리·악기 소리·연습곡을 한 파일로 묶는다.
- src/etudes/gen.py: 기본 연습곡(MusicXML) 생성 → builtin.json
- src/inst/inst.json: 악기 샘플(tonejs-instruments, CC-BY 3.0)
- src/lib: OpenSheetMusicDisplay 1.9.9, pdf.js 3.11.174
- src/pwa: 웹앱용 manifest, sw.js, 아이콘
- src/apk: 안드로이드 WebView 앱 프로젝트 (서명키는 저장소에 없음 — 사용자가 따로 보관)
- src/convert: 악보 인식기 페이지

## 업데이트 순서 (매번)
1. src/ 안의 소스를 고친다.
2. `cd src/etudes && python3 gen.py` (연습곡을 바꿨을 때)
3. `src/pwa/sw.js` 의 `VERSION` 숫자를 하나 올린다 (예: coach-v11 → coach-v12). 그래야 사용자 기기에 새 버전이 적용된다.
4. `cd src/app && python3 build.py` → src/pwa/index.html 생성
5. src/pwa 의 index.html, manifest.webmanifest, sw.js, icon-*.png 를 저장소 루트로 복사.
6. Playwright(크로미움)로 루트 index.html 을 열어 오류 없이 뜨는지 확인하고 화면을 캡처해 보여 준다.
7. 커밋 후 main 에 반영한다. 브랜치로만 올라가면 PR을 만들고, 사용자에게 GitHub에서 "Merge" 버튼을 누르라고 쉽게 안내한다.

## 주의
- localStorage/IndexedDB 키(practice-coach-…)는 바꾸지 말 것 — 사용자 저장 악보가 사라진다.
- 저작권: 기본 연습곡은 직접 만든 연습곡과 저작권이 끝난 곡의 선율만.
