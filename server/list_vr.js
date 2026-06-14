const admin = require('firebase-admin');
const serviceAccount = require(process.env.SERVICE_ACCOUNT_PATH || '../service-account-key.json');

try {
  // Some firebase-admin versions export cert at top-level
  const certFn = admin.credential && admin.credential.cert ? admin.credential.cert : (admin.cert || admin);
  admin.initializeApp({ credential: certFn(serviceAccount) });
} catch (e) {
  console.error('init failed', e.message);
  process.exit(1);
}

const db = admin.firestore();

(async () => {
  try {
    const snap = await db.collection('visaAdminRecords').limit(5).get();
    if (snap.empty) {
      console.log('NO_DOCS');
      return;
    }
    snap.forEach(doc => console.log('DOC', doc.id, JSON.stringify(doc.data())));
  } catch (err) {
    console.error('ERR', err.message || err);
    process.exit(1);
  }
})();
