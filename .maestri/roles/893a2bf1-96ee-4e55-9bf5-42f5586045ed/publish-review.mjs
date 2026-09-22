import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const project = 'D:/ofertapro';
const stage = path.resolve('review-stage');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const manifestPath = path.resolve('review-manifest.json');
if (!process.argv.includes('--apply')) {
  const changes = [];
  for (const relative of ['eslint.config.js', 'scripts/check-account-state.mjs']) {
    if (!fs.existsSync(path.join(stage, relative))) continue;
    const before = fs.existsSync(path.join(project, relative)) ? fs.readFileSync(path.join(project, relative)) : null;
    const after = fs.readFileSync(path.join(stage, relative));
    if (!before || !before.equals(after)) changes.push({ relative, before: before ? hash(before) : null, after: hash(after) });
  }
  for (const entry of fs.readdirSync(path.join(stage, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const source = path.join(entry.parentPath, entry.name);
    const relative = path.relative(stage, source);
    const target = path.join(project, relative);
    const before = fs.existsSync(target) ? fs.readFileSync(target) : null;
    const after = fs.readFileSync(source);
    if (before && before.equals(after)) continue;
    changes.push({ relative, before: before ? hash(before) : null, after: hash(after) });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(changes, null, 2));
  console.log(changes.map(x => x.relative).join('\n'));
} else {
  const changes = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const change of changes) {
    const target = path.resolve(project, change.relative);
    if (!target.startsWith(path.resolve(project) + path.sep)) throw new Error('Invalid target');
    const before = fs.existsSync(target) ? hash(fs.readFileSync(target)) : null;
    if (before !== change.before) throw new Error('File changed since review: ' + change.relative);
    if (hash(fs.readFileSync(path.join(stage, change.relative))) !== change.after) throw new Error('Staged file changed: ' + change.relative);
  }
  for (const change of changes) {
    fs.copyFileSync(path.join(stage, change.relative), path.join(project, change.relative));
  }
  console.log('Applied ' + changes.length + ' reviewed files; existing unrelated files preserved.');
}
