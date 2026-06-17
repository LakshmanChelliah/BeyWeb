import fs from 'fs';
import path from 'path';

const dir = 'js/game/abilities';
let s = fs.readFileSync('js/game/abilities.js.bak', 'utf8');
s = s.replace(/from '\.\.\//g, "from '../../");
fs.writeFileSync(path.join(dir, 'impl.js'), s);
fs.writeFileSync(path.join(dir, 'index.js'), "export * from './impl.js';\n");

const keep = new Set(['impl.js', 'index.js']);
for (const f of fs.readdirSync(dir)) {
  if (f.endsWith('.js') && !keep.has(f)) {
    fs.unlinkSync(path.join(dir, f));
  }
}
console.log('abilities consolidated to impl.js');
