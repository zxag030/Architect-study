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
```

테스트 PDF는 테스트가 메모리에서 생성하는 도형 2페이지이며 교재 원문을 포함하지 않습니다.
