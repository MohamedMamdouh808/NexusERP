const fs = require('fs');
const path = require('path');
const dir = 'backend/src/modules/auth/__tests__';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts'));
let count = 0;
files.forEach(f => {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');
  const original = c;
  // Replace specific email addresses with unique ones using Date.now()
  c = c.split("email: 'contract@example.com'").join("email: 'contract-' + Date.now() + '@example.com'");
  c = c.split("email: 'integration@example.com'").join("email: 'integration-' + Date.now() + '@example.com'");
  c = c.split("email: 'roles@example.com'").join("email: 'roles-' + Date.now() + '@example.com'");
  c = c.split("email: 'tenant-a@example.com'").join("email: 'tenant-a-' + Date.now() + '@example.com'");
  c = c.split("email: 'tenant-b@example.com'").join("email: 'tenant-b-' + Date.now() + '@example.com'");
  c = c.split("email: 'rollback@example.com'").join("email: 'rollback-' + Date.now() + '@example.com'");
  c = c.split("email: 'rollback2@example.com'").join("email: 'rollback2-' + Date.now() + '@example.com'");
  c = c.split("email: 'generic@example.com'").join("email: 'generic-' + Date.now() + '@example.com'");
  c = c.split("email: 'shape@example.com'").join("email: 'shape-' + Date.now() + '@example.com'");
  c = c.split("email: 'alice@example.com'").join("email: 'alice-' + Date.now() + '@example.com'");
  c = c.split("email: 'newuser@example.com'").join("email: 'newuser-' + Date.now() + '@example.com'");
  c = c.split("email: 'generic-login@example.com'").join("email: 'generic-login-' + Date.now() + '@example.com'");
  c = c.split("email: 'shape-login@example.com'").join("email: 'shape-login-' + Date.now() + '@example.com'");
  if (c !== original) {
    fs.writeFileSync(p, c);
    count++;
  }
});
console.log('Fixed ' + count + ' files');
