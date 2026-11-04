import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Run against a local dev/preview server. Never signs in or submits data.
const baseURL = process.argv[2] || 'http://127.0.0.1:5187';
const output = process.argv[3] || 'docs/reviews/finvision-landing-premium';
const captureBenefits = process.argv.includes('--benefits');
const captureIaOnly = process.argv.includes('--ia-only');
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
  for (const width of [320, 360, 390, 768, 1024, 1280, 1440, 1920]) {
    const height = width < 600 ? 844 : width === 1280 ? 900 : 1000;
    await page.setViewportSize({ width, height });
    const response = await page.goto(`${baseURL}/conhecer`);
    assert.equal(response.status(), 200);
    await page.locator('.fv-hero h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('footer').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.fv-hero-product img').first().evaluate(image => image.decode());
    const geometry = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('.fv-landing :is(h1,h2,h3,p,button,summary,a,dt,dd)')]
        .filter(el => el.getClientRects().length && (el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1))
        .map(el => el.textContent.slice(0, 80)),
    }));
    assert.equal(geometry.scrollWidth, width, `Horizontal overflow at ${width}`);
    assert.deepEqual(geometry.overflow, [], `Clipped text/control at ${width}`);
    if (width >= 600) {
      const geometry = await page.evaluate(() => {
        const measure = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        const features = ['dashboard', 'extratos-movimentos', 'registros-focus', 'orcamento-detail', 'contas-detail'];
        const cards = Object.fromEntries(features.map(name => [name, measure(`.fv-feature-${name}`)]));
        const media = Object.fromEntries(features.map(name => [name, measure(`.fv-feature-${name} .fv-mini-product`)]));
        return { cards, media };
      });
      const first = ['dashboard', 'extratos-movimentos'], last = ['orcamento-detail', 'contas-detail'];
      for (const pair of [first, last]) {
        const [a, b] = pair;
        assert.ok(Math.abs(geometry.cards[a].top - geometry.cards[b].top) <= 2, `Unequal card top at ${width}: ${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.cards[a].bottom - geometry.cards[b].bottom) <= 2, `Unequal card bottom at ${width}: ${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.cards[a].width - geometry.cards[b].width) <= 2, `Unequal card widths at ${width}: ${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.media[a].top - geometry.media[b].top) <= 2, `Unequal preview start at ${width}: ${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.media[a].bottom - geometry.media[b].bottom) <= 2, `Unequal preview end at ${width}: ${JSON.stringify(geometry)}`);
      }
      if (width >= 850) {
        assert.ok(Math.abs(geometry.cards.dashboard.height - geometry.cards['orcamento-detail'].height) <= 2, `All four small cards must share height at ${width}`);
      }
      const combined = geometry.cards.dashboard.width + geometry.cards['extratos-movimentos'].width;
      assert.ok(geometry.cards['registros-focus'].width >= combined, `Records must span both columns at ${width}`);
    }
    assert.equal(await page.locator('h1').count(), 1);
    const composition = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
      };
      return {
        viewport: innerWidth,
        hero: box('.fv-hero'),
        title: box('.fv-hero h1'),
        ctas: box('.fv-cta-row'),
        product: box('.fv-browser'),
        alignment: getComputedStyle(document.querySelector('.fv-hero-copy')).textAlign,
        highlightedWords: [...document.querySelectorAll('.fv-hero h1 .fv-green')].map(el => el.textContent),
        overlays: document.querySelectorAll('.fv-floating-chart, .fv-floating-donut').length,
      };
    });
    assert.equal(composition.alignment, 'center', `CONYEST title must remain centered at ${width}`);
    assert.deepEqual(composition.highlightedWords, ['dinheiro.']);
    assert.equal(composition.overlays, 0);
    assert.ok(Math.abs((composition.title.left + composition.title.right) / 2 - width / 2) < 2);
    assert.ok(composition.product.top > composition.ctas.bottom, `Dashboard must follow the CTAs at ${width}`);
    assert.ok(composition.product.width >= composition.hero.width * .98, `Dashboard must span the hero width at ${width}`);
    const features = await page.evaluate(() => {
      const root = document.getElementById('recursos');
      const cards = [...root.querySelectorAll('.fv-feature-highlights > article')];
      const secondary = root.querySelector('.fv-feature-grid');
      return {
        order: cards.map(card => card.id),
        positions: cards.map(card => ({ top: card.getBoundingClientRect().top, width: card.getBoundingClientRect().width })),
        secondaryTop: secondary.getBoundingClientRect().top,
        sectionWidth: root.getBoundingClientRect().width,
        aiIsIllustration: root.querySelector('.fv-receipt-demo figcaption').textContent.includes('Nenhuma leitura é executada'),
        activeForms: root.querySelectorAll('input, form').length,
        filledItems: root.querySelectorAll('.fv-demo-filled-items li').length,
        automaticFields: root.querySelector('.fv-demo-filled-fields').textContent,
      };
    });
    assert.deepEqual(features.order, ['analises-destaque', 'ia-destaque']);
    assert.ok(features.positions[0].top < features.positions[1].top && features.positions[1].top < features.secondaryTop);
    assert.ok(features.positions.every(card => card.width >= features.sectionWidth * .98));
    assert.equal(features.aiIsIllustration, true);
    assert.equal(features.activeForms, 0);
    assert.equal(features.filledItems, 3);
    assert.match(features.automaticFields, /Valor preenchido/);
    assert.match(features.automaticFields, /Data preenchida/);
    const liveReaderLink = page.getByRole('link', { name: 'Experimentar a leitura por IA', exact: true });
    assert.equal(await liveReaderLink.getAttribute('href'), '/receipt', 'AI CTA must lead to the actual reader');
    assert.equal(await page.locator('#ia-fluxo').count(), 1, 'Illustrative AI demo remains visible');
    await page.getByRole('link', { name: 'Explorar as análises', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Análises', exact: true }).getAttribute('aria-pressed'), 'true');
    for (const anchor of await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.hash))) {
      assert.equal(await page.locator(anchor).count(), 1, `Broken anchor ${anchor}`);
    }
    await page.getByRole('link', { name: 'Conhecer os recursos', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#recursos');
    const resourcesTop = await page.locator('#recursos').evaluate(el => el.getBoundingClientRect().top);
    const headerBottom = await page.locator('.fv-header').evaluate(el => el.getBoundingClientRect().bottom);
    assert.ok(resourcesTop >= headerBottom, `Section hidden behind header at ${width}`);
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
    for (const label of ['Análises', 'Registros', 'Extratos', 'Cartões', 'Previsões', 'Dashboard']) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('.fv-product-caption').textContent(), /DEMO — DADOS FICTÍCIOS/);
      assert.match(await page.locator('.fv-product-figure > img').getAttribute('alt'), /DEMO/);
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
    if (width === 390 || width === 1280 || width === 1440) {
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.mouse.move(0, 0);
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
      const product = await page.locator('.fv-browser').boundingBox();
      assert.ok(product.y < height * .85, `Product should appear in the first fold at ${width}`);
      if (captureBenefits || captureIaOnly) {
        // Crop the full-page capture so sticky navigation never obscures a tall section.
        const rectangles = await page.evaluate(() => ['recursos', 'analises-destaque', 'ia-destaque'].map(id => {
          const box = document.getElementById(id).getBoundingClientRect();
          return { id, x: Math.ceil(box.left), y: Math.ceil(box.top), width: Math.floor(box.width), height: Math.floor(box.height) };
        }));
        const fullPage = await page.screenshot({ fullPage: true, animations: 'disabled' });
        for (const rect of rectangles.filter(rect => captureIaOnly ? rect.id === 'ia-destaque' : width === 1440 || rect.id === 'recursos')) {
          const crop = await page.evaluate(async ({ base64, rect }) => {
            const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
            const canvas = document.createElement('canvas'); canvas.width = rect.width; canvas.height = rect.height;
            canvas.getContext('2d').drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
            return canvas.toDataURL('image/png').split(',')[1];
          }, { base64: fullPage.toString('base64'), rect });
          await fs.writeFile(`${output}/${rect.id}-${width}.png`, Buffer.from(crop, 'base64'));
        }
      } else {
        await page.screenshot({ path: `${output}/landing-${width}-full.png`, fullPage: true, animations: 'disabled' });
        await page.screenshot({ path: `${output}/landing-${width}-hero.png`, animations: 'disabled' });
      }
    }
    results.push({ width, height, heroComposition: 'CONYEST: centered title and CTAs, wide dashboard below', dashboardWidth: composition.product.width, featureHierarchy: 'Expense analysis and IA first; both full width', analyticsGalleryLink: 'passed', iaAutomaticFieldsAndThreeItems: 'passed', iaFlowAnchor: 'passed', iaIllustrationHasNoProcessingForm: true, horizontalOverflow: false, navigation: 'passed', productPicker: '6 demo screens passed', faqKeyboard: 'passed' });
  }
  // Marketing stays petroleum even with the light application theme saved.
  await page.evaluate(() => { localStorage.setItem('financecontrol-theme', 'light'); });
  await page.reload();
  await page.locator('html.light').waitFor();
  const palette = await page.locator('.fv-landing').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, foreground: getComputedStyle(el).color }));
  assert.equal(palette.background, 'rgb(7, 16, 18)');
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
