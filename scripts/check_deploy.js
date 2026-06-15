const https = require('https');

function request(opts, data, cb) {
  const req = https.request(opts, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => cb(null, res.statusCode, body, res.headers));
  });
  req.on('error', cb);
  req.setTimeout(20000, () => { req.destroy(new Error('timeout')); });
  if (data) req.write(data);
  req.end();
}

request({ hostname: 'visaportal-dl1j.onrender.com', path: '/health', method: 'GET' }, null, (e, s, b, h) => {
  if (e) {
    console.error('HEALTH ERROR', e.message);
  } else {
    console.log('HEALTH', s);
    console.log('BODY', b);
    console.log('HEADERS', JSON.stringify(h));
  }

  const data = JSON.stringify({ passportNumber: 'TN12345', dob: '1992-08-16' });
  request({ hostname: 'visaportal-dl1j.onrender.com', path: '/api/send-otp', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, data, (e2, s2, b2, h2) => {
    if (e2) {
      console.error('SEND-OTP ERROR', e2.message);
    } else {
      console.log('SEND-OTP', s2);
      console.log('BODY', b2);
      console.log('HEADERS', JSON.stringify(h2));
    }
  });
});
