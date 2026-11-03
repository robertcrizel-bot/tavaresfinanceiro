import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Crops only the existing genuine DEMO screenshots. No backend or generated UI.
const crops = [
  { name: 'analises-overview', source: 'analises', x: 584, y: 324, width: 826, height: 776 },
  { name: 'analises-categorias', source: 'analises', x: 584, y: 324, width: 406, height: 535 },
  { name: 'extratos-movimentos', source: 'extratos', x: 562, y: 755, width: 417, height: 300 },
  { name: 'registros-focus', source: 'registros-detail', x: 102, y: 0, width: 456, height: 360 },
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const crop of crops) {
    const source = await fs.readFile(`public/landing/${crop.source}.webp`);
    const data = await page.evaluate(async ({ crop, source }) => {
      const image = await createImageBitmap(await (await fetch(`data:image/webp;base64,${source}`)).blob());
      if (crop.x + crop.width > image.width || crop.y + crop.height > image.height) throw Error('Crop exceeds source');
      const canvas = document.createElement('canvas');
      canvas.width = crop.width; canvas.height = crop.height;
      canvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      return canvas.toDataURL('image/webp', .92).split(',')[1];
    }, { crop, source: source.toString('base64') });
    await fs.writeFile(`public/landing/${crop.name}.webp`, Buffer.from(data, 'base64'));
    console.log(`${crop.name}.webp: ${crop.width} x ${crop.height}, cropped from ${crop.source}.webp`);
  }
} finally {
  await browser.close();
}
