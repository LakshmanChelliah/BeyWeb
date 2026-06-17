import fs from 'fs';

const constants = fs.readFileSync('js/game/abilities/constants.js', 'utf8');
const names = [...constants.matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
let src = fs.readFileSync('js/game/abilities/shared.js', 'utf8');

if (!src.includes("import * as C from './constants.js'")) {
  src = src.replace(
    "export * from './constants.js';",
    "import * as C from './constants.js';\nexport * from './constants.js';"
  );
}

for (const name of [...names].sort((a, b) => b.length - a.length)) {
  src = src.replace(new RegExp(`(?<!C\\.)\\b${name}\\b`, 'g'), `C.${name}`);
}
src = src.replace(/C\.C\./g, 'C.');
fs.writeFileSync('js/game/abilities/shared.js', src);
console.log('shared.js updated');
