const https = require('https');

function requestOnce(cb) {
  const opts = { protocol: 'https:', hostname: 'visaportal-dl1j.onrender.com', path: '/debug/firebase', method: 'GET', timeout: 10000 };
  const req = https.request(opts, res => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => cb(null, res.statusCode, b));
  });
  req.on('error', cb);
  req.end();
}

let attempts = 0;
function tryOnce() {
  attempts++;
  console.log('Attempt', attempts);
  requestOnce((err, status, body) => {
    if (!err) {
      console.log('STATUS', status);
      console.log('BODY', body);
      process.exit(0);
    }
    if (attempts >= 12) {
      console.error('Gave up after', attempts, 'attempts:', err && err.message);
      process.exit(1);
    }
    setTimeout(tryOnce, 5000);
  });
}

tryOnce();
