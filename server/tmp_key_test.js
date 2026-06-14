const fs = require('fs');
const path = require('path');
const { createSign, createVerify } = require('crypto');
const sa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'service-account-key.json'), 'utf8'));
console.log('project', sa.project_id);
console.log('email', sa.client_email);
console.log('len', sa.private_key.length);
console.log('has \r', sa.private_key.includes('\r'));
const sign = createSign('RSA-SHA256');
sign.update('test');
sign.end();
const sig = sign.sign(sa.private_key, 'base64');
console.log('sig len', sig.length);
try {
  const pubkey = sa.private_key.replace('PRIVATE KEY', 'PUBLIC KEY');
  const verify = createVerify('RSA-SHA256');
  verify.update('test');
  verify.end();
  const ok = verify.verify(sa.private_key, sig, 'base64');
  console.log('verify ok with private as pub', ok);
} catch (e) {
  console.error('verify failed', e.message);
}
