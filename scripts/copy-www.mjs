// Web uygulamasını Capacitor'ın paketleyeceği www/ klasörüne kopyalar.
// Build adımı değil — dosyalar olduğu gibi kopyalanır. Repo kökü webDir olamaz:
// Capacitor node_modules/ ve ios/ klasörlerini de uygulamanın içine kopyalardı.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const FILES = [
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'data/words.dat',
  'data/words.json', // DecompressionStream olmayan eski iOS'ta (< 16.4) yedek
];

rmSync('www', { recursive: true, force: true });
mkdirSync('www/data', { recursive: true });
for (const f of FILES) cpSync(f, `www/${f}`);
console.log(`www/ hazır: ${FILES.length} dosya`);
