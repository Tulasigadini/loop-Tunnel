const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const publicDir = path.join(root, 'public');

const distIndex = path.join(distDir, 'index.html');
const distApp = path.join(distDir, 'app.html');
const publicIndex = path.join(publicDir, 'index.html');
const publicPrivacy = path.join(publicDir, 'privacy.html');
const distPrivacy = path.join(distDir, 'privacy.html');
const publicAbout = path.join(publicDir, 'about.html');
const distAbout = path.join(distDir, 'about.html');
const publicContributors = path.join(publicDir, 'contributors.html');
const distContributors = path.join(distDir, 'contributors.html');

if (fs.existsSync(distIndex)) {
  const html = fs.readFileSync(distIndex, 'utf-8');
  if (html.includes('id="root"') || html.includes('assets/index')) {
    fs.writeFileSync(distApp, html, 'utf-8');
    console.log('[Postbuild] Preserved React app as dist/app.html');
  }
}

if (fs.existsSync(publicIndex)) {
  fs.copyFileSync(publicIndex, distIndex);
  console.log('[Postbuild] Restored official website landing page to dist/index.html');
}

if (fs.existsSync(publicPrivacy)) {
  fs.copyFileSync(publicPrivacy, distPrivacy);
  console.log('[Postbuild] Ensured privacy.html in dist/privacy.html');
}

if (fs.existsSync(publicAbout)) {
  fs.copyFileSync(publicAbout, distAbout);
  console.log('[Postbuild] Ensured about.html in dist/about.html');
}

if (fs.existsSync(publicContributors)) {
  fs.copyFileSync(publicContributors, distContributors);
  console.log('[Postbuild] Ensured contributors.html in dist/contributors.html');
}
