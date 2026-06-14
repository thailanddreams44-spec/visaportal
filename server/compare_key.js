const fs = require('fs');
const path = require('path');

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const clean = raw.replace(/^\uFEFF/, '');
  return JSON.parse(clean);
};

const curPath = path.join(__dirname, '..', 'service-account-key.json');
const sp2Path = path.join(__dirname, '..', 'sp2_service_account.json');
const cur = readJsonFile(curPath);
const sp2 = readJsonFile(sp2Path);

console.log('cur len', cur.private_key.length);
console.log('sp2 len', sp2.private_key.length);
console.log('cur has CR', cur.private_key.includes('\r'));
console.log('sp2 has CR', sp2.private_key.includes('\r'));
console.log('same key', cur.private_key === sp2.private_key);
console.log('cur startsWith', JSON.stringify(cur.private_key.slice(0, 50)));
console.log('sp2 startsWith', JSON.stringify(sp2.private_key.slice(0, 50)));
console.log('cur endsWith', JSON.stringify(cur.private_key.slice(-50)));
console.log('sp2 endsWith', JSON.stringify(sp2.private_key.slice(-50)));
console.log('same json', JSON.stringify(cur) === JSON.stringify(sp2));

if (cur.private_key !== sp2.private_key) {
  const a = cur.private_key;
  const b = sp2.private_key;
  let diffIndex = -1;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      diffIndex = i;
      break;
    }
  }
  console.log('diff index', diffIndex);
  if (diffIndex >= 0) {
    console.log('cur char', a[diffIndex], a.charCodeAt(diffIndex));
    console.log('sp2 char', b[diffIndex], b.charCodeAt(diffIndex));
    console.log('cur slice', JSON.stringify(a.slice(Math.max(0, diffIndex - 10), diffIndex + 30)));
    console.log('sp2 slice', JSON.stringify(b.slice(Math.max(0, diffIndex - 10), diffIndex + 30)));
  }
}
