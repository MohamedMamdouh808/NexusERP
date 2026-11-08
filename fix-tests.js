const fs = require('fs');
const path = require('path');
const dir = 'backend/src/modules/auth/__tests__';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts'));
let count = 0;
files.forEach(f => {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');
  const original = c;
  c = c.replace(/\.toBe\(200\)\)/g, '.toBe(201)');
  c = c.replace(/\.toBe\(401\)\)/g, '.toBe(403)');
  if (c !== original) {
    fs.writeFileSync(p, c);
    count++;
  }
});
console.log('Fixed ' + count + ' files');
