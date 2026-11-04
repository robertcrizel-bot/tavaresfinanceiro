import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Crops only existing genuine DEMO screenshots at 2x native pixel resolution. No backend or generated UI.
const SCALE = 2;
const crops = [
  { name: 'analises-overview', source: 'analises', x: 584, y: 324, width: 826, height: 990 },
  { name: 'analises-categorias', source: 'analises', x: 584, y: 324, width: 406, height: 535 },
  { name: 'dashboard-content', source: 'dashboard', x: 260, y: 75, width: 1160, height: 1220 },
  // Crop only the empty black area outside the real credit-card outline.
  { name: 'contas-detail', source: 'contas-detail', x: 18, y: 0, width: 332, height: 368 },
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const crop of crops) {
    const source = await fs.readFile(`public/landing/${crop.source}.webp`);
    const data = await page.evaluate(async ({ crop, source, scale }) => {
      const image = await createImageBitmap(await (await fetch(`data:image/webp;base64,${source}`)).blob());
      if ((crop.x + crop.width) * scale > image.width || (crop.y + crop.height) * scale > image.height) throw Error('Crop exceeds source');
      const canvas = document.createElement('canvas');
      canvas.width = crop.width * scale; canvas.height = crop.height * scale;
      canvas.getContext('2d').drawImage(image, crop.x * scale, crop.y * scale, crop.width * scale, crop.height * scale, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', .98).split(',')[1];
    }, { crop, source: source.toString('base64'), scale: SCALE });
    await fs.writeFile(`public/landing/${crop.name}.webp`, Buffer.from(data, 'base64'));
    console.log(`${crop.name}.webp: ${crop.width * SCALE} x ${crop.height * SCALE}, cropped from ${crop.source}.webp`);
  }
} finally {
  await browser.close();
}
