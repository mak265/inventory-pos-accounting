const fs = require('fs');
const path = require('path');

function walkDir(dir, ext) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
      results = results.concat(walkDir(filePath, ext));
    } else if (ext.some(e => file.endsWith(e))) {
      results.push(filePath);
    } 
  }
  return results;
}

const srcDir = path.join(__dirname, 'frontend', 'src');
const files = walkDir(srcDir, ['.vue', '.ts', '.js']);
let totalFixed = 0;

for (const f of files) {
  const buf = fs.readFileSync(f);
  let text = buf.toString('utf8');
  // Replace garbled peso: the bytes C3 A2 E2 80 9A C2 B1 decode to "â‚±" in latin1-as-utf8
  // Also replace the actual string "â‚±" which is what it looks like in the file
  const before = text;
  text = text.replace(/â‚±/g, 'P');
  if (text !== before) {
    fs.writeFileSync(f, text, 'utf8');
    const count = (before.match(/â‚±/g) || []).length;
    console.log(`Fixed ${count} in ${path.basename(f)}`);
    totalFixed += count;
  }
}
console.log(`Done. Total: ${totalFixed} replacements`);
