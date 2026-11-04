import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { chromium } from '@playwright/test';
import * as fixture from './landing-demo/fixture.mjs';

// Screenshot-only server. This entry, aliases and fixtures never join the app build.
// The landing itself labels these captures as DEMO outside the image; never overlay graph data.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = path.join(root, 'landing-demo.local');
const output = path.join(root, 'public/landing');
await fs.mkdir(temporary, { recursive: true });
await fs.mkdir(output, { recursive: true });
const fixturePath = path.join(root, 'scripts/landing-demo/fixture.mjs').replaceAll('\\', '/');
const common = `import * as data from ${JSON.stringify(fixturePath)};
const forbidden = () => { throw new Error('Marketing capture is read only'); };\n`;
const mockSources = {
  FinanceContext: `export const useFinance = () => ({transactions:[...data.previousTransactions,...data.transactions],creditCardInvoices:data.creditCardInvoices,loading:false,addTransaction:forbidden,updateTransaction:forbidden,deleteTransaction:forbidden,closeCardInvoice:forbidden,reopenCardInvoice:forbidden,payCardInvoice:forbidden,reverseCardInvoicePayment:forbidden,refetch:forbidden});`,
  AccountContext: `export const useAccounts = () => ({accounts:data.accounts,creditCards:data.creditCards,loading:false,addAccount:forbidden,updateAccount:forbidden,deleteAccount:forbidden,addCreditCard:forbidden,updateCreditCard:forbidden,deleteCreditCard:forbidden});`,
  CategoryContext: `export const useCategories = () => ({categories:data.categories,loading:false,allCategoryNames:data.categories.map(c=>c.name),getCategoriesByType:type=>data.categories.filter(c=>c.type===type).map(c=>c.name),addCategory:forbidden,updateCategory:forbidden,deleteCategory:forbidden,refetch:forbidden});`,
  ForecastContext: `export const useForecast = () => ({bills:data.bills,payments:data.payments,loading:false,addBill:forbidden,updateBill:forbidden,deleteBill:forbidden,markAsPaid:forbidden,unmarkAsPaid:forbidden,refetch:forbidden});`,
  TransferContext: `export const useTransfers = () => ({transfers:data.transfers,loading:false,addTransfer:forbidden,updateTransfer:forbidden,deleteTransfer:forbidden,refetch:forbidden});`,
  AuthContext: `export const useAuth = () => ({user:null,session:null,loading:false,signIn:forbidden,signUp:forbidden,signOut:forbidden});`,
};
const aliases = [];
for (const [name, source] of Object.entries(mockSources)) {
  const file = path.join(temporary, `${name}.mjs`);
  await fs.writeFile(file, common + source);
  aliases.push({ find: `@/contexts/${name}`, replacement: file });
}
aliases.push({ find: '@', replacement: path.join(root, 'src') });
await fs.writeFile(path.join(temporary, 'index.html'), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FinVision DEMO — captura local</title><div id="root"></div><script type="module" src="./entry.tsx"></script></html>`);
await fs.writeFile(path.join(temporary, 'entry.tsx'), `
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppThemeProvider } from '@/components/AppThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import AppLayout from '@/components/AppLayout';
import Dashboard from '@/pages/Dashboard';
import ExpenseAnalytics from '@/pages/ExpenseAnalytics';
import Records from '@/pages/Records';
import Accounts from '@/pages/Accounts';
import Statements from '@/pages/Statements';
import Forecasts from '@/pages/Forecasts';
import '@/index.css';
const screen = new URLSearchParams(location.search).get('screen') || '/';
createRoot(document.getElementById('root')).render(
 <AppThemeProvider><QueryClientProvider client={new QueryClient()}><TooltipProvider>
 <MemoryRouter initialEntries={[screen]}><Routes><Route element={<AppLayout />}>
 <Route path="/" element={<Dashboard/>}/><Route path="/analises-despesas" element={<ExpenseAnalytics/>}/>
 <Route path="/records" element={<Records/>}/><Route path="/accounts" element={<Accounts/>}/>
 <Route path="/extratos" element={<Statements/>}/><Route path="/forecasts" element={<Forecasts/>}/>
 </Route></Routes></MemoryRouter></TooltipProvider></QueryClientProvider></AppThemeProvider>);
`);
const server = await createServer({
  configFile: false, root, plugins: [react()], resolve: { alias: aliases },
  define: { __BUILD_COMMIT__: JSON.stringify('landing-demo'), __BUILD_TIME__: JSON.stringify(fixture.referenceDate) },
  server: { host: '127.0.0.1', port: 5189, strictPort: true },
});
let browser;
const manifest = { sourceCommit: '650256f', referenceDate: fixture.referenceDate, summary: fixture.summary, captureScale: 2, webpQuality: 0.98, assets: [] };
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, reducedMotion: 'reduce', serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo' });
  const backendRequests = [];
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.hostname.endsWith('supabase.co')) {
      backendRequests.push({ method: request.method(), host: url.hostname });
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(fixture.referenceDate));
  const open = async screen => {
    await page.goto(`http://127.0.0.1:5189/landing-demo.local/index.html?screen=${encodeURIComponent(screen)}`);
    await page.locator('main h1').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Chart geometry must finish its initial animation before raster capture.
    // Capture at native 2x device resolution: do not resample to CSS pixels.
    await page.waitForTimeout(1800);
  };
  const save = async (name, options = {}) => {
    const png = await page.screenshot({ animations: 'disabled', scale: 'device', ...options });
    // Browser-native encoding; no additional image package required.
    const encoded = await page.evaluate(async base64 => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      return { data: canvas.toDataURL('image/webp', .98).split(',')[1], width: bitmap.width, height: bitmap.height };
    }, png.toString('base64'));
    const bytes = Buffer.from(encoded.data, 'base64');
    await fs.writeFile(path.join(output, `${name}.webp`), bytes);
    manifest.assets.push({ name: `${name}.webp`, width: encoded.width, height: encoded.height, bytes: bytes.length });
  };
  const clipElement = async (selector, maxHeight) => {
    const element = page.locator(selector).first();
    await element.scrollIntoViewIfNeeded();
    const box = await element.boundingBox();
    return { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, maxHeight) };
  };
  await page.setViewportSize({ width: 1440, height: 1320 });
  await open('/');
  assert.ok(await page.locator('.recharts-line-curve').count() > 0, 'Dashboard must contain a real rendered chart');
  await save('dashboard');
  await save('dashboard-focus', { clip: await clipElement('.premium-dashboard', 900) });
  await page.setViewportSize({ width: 1440, height: 1850 });
  await open('/analises-despesas');
  await save('analises');
  await save('analises-detail', { clip: await clipElement('.recharts-wrapper', 430) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await save('orcamento-detail', { clip: await clipElement('section:has(> div > h3:text-is("Orçamento × Realizado"))', 760), scale: 'device' });
  await open('/records');
  await save('registros-detail', { clip: await clipElement('table', 360) });
  // Capture the gallery with enough horizontal space to show the Actions column
  // and its buttons. Remove the sidebar only from this marketing illustration.
  await page.setViewportSize({ width: 1780, height: 1100 });
  await page.waitForTimeout(150);
  await save('registros', { clip: await clipElement('main', 1100) });
  await page.waitForTimeout(150);
  const recordsTable = page.locator('table').first();
  const tableBox = await recordsTable.boundingBox();
  const ninthRowBox = await recordsTable.locator('tbody tr').nth(8).boundingBox();
  const actionsHeadBox = await recordsTable.locator('thead th').last().boundingBox();
  const lastActionsBox = await recordsTable.locator('tbody tr').nth(8).locator('td').last().boundingBox();
  assert.ok(tableBox && ninthRowBox && actionsHeadBox && lastActionsBox, 'Records DEMO must render nine rows and the Actions column');
  const right = tableBox.x + tableBox.width;
  assert.ok(actionsHeadBox.x + actionsHeadBox.width <= right + 1, 'Actions heading must fit inside the table');
  assert.ok(lastActionsBox.x + lastActionsBox.width <= right + 1, 'Actions buttons must fit inside the table');
  assert.ok(right <= 1780, 'The full Records table must fit inside the capture viewport');
  const ninthBottom = ninthRowBox.y + ninthRowBox.height;
  await save('registros-focus', {
    clip: {
      x: Math.max(0, tableBox.x - 1),
      y: tableBox.y,
      width: Math.min(1780 - Math.max(0, tableBox.x - 1), right - Math.max(0, tableBox.x - 1) + 2),
      height: Math.ceil(ninthBottom - tableBox.y),
    },
  });
  await page.setViewportSize({ width: 1440, height: 950 });
  await open('/accounts');
  await page.getByRole('tab', { name: 'Cartões', exact: true }).click();
  await save('contas', { clip: { x: 0, y: 0, width: 1440, height: 730 } });
  await save('contas-detail', { clip: await clipElement('main [role="tabpanel"][data-state="active"] .grid > div', 700), scale: 'device' });
  await page.setViewportSize({ width: 1440, height: 1600 });
  await open('/extratos');
  assert.ok(await page.locator('.recharts-pie-sector').count() >= 3, 'Statement donut must contain visible categories');
  await save('extratos');
  // Capture only the full 'Maiores movimentações' card, never the following panel.
  await save('extratos-movimentos', { clip: await clipElement('section:has(> div > h3:text-is("Maiores movimentações"))', 800) });
  await save('categorias-detail', { clip: await clipElement('.recharts-wrapper', 410) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await open('/forecasts');
  await save('previsoes');
  await page.setViewportSize({ width: 390, height: 844 });
  await open('/');
  await save('dashboard-mobile');
  await save('dashboard-mobile-focus', { clip: await clipElement('.premium-stats-grid', 450) });
  assert.deepEqual(errors, [], 'Capture runtime errors');
  assert.deepEqual(backendRequests, [], 'Capture must not attempt backend operations');
  manifest.runtimeErrors = errors;
  manifest.backendRequests = backendRequests;
  await fs.writeFile(path.join(root, 'scripts/landing-demo/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
