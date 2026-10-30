const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.TEST_WEBKIT ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ?
    { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true } : { headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 820, height: 1180 }, timezoneId: 'Asia/Seoul', hasTouch: true });
    const errors = [];
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-29T03:00:00Z') });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      data = normalizeStudyData({
        ...data,
        cards: data.cards.slice(0, 15),
        progress: {
          q001: { status: 'master', count: 4, reviewCount: 3, first: '2026-10-20', last: '2026-10-29', due: '2026-11-02' },
          q003: { status: 'weak', count: 2, reviewCount: 1, first: '2026-10-20', last: '2026-10-28', due: '2026-10-30' },
          q004: { status: 'unknown', count: 1, first: '2026-10-28', last: '2026-10-28', due: '2026-10-29' },
          // Grading an unlearned card in whole-bank review must not count as learning it.
          q005: { status: 'master', learningCompleted: false, count: 1, reviewCount: 1, last: '2026-10-28', due: '2026-11-01' }
        },
        dailyCompletions: { '2026-10-28': ['q001', 'q003'] },
        reviewDays: { '2026-10-29': { q001: { completed: true, attempts: 1, retries: 0, pending: false } } },
        settings: { reviewDaily: 20 }
      });
      save(); render();
    });
    const kpi = label => page.locator('.surface.kpi').filter({ has: page.getByText(label, { exact: true }) }).locator('.num');
    assert.equal(await kpi('미학습 문제').innerText(), '12');
    assert.match(await kpi('오늘 복습 완료').innerText(), /^1/);
    assert.equal(await kpi('시험까지').innerText(), 'D-9');
    assert.equal(await kpi('완벽하게 외운 것').innerText(), '2');
    assert.equal(await kpi('더 공부할 것').innerText(), '1');
    assert.equal(await kpi('부족한 것').innerText(), '1');
    assert.equal(await page.locator('#new-goal-input').inputValue(), '2');
    assert.deepEqual(await page.evaluate(() => dailyStats()), { goal: 2, completed: 0, remaining: 2, percent: 0 });
    // Applying is explicit. Blurring an edited input must not rerender and swallow Reset.
    await page.locator('#new-goal-input').fill('4');
    assert.equal(await page.evaluate(() => examPlan().goal), 2);
    await page.locator('#new-goal-apply').click();
    assert.equal(await page.evaluate(() => examPlan().goal), 4);
    await page.locator('#new-goal-input').fill('9');
    await page.getByRole('button', { name: '권장 목표 사용', exact: true }).click();
    assert.equal(await page.evaluate(() => examPlan().goal), 2);
    assert.equal(await page.evaluate(() => examPlan().manual), false);
    await page.locator('#new-goal-input').fill('5');
    await page.locator('#new-goal-input').press('Enter');
    assert.equal(await page.evaluate(() => examPlan().goal), 5);
    await page.reload();
    assert.equal(await page.locator('#new-goal-input').inputValue(), '5');
    assert.equal(await page.evaluate(() => pr('q001').reviewCount), 3);
    // Nov 4 automatically replaces daily new-study CTA with a whole-review CTA.
    await page.evaluate(() => { data.settings.newGoals['2026-11-04'] = 12; data.settings.reviewSetup={...reviewSetup,grades:['master']};reviewSetup.grades=['master'];save(); });
    await page.clock.fastForward(6 * 24 * 60 * 60 * 1000);
    await page.waitForFunction(() => today === '2026-11-04');
    assert.equal(await page.locator('h1').innerText(), '시험 직전 · 전체 복습');
    assert.equal(await page.locator('#new-goal-input').inputValue(), '0');
    assert.equal(await page.locator('#new-goal-input').isDisabled(), true);
    assert.equal(await page.locator('#new-goal-apply').isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '신규 학습 시작', exact: true }).count(), 0);
    await page.getByRole('button', { name: '전체 복습 시작', exact: true }).click();
    assert.equal(await page.locator('#review-form').count(), 1);
    assert.equal(await page.locator('#review-form [name=target]').inputValue(),'all');
    assert.equal(await page.locator('#review-form [name=grades]:checked').count(),5);
    await page.evaluate(() => nav('today'));
    await page.getByRole('button', { name: '문제은행 · 개별 학습', exact: true }).click();
    // q002 has a short real answer and two blanks; use its actual existing Learn button.
    await page.locator('button[onclick="startOne(\'q002\',\'learn\')"]').click();
    assert.equal(await page.evaluate(() => session.mode), 'learn');
    assert.equal(await page.evaluate(() => session.copyTarget), 10);
    assert.equal(await page.locator('.copyInput').count(), 10);
    for (let repetition = 0; repetition < 10; repetition++) {
      await page.waitForFunction(() => !studyInputBusy());
      await page.locator('.copyInput').nth(repetition).click();
      await page.locator('.copyInput').nth(repetition).fill(await page.evaluate(() => activeCard().answer));
      assert.equal(await page.evaluate(() => session.stage), 1);
    }
    await page.locator('button[onclick="advance()"]').click();
    await page.waitForFunction(() => session.stage === 2);
    const blanks = page.locator('.blankInput');
    for (let i = 0; i < await blanks.count(); i++) {
      await blanks.nth(i).click();
      await blanks.nth(i).fill(await blanks.nth(i).getAttribute('data-key'));
    }
    await page.locator('button[onclick="checkBlanks()"]').click();
    await page.waitForFunction(() => session.blankPassed);
    await page.locator('button[onclick="advance()"]').click();
    await page.waitForFunction(() => session.stage === 3);
    assert.equal(await page.locator('.assess').count(), 0);
    await page.locator('#freeInput').fill(await page.evaluate(() => activeCard().answer));
    await page.locator('button[onclick="completeLearning()"]').click();
    await page.waitForFunction(() => session === null);
    assert.equal(await page.evaluate(() => pr('q002').learningCompleted), true);
    assert.equal(await page.evaluate(() => pr('q002').status), 'unrated');
    assert.deepEqual(await page.evaluate(() => dailyStats()), { goal: 0, completed: 1, remaining: 0, percent: 0 });
    assert.equal(await kpi('미학습 문제').innerText(), '11');
    assert.match(await kpi('오늘 복습 완료').innerText(), /^0/);
    assert.equal(await kpi('평가 대기').innerText(), '1');
    assert.deepEqual(await page.evaluate(() => data.dailyCompletions['2026-10-28']), ['q001', 'q003']);
    assert.equal(await page.evaluate(() => data.settings.newGoals['2026-11-04']), 12);
    for (const width of [375, 820, 1024]) {
      await page.setViewportSize({ width, height: 1180 });
      assert.equal(await page.locator('.daily-progress').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    }
    assert.deepEqual(errors, []);
    console.log(`${engine.name()}: explicit daily goal UI/reset, dashboard counters, Nov4 review rollover and preserved manual 10-copy new learning passed`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
