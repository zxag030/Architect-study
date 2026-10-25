# Architect-study
건축기사 실기 개인 암기 프로그램

## 교재 PDF (사용자 기기에만 저장)

설정 또는 문제의 **교재 보기**에서 PDF를 선택하면 동일 사이트의 IndexedDB에 저장됩니다. 이후 같은 브라우저에서 자동 연결됩니다. 인쇄 80쪽이 PDF 84페이지라면 **페이지 오프셋**에 `4`를 입력하세요. 음수도 가능합니다. 뷰어의 페이지 이동 입력은 PDF 실제 페이지 번호입니다.

PDF는 GitHub나 외부 서버로 전송되지 않으며 JSON 학습 백업에도 포함되지 않습니다. 브라우저 데이터 삭제, 비공개 모드, 저장 공간 정리로 파일이 사라지면 다시 선택하세요. 저장 실패 시에도 현재 탭에서는 열 수 있으며 재선택 안내를 표시합니다. PDF 교체는 기존 학습 기록에 영향을 주지 않습니다. 암호화되거나 손상된 PDF는 잠금 해제/복구한 파일을 선택하세요.

PDF.js와 worker, CMaps, 기본 글꼴은 `vendor/pdfjs`에서 같은 사이트 경로로 제공됩니다. `file://`로 직접 여는 대신 GitHub Pages 또는 정적 HTTP 서버를 사용하세요.

```sh
python3 -m http.server 8000
```

## 테스트

Node.js와 Playwright가 필요합니다. Playwright를 별도 경로에 설치하면 앱의 의존성 없이 테스트할 수 있습니다.

```sh
npm install --prefix /tmp/architect-tests playwright@1.62.1
export NODE_PATH=/tmp/architect-tests/node_modules
export PLAYWRIGHT_BROWSERS_PATH=/tmp/architect-browsers
node /tmp/architect-tests/node_modules/playwright/cli.js install chromium webkit
export CHROMIUM_PATH=$(node -e "console.log(require('playwright').chromium.executablePath())")
node tests/daily-progress.cjs
node tests/textbook.cjs
TEST_WEBKIT=1 node tests/textbook.cjs
node tests/pdf-navigation.cjs
TEST_WEBKIT=1 node tests/pdf-navigation.cjs
```

테스트 PDF는 테스트가 메모리에서 생성하는 도형 2페이지이며 교재 원문을 포함하지 않습니다.


PDF 이동 회귀 테스트는 서로 다른 색의 3페이지 PDF로 캔버스 픽셀을 확인합니다. 실제 터치 이벤트로 번호 입력 직후 이전/다음 이동, 서로 다른 문제의 출처 페이지, 재접속, 라이브러리/worker 로딩 지연·실패와 진행 중 렌더 취소를 검사합니다. Playwright WebKit 실행은 실제 iPad Safari 기기 검증을 대신하지 않습니다.

### iPad Safari에서 확인하기

1. 교재 PDF를 선택하고 문제의 **교재 보기**를 누릅니다. 상단 전체 페이지 수가 표시될 때까지 기다립니다.
2. 인쇄 쪽수와 PDF 실제 페이지가 다르면 오프셋을 설정합니다. 첫 페이지로 자동 대체하지 않으며 범위를 벗어나면 계산 결과와 허용 범위를 표시합니다.
3. 번호 입력 후 이전/다음 버튼을 바로 터치하고 실제 내용이 바뀌는지 확인합니다. 서로 다른 쪽수의 두 문제에서도 확인합니다.
4. 뷰어를 닫아 작성 답안이 남아 있는지, 사이트를 다시 열어 저장된 PDF가 연결되고 페이지 이동이 되는지 확인합니다.

표시 실패 시 문서/worker 로드, 페이지 읽기, 렌더링 중 어느 단계에서 발생했는지 오류 이름과 메시지를 표시합니다. **표시 다시 시도** 또는 PDF 다시 선택을 사용할 수 있습니다. PDF.js와 worker는 `textbook.js` 위치를 기준으로 같은 사이트에서 불러옵니다.


## 한글 입력 회귀 검사

학습 입력 이벤트는 `study-input.js`에서 관리합니다. 한글 조합 중에는 입력창과 값을 교체하지 않으며, 조합 확정 및 뒤따르는 입력 이벤트를 받은 후 채점·다시 풀기·단계 이동을 실행합니다. 입력 중 배경 화면 갱신은 포커스를 벗어날 때까지 보류됩니다. 입력창은 문제·단계·빈칸 인덱스에 연결되어 다른 칸이나 이미 제거된 입력창의 이벤트와 섞이지 않습니다.

```sh
node tests/korean-ime.cjs
TEST_WEBKIT=1 node tests/korean-ime.cjs
```

자동 검사는 Chromium/WebKit에서 **합성 composition/input 이벤트**를 사용합니다. 실제 iPad Safari 키보드의 한글 조합 동작을 재현하는 검사는 아닙니다. 실기기에서는 서로 다른 빈칸에 `가설지지체`, `작업공간`, `태핑`을 입력하고 삭제·재입력, 빠른 칸 이동, 마지막 글자 조합 중 채점, 오답 후 다시 풀기를 확인해야 합니다. 1단계 따라 쓰기·3단계 백지서술과 PDF를 닫은 뒤 답안 유지도 함께 확인하세요.


## 숙지도별 복습

최초 학습은 따라 쓰기 10회 → 핵심 빈칸 → 백지서술을 유지합니다. 일반 복습·누적 랜덤 테스트·당일 재복습은 시작 시 저장된 숙지도를 사용합니다.

| 숙지도 | 복습 순서 |
| --- | --- |
| 확실히 암기 | 백지서술 1회 |
| 더 숙지해야 함 | 핵심 빈칸 모두 정답 → 백지서술 |
| 아직 잘 모름 | 정답 확인 → 정답과 일치하는 따라 쓰기 3회 → 빈칸 모두 정답 → 백지서술 |

마지막 백지서술은 기존 키워드·답안 분량 기준으로 자동 평가합니다. AI 의미 채점은 아닙니다. 결과를 확인한 후 **자동 분류대로 저장**하거나 직접 숙지도를 수정해 저장할 수 있습니다. 저장된 최종 결과에 따라 4일/2일/1일 뒤 복습 일정을 정하며 전날 학습 포함 규칙도 유지합니다.

복습·랜덤 테스트를 완료한 개념은 같은 날 일반 대기에서 제외합니다. 최종 결과가 아직 잘 모름이면 별도의 **오늘의 재복습 대기**에 한 번만 등록합니다. 재복습은 사용자가 시작하며 **개념당 하루 최대 2회**입니다. 중간에 나가면 횟수를 소모하지 않습니다. 또 아직 잘 모름이어도 즉시 자동 반복하지 않으며, 2회 이후에는 다음날 일정으로 이어집니다. 숙지도가 올라가면 재복습 대기에서 빠집니다. 랜덤 테스트는 사용자가 별도로 반복할 수 있지만 소진된 재복습 한도를 초기화하지 않습니다.

복습 완료 개념 수·총 완료 횟수·재복습 횟수는 신규 학습 진행률과 별도입니다. 최초 학습의 unknown 결과는 기존과 같이 다음날 일정으로 이어집니다.

데이터는 기존 저장 키와 v2 형식을 유지하고 선택적인 `reviewDays`만 추가합니다. 날짜/개념별 완료·완료 횟수·재복습 횟수·대기를 기록하며 기존 `progress.count`, `reviewCount`, `first`, `last`, `due`를 보존합니다. 새 필드는 JSON 백업에 포함되고, 이 필드가 없는 예전 백업도 읽을 수 있습니다. 날짜가 바뀌어도 이전 기록을 삭제하지 않습니다. PDF의 IndexedDB 저장소는 변경하지 않습니다.

```sh
node tests/adaptive-review.cjs
TEST_WEBKIT=1 node tests/adaptive-review.cjs
```

복습 경로·잠금 조건·재복습 중복/한도·다음날 전환·기존 백업 호환성을 검사합니다. 한글 조합 입력 검사는 기존 `tests/korean-ime.cjs`를 함께 사용합니다. 합성 조합 이벤트와 WebKit 자동화는 실제 iPad Safari 한글 키보드 검증을 대신하지 않습니다.
