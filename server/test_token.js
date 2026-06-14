const path = require('path');
const { GoogleAuth } = require('google-auth-library');
const fetch = globalThis.fetch || require('node-fetch');

(async () => {
  try {
    const serviceAccount = require(path.join(__dirname, '..', 'service-account-key.json'));
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const token = accessTokenResponse?.token || accessTokenResponse;
    console.log('accessToken present:', !!token);
    console.log('accessToken type:', typeof token);
    if (!token) throw new Error('No access token obtained');

    const url = `https://firestore.googleapis.com/v1/projects/${serviceAccount.project_id}/databases/(default)/documents:runQuery`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'visaAdminRecords' }],
        limit: 1,
      },
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    console.log('REST status:', response.status, response.statusText);
    const text = await response.text();
    console.log('REST response:', text.slice(0, 1000));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
