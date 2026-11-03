import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Run against a local dev/preview server. Never signs in or submits data.
const baseURL = process.argv[2] || 'http://127.0.0.1:5187';
const output = 'docs/reviews/finvision-landing-premium';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
  // Keep visual/navigation checks isolated from the live backend.
  await context.route('**/*.supabase.co/**', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const response = await page.goto(`${baseURL}/conhecer`);
    assert.equal(response.status(), 200);
    await page.locator('.fv-hero h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('footer').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.fv-hero-product img').first().evaluate(image => image.decode());
    const geometry = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('.fv-landing :is(h1,h2,h3,p,button,summary,a)')]
        .filter(el => el.getClientRects().length && (el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1))
        .map(el => el.textContent.slice(0, 80)),
    }));
    assert.equal(geometry.scrollWidth, width, `Horizontal overflow at ${width}`);
    assert.deepEqual(geometry.overflow, [], `Clipped text/control at ${width}`);
    assert.equal(await page.locator('h1').count(), 1);
    for (const anchor of await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.hash))) {
      assert.equal(await page.locator(anchor).count(), 1, `Broken anchor ${anchor}`);
    }
    await page.getByRole('link', { name: 'Conhecer os recursos', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#recursos');
    const resourcesTop = await page.locator('#recursos').evaluate(el => el.getBoundingClientRect().top);
    assert.ok(resourcesTop >= 78, `Section hidden behind header at ${width}`);
    if (width < 1000) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
      const menu = page.getByRole('navigation', { name: 'Navegação móvel' });
      await menu.getByRole('link', { name: 'Plano', exact: true }).focus();
      await page.keyboard.press('Escape');
      assert.equal(await menu.count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Abrir menu' }).evaluate(el => el === document.activeElement), true);
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
      await menu.getByRole('link', { name: 'Plano', exact: true }).click();
      assert.equal(new URL(page.url()).hash, '#plano');
      assert.equal(await menu.count(), 0);
    }
    for (const label of ['Análises', 'Registros', 'Dashboard']) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      await page.locator('.fv-product-figure > img').evaluate(image => image.decode());
      const enlarge = page.getByRole('link', { name: `Ampliar captura de ${label} em nova aba` });
      const imageURL = await page.locator('.fv-product-figure > img').getAttribute('src');
      assert.equal(await enlarge.getAttribute('href'), imageURL);
      assert.equal((await context.request.get(`${baseURL}${imageURL}`)).status(), 200);
    }
    const question = page.locator('#faq summary').first();
    await question.focus();
    await page.keyboard.press('Enter');
    assert.equal(await question.evaluate(el => el.parentElement.open), true);
    await page.keyboard.press('Enter');
    assert.equal(await question.evaluate(el => el.parentElement.open), false);
    assert.equal(await page.locator('#faq details').count(), 7);
    assert.match(await page.locator('#plano').textContent(), /R\$ 14,90\/mês/);
    assert.equal(await page.locator('a[href*="checkout"],a[href*="asaas"],iframe').count(), 0);
    if (width === 390 || width === 1440) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${output}/landing-${width}-full.png`, fullPage: true, animations: 'disabled' });
      await page.screenshot({ path: `${output}/landing-${width}-hero.png`, animations: 'disabled' });
    }
    results.push({ width, horizontalOverflow: false, navigation: 'passed', productPicker: 'passed', faqKeyboard: 'passed' });
  }
  // Marketing stays navy even when the user saved the light application theme.
  await page.evaluate(() => { localStorage.setItem('financecontrol-theme', 'light'); });
  await page.reload();
  await page.locator('html.light').waitFor();
  const palette = await page.locator('.fv-landing').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, foreground: getComputedStyle(el).color }));
  assert.equal(palette.background, 'rgb(7, 10, 19)');
  results.push({ savedAppTheme: 'light', landingPalette: palette });
  await page.getByRole('link', { name: 'Quero testar o FinVision', exact: true }).click();
  await page.getByText('Crie sua conta', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, '/auth?mode=cadastro');
  for (const path of ['/auth', '/beta', '/demonstracao']) {
    const response = await page.goto(`${baseURL}${path}`);
    assert.equal(response.status(), 200);
    await page.locator('h1, h2').first().waitFor();
    results.push({ route: path, status: 200 });
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  await fs.writeFile(`${output}/browser-checks.json`, JSON.stringify({ baseURL, results, runtimeErrors: errors }, null, 2) + '\n');
  console.log(JSON.stringify({ success: true, results, runtimeErrors: errors }, null, 2));
} finally {
  await browser.close();
}
