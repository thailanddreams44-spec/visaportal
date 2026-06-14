const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleAuth } = require('google-auth-library');

(async () => {
  try {
    const serviceAccount = require(path.join(__dirname, '..', 'service-account-key.json'));
    const adminApp = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
    const db = getFirestore(adminApp);
    console.log('Initialized Firestore admin app.');

    const snap = await db.collection('visaAdminRecords').limit(1).get();
    console.log('Firestore query succeeded, docs:', snap.size);

    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const token = accessTokenResponse?.token || accessTokenResponse;
    console.log('Access token obtained:', !!token);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
