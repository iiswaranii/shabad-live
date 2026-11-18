// Adds a web-app manifest and iOS meta tags so the page can be added to a phone's home
// screen and opened full-screen like an app.
const fs = require('node:fs');
const path = require('node:path');
const dist = path.resolve(__dirname, '../dist');
const base = '/shabad-live/';
fs.copyFileSync(path.resolve(__dirname, '../assets/icon.png'), path.join(dist, 'icon.png'));
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'Shabad Live', short_name: 'Shabad Live', start_url: base, scope: base, display: 'standalone',
  background_color: '#FBF8F2', theme_color: '#A9500C', icons: [{ src: `${base}icon.png`, sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
}, null, 2));
const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const tags = [
  `<link rel="manifest" href="${base}manifest.webmanifest">`,
  `<link rel="apple-touch-icon" href="${base}icon.png">`,
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Shabad Live">',
  '<meta name="description" content="Identify the shabad being sung in kirtan and follow the current pangti.">',
].join('\n');
if (!html.includes('rel="manifest"')) html = html.replace('</head>', `${tags}\n</head>`);
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
fs.copyFileSync(htmlPath, path.join(dist, '404.html'));
console.log('web export finalised');
