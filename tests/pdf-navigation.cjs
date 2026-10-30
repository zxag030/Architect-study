const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

// Distinct, valid pages let us verify canvas pixels, not just a page-number label.
function fixture() {
  const colors = ['1 0 0', '0 1 0', '0 0 1'];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
  ];
  for (const color of colors) {
    const content = `${color} rg 0 0 300 400 re f\n`;
    const streamId = objects.length + 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
  }
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  // Serve under the real GitHub Pages project subpath, including script query strings.
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!pathname.startsWith('/Architect-study/')) { res.writeHead(404).end(); return; }
  const relative = pathname.slice('/Architect-study/'.length) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
});
async function displayed(page, number) {
  await page.waitForFunction(n => document.getElementById('pdf-status')?.textContent.endsWith(`PDF ${n}/3페이지`) &&
    !document.getElementById('pdf-canvas').hidden, number);
  const pixels = await page.locator('#pdf-canvas').evaluate(canvas =>
    [...canvas.getContext('2d').getImageData(10, 10, 1, 1).data]);
  assert.deepEqual(pixels, [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]][number - 1]);
  assert.equal(await page.locator('#pdf-page').inputValue(), String(number));
  assert.equal(await page.locator('#pdf-total').innerText(), '/ 3페이지');
}
async function tap(page, selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box);
  // One physical touch: locator.click() retries could mask a DOM replacement bug.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.TEST_WEBKIT ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ?
    { headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : { headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 820, height: 1180 }, hasTouch: true });
    const errors = [], outbound = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      assert.equal(request.method(), 'GET');
      if (!request.url().startsWith('http://127.0.0.1:') && !request.url().startsWith('blob:')) outbound.push(request.url());
    });
    const url = `http://127.0.0.1:${server.address().port}/Architect-study/`;
    let releaseLibrary;
    const libraryGate = new Promise(resolve => { releaseLibrary = resolve; });
    await page.route('**/legacy/build/pdf.mjs', async route => { await libraryGate; await route.continue(); });
    await page.goto(url);
    await page.evaluate(() => { startOne('q001', 'learn'); });
    assert.equal(await page.locator('.copyInput').count(), 10);
    await page.locator('.copyInput').nth(0).click();
    await page.locator('.copyInput').nth(0).fill('계속 작성 중인 답안');
    await page.locator('.copyInput').nth(1).click();
    await page.locator('.copyInput').nth(1).fill('다른 회차의 독립 답안');
    await page.getByRole('button', { name: '교재 보기 · 80쪽', exact: true }).click();
    await page.locator('.modal input[type=file]').setInputFiles({ name: 'local.pdf', mimeType: 'application/pdf', buffer: fixture() });
    await page.waitForFunction(() => pdfState.file && pdfState.message.includes('저장됨'));
    // No page requests are allowed before the shared document load finishes.
    assert.equal(await page.locator('#pdf-prev').isDisabled(), true);
    assert.equal(await page.locator('#pdf-next').isDisabled(), true);
    assert.equal(await page.locator('#pdf-page').isDisabled(), true);
    await page.evaluate(() => goPdfPage(2));
    assert.match(await page.locator('#pdf-status').innerText(), /준비될 때까지/);
    await page.waitForFunction(()=>pdfState.documentPromise!==null);
    // Rejecting another selection must not invalidate the in-flight valid document.
    await page.locator('.modal input[type=file]').setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});
    await page.waitForFunction(()=>pdfState.message.includes('선택 실패'));
    await page.evaluate(() => setPdfOffset(-79));
    releaseLibrary();
    await displayed(page, 1);
    assert.equal(await page.locator('#pdf-prev').isDisabled(), true);
    await tap(page, '#pdf-next'); await displayed(page, 2);
    await tap(page, '#pdf-prev'); await displayed(page, 1);
    // Regression: input blur previously rebuilt the whole DOM and swallowed Next.
    await page.locator('#pdf-page').fill('2');
    await tap(page, '#pdf-prev'); await displayed(page, 1);
    await page.locator('#pdf-page').fill('3');
    await page.locator('#pdf-page').press('Enter'); await displayed(page, 3);
    assert.equal(await page.locator('#pdf-next').isDisabled(), true);
    for (const value of ['0', '4', '1.5', '']) {
      await page.locator('#pdf-page').fill(value);
      await page.locator('#pdf-page').press('Enter');
      assert.match(await page.locator('#pdf-status').innerText(), /1~3 범위의 정수/);
      assert.equal(await page.locator('#pdf-page').inputValue(), '3');
    }
    await page.evaluate(() => goPdfPage(1)); await displayed(page, 1);
    // Offset blur also must preserve the following touch; 80-78 => 2, then Next => 3.
    await page.locator('#viewer-offset').fill('-78');
    await tap(page, '#pdf-next'); await displayed(page, 3);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    assert.equal(await page.locator('.copyInput').nth(0).inputValue(), '계속 작성 중인 답안');
    assert.equal(await page.locator('.copyInput').nth(1).inputValue(), '다른 회차의 독립 답안');
    await page.getByRole('button', { name: '교재 보기 · 80쪽', exact: true }).click();
    await displayed(page, 2);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.evaluate(() => startOne('q008', 'learn'));
    await page.getByRole('button', { name: '교재 보기 · 81쪽', exact: true }).click();
    await displayed(page, 3);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.reload();
    await page.waitForFunction(() => pdfState.file && pdfState.offset === -78);
    await page.evaluate(() => startOne('q001', 'learn'));
    await page.getByRole('button', { name: '교재 보기 · 80쪽', exact: true }).click();
    await displayed(page, 2);
    await tap(page, '#pdf-next'); await displayed(page, 3);
    await page.locator('#pdf-page').fill('1'); await page.locator('#pdf-page').press('Enter');
    await displayed(page, 1);
    // Several requests while a page fetch is delayed must show only the newest page.
    await page.evaluate(() => {
      const doc = pdfState.doc, original = doc.getPage.bind(doc);
      doc.getPage = async n => { await new Promise(r => setTimeout(r, n === 2 ? 150 : 20)); return original(n); };
      goPdfPage(2); goPdfPage(3);
    });
    await displayed(page, 3);
    await page.waitForTimeout(200); await displayed(page, 3);
    // Hold an actual PDF.js render at onContinue, then cancel it for newer requests.
    await page.evaluate(() => {
      const doc=pdfState.doc, original=doc.getPage.bind(doc);
      doc.getPage=async n=>{
        const p=await original(n);
        if(n===2&&!p.testRenderWrapped){
          p.testRenderWrapped=true;const render=p.render.bind(p);
          p.render=options=>{const task=render(options);task.onContinue=()=>{window.heldPdfRender=true};return task};
        }
        return p;
      };
      goPdfPage(2);
    });
    await page.waitForFunction(()=>window.heldPdfRender);
    await page.evaluate(()=>{goPdfPage(3);goPdfPage(1)});
    await displayed(page,1);

    await page.locator('#viewer-offset').fill('99'); await page.locator('#viewer-offset').dispatchEvent('change');
    await page.waitForFunction(() => document.getElementById('pdf-status').textContent.includes('페이지 범위 오류'));
    assert.equal(await page.locator('#pdf-canvas').isVisible(), false);
    await page.locator('#viewer-offset').fill('-79'); await page.locator('#viewer-offset').dispatchEvent('change');
    await displayed(page, 1);
    // Document loading can finish after closing/reopening on a different question.
    await page.reload(); await page.waitForFunction(() => pdfState.file);
    let releaseWorker;
    const workerGate = new Promise(resolve => { releaseWorker = resolve; });
    await page.route('**/legacy/build/pdf.worker.mjs', async route => { await workerGate; await route.continue(); });
    await page.evaluate(() => { startOne('q001', 'learn'); openSource(activeCard().page); });
    await page.waitForFunction(() => pdfState.task !== null);
    await page.evaluate(()=>{window.firstPdfTask=pdfState.task});
    await page.evaluate(() => { closeModal(); startOne('q008', 'learn'); openSource(activeCard().page); });
    releaseWorker(); await displayed(page, 2);
    assert.equal(await page.evaluate(()=>pdfState.task===window.firstPdfTask),true);
    await page.unroute('**/legacy/build/pdf.worker.mjs');
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
    console.log(`${engine.name()}: real touch navigation, page pixels, question pages, delayed library/worker, latest request, restore and answers passed`);
    // Library and worker failures must show their phase instead of a first-page fallback.
    for (const asset of ['pdf.mjs', 'pdf.worker.mjs']) {
      const context = await browser.newContext(); const broken = await context.newPage();
      await broken.route(`**/legacy/build/${asset}`, route => route.abort());
      await broken.goto(url);
      await broken.evaluate(() => openSource(1));
      await broken.locator('.modal input[type=file]').setInputFiles({ name: 'local.pdf', mimeType: 'application/pdf', buffer: fixture() });
      await broken.waitForFunction(() => document.getElementById('pdf-status')?.textContent.includes('PDF 표시 실패'));
      assert.match(await broken.locator('#pdf-status').innerText(), /PDF 문서\/worker 로드/);
      assert.equal(await broken.locator('#pdf-canvas').isVisible(), false);
      await context.close();
    }
    console.log(`${engine.name()}: PDF.js and worker load failure messages passed`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
