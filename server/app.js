const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
// Ensure a Resend SMTP API key is available via environment variable.
// Do not hardcode secrets in production; using a fallback here per user request.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_3gzxUj6B_2e4Pds2aM2FaxrRnPGbyA1QQ';
const multer = require("multer");
const session = require('express-session');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleAuth } = require('google-auth-library');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_FILE_PATH = path.join(ROOT_DIR, '.env');
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'service-account.json');

if (fs.existsSync(ENV_FILE_PATH)) {
  const envText = fs.readFileSync(ENV_FILE_PATH, 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) return;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
  console.log('Loaded .env from', ENV_FILE_PATH);
} else {
  console.log('No .env file found at', ENV_FILE_PATH);
}

// If a service account JSON is provided via environment (Render secret), write it
// to the expected service-account.json path so Firebase can initialize normally.
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    fs.writeFileSync(SERVICE_ACCOUNT_PATH, process.env.FIREBASE_SERVICE_ACCOUNT_JSON, { mode: 0o600 });
    console.log('Wrote service account JSON from FIREBASE_SERVICE_ACCOUNT_JSON to', SERVICE_ACCOUNT_PATH);
  } catch (e) {
    console.error('Failed to write service account JSON from env:', e.message);
  }
}

// Support base64-encoded service account JSON as alternative
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
  try {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
    fs.writeFileSync(SERVICE_ACCOUNT_PATH, decoded, { mode: 0o600 });
    console.log('Wrote service account JSON from FIREBASE_SERVICE_ACCOUNT_B64 to', SERVICE_ACCOUNT_PATH);
  } catch (e) {
    console.error('Failed to write service account JSON from FIREBASE_SERVICE_ACCOUNT_B64:', e.message);
  }
}

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCBDESuLDHbqKb-g2mSPKrnxmM6Cl1lQEw';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'visaportal-55200';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Ensure preflight OPTIONS requests are handled explicitly in production
app.options('*', cors({ origin: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: true, optionsSuccessStatus: 204 }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Trust proxy (Render, Cloudflare) so secure cookies work when behind a proxy
app.set('trust proxy', 1);

// Session middleware for OTP storage (in-memory). For production, use a persistent store.
app.use(session({
  name: 'visaportal.sid',
  secret: process.env.SESSION_SECRET || 'change-me-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 10 * 60 * 1000, // 10 minutes
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none'
  }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development', port: PORT });
});

app.get('/api/ping', (req, res) => {
  res.json({ success: true, message: 'pong' });
});

// Temporary debug endpoint to inspect Firebase/service-account availability
app.get('/debug/firebase', async (req, res) => {
  try {
    const fileExists = fs.existsSync(SERVICE_ACCOUNT_PATH);
    const envPresent = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let envLength = envPresent ? process.env.FIREBASE_SERVICE_ACCOUNT_JSON.length : 0;
    let parsed = null;
    let parseError = null;
    if (envPresent) {
      try { parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch (e) { parseError = e.message; }
    }

    const init = await initializeFirebase();
    const initialized = !!init;
    return res.json({ fileExists, envPresent, envLength, parseError, initialized });
  } catch (err) {
    return res.status(500).json({ error: err.message || err.stack });
  }
});

const R2_ACCOUNT_ID = "3e6d434d8424565348aeed8b0adb113e"
const R2_ACCESS_KEY_ID = "ee7f9d024a252eacabe55eaedc7f763c"
const R2_SECRET_ACCESS_KEY = "edd2b4a476eb60f9d13efa9e389cb1554c19c245b343ad9b0bc3e4a6d9c12a54"
const R2_BUCKET_NAME = "visaportal"


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});
const R2_BUCKET = R2_BUCKET_NAME;

let firestore = null;
let serviceAccount = null;
let adminApp = null;
let firebaseInitPromise = null;

// Lazy-load Firebase Admin on first request (faster startup for Render)
async function initializeFirebase() {
  if (firestore) return firestore; // Already initialized
  if (firebaseInitPromise) return firebaseInitPromise; // Initialization in progress
  
  firebaseInitPromise = (async () => {
    try {
      // Prefer parsing service account JSON from env when available (more reliable on Render)
      // Try env JSON first, then base64 env, then file
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
          console.log('Loaded service account from FIREBASE_SERVICE_ACCOUNT_JSON (env).');
        } catch (parseErr) {
          console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', parseErr.message);
        }
      }

      if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
        try {
          const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
          serviceAccount = JSON.parse(decoded);
          console.log('Loaded service account from FIREBASE_SERVICE_ACCOUNT_B64 (env).');
        } catch (parseErr) {
          console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_B64:', parseErr.message);
        }
      }

      if (!serviceAccount) {
        if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
          console.warn(`Service account not found at ${SERVICE_ACCOUNT_PATH}. Firebase disabled.`);
          return null;
        }

        console.log('Loading service account from file:', SERVICE_ACCOUNT_PATH);
        // Use require to load JSON file
        serviceAccount = require(SERVICE_ACCOUNT_PATH);
      }
      console.log('Service account loaded. Initializing Firebase Admin...');

      if (!getApps().length) {
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
        console.log('Firebase app initialized');
        console.log('Firebase project:', serviceAccount.project_id);
      } else {
        adminApp = getApps()[0];
        console.log('Firebase app already initialized');
      }

      firestore = getFirestore(adminApp);
      console.log('Firebase Firestore initialized successfully');
      return firestore;
    } catch (err) {
      console.error('Firebase Admin initialization failed:', err.stack || err.message);
      return null;
    }
  })();

  return firebaseInitPromise;
}

// OTPs are stored in the user's session (in-memory). This avoids filesystem storage.
// Structure: req.session.otps = { "PASSPORT|DOB": { otp: '123456', created: 163... } }

async function getRecordEmail(passportNumber, dob) {
  // Initialize Firebase on first call
  const firestoreDb = await initializeFirebase();
  if (!firestoreDb) {
    throw new Error('Firestore not initialized. Cannot verify record.');
  }

  try {
    const recordsRef = firestoreDb.collection('visaAdminRecords');
    const query = recordsRef.where('passportNumber', '==', passportNumber).limit(5);
    const snapshot = await query.get();
    if (snapshot.empty) {
      return null; // Record not found
    }

    for (const doc of snapshot.docs) {
      const record = doc.data();
      if (String(record.dob || '').trim() === String(dob || '').trim()) {
        return record.email || null;
      }
    }

    return null;
  } catch (err) {
    console.error('Firestore query error:', err.message);
    throw err;
  }
}

function ensureR2Config() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("Missing Cloudflare R2 configuration. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.");
  }
}

app.get("/api/admin-records", async (req, res) => {
  try {
    const fs = await initializeFirebase();
    if (!fs) {
      return res.status(500).json({ success: false, message: 'Firestore is not initialized.' });
    }

    const recordsRef = fs.collection('visaAdminRecords');
    const querySnapshot = await recordsRef.orderBy('name').get();
    const records = querySnapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));
    return res.json({ success: true, records });
  } catch (error) {
    console.error('admin-records error', error);
    if (error.code === 16 || /UNAUTHENTICATED/.test(error.message)) {
      try {
        console.log('Firestore auth failed, using REST fallback for /api/admin-records');
        const fallbackRecords = await fetchFirestoreRecordsViaRest();
        return res.json({ success: true, records: fallbackRecords });
      } catch (restError) {
        console.error('Firestore REST fallback failed', restError);
      }
    }
    return res.status(500).json({ success: false, message: error.message || 'Unable to load records.' });
  }
});

async function getFirestoreAccessToken() {
  // Ensure Firebase is initialized
  await initializeFirebase();
  
  if (!serviceAccount) {
    throw new Error('Service account credentials are not loaded. Cannot obtain Firestore access token.');
  }

  const authOptions = {
    scopes: ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/cloud-platform'],
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
  };

  const auth = new GoogleAuth(authOptions);
  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  const token = accessTokenResponse?.token || accessTokenResponse;

  if (!token) {
    throw new Error('Unable to obtain access token for Firestore REST fallback.');
  }

  return token;
}

async function fetchFirestoreRecordsViaRest() {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'visaAdminRecords' }],
      orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }],
    },
  };

  const accessToken = await getFirestoreAccessToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore REST failed: ${response.status} ${text}`);
  }

  const rows = await response.json();
  const records = [];
  for (const row of rows) {
    if (!row.document) continue;
    const doc = row.document;
    const record = { id: path.basename(doc.name) };
    for (const [field, value] of Object.entries(doc.fields || {})) {
      if (value.stringValue !== undefined) record[field] = value.stringValue;
      else if (value.integerValue !== undefined) record[field] = parseInt(value.integerValue, 10);
      else if (value.doubleValue !== undefined) record[field] = parseFloat(value.doubleValue);
      else if (value.booleanValue !== undefined) record[field] = value.booleanValue;
      else if (value.timestampValue !== undefined) record[field] = value.timestampValue;
      else if (value.mapValue?.fields) {
        record[field] = Object.fromEntries(Object.entries(value.mapValue.fields).map(([k, v]) => [k, v.stringValue || v.integerValue || v.doubleValue || v.booleanValue || v.timestampValue || null]));
      }
    }
    records.push(record);
  }
  return records;
}

function stableSponsorLicence(seed = '') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) >>> 0;
  }
  let result = '';
  for (let i = 0; i < 9; i += 1) {
    result += chars[(hash + i * 17) % chars.length];
  }
  return result;
}

function formatDateForPdf(date) {
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

async function fetchRemoteImageData(url) {
  if (!url || typeof globalThis.fetch !== 'function') return null;
  try {
    const response = await globalThis.fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.warn('fetchRemoteImageData failed', error.message);
    return null;
  }
}

console.log('Registering /api/render-pdf route');
app.get('/api/render-pdf', async (req, res) => {
  try {
    const recordId = req.query.id;
    if (!recordId) {
      return res.status(400).json({ success: false, message: 'Missing record id.' });
    }

    const fs_inst = await initializeFirebase();
    if (!fs_inst) {
      return res.status(500).json({ success: false, message: 'Firestore is not initialized.' });
    }

    const recordRef = fs_inst.collection('visaAdminRecords').doc(recordId);
    const recordSnap = await recordRef.get();
    if (!recordSnap.exists) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }

    const record = recordSnap.data();
    const templatePath = path.join(__dirname, '..', 'GANESHANUK.pdf');
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ success: false, message: 'PDF template not found.' });
    }

    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const pages = pdfDoc.getPages();
    const page = pages[0];
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const displayName = record.name || 'Unknown user';
    const nationality = record.nationality || '-';
    const status = record.status || '-';
    const sponsorLicence = stableSponsorLicence(record.passportNumber || record.id || displayName);

    const now = new Date();
    const validFrom = formatDateForPdf(now);
    const validUntilDate = new Date(now);
    validUntilDate.setFullYear(validUntilDate.getFullYear() + 2);
    const validUntil = formatDateForPdf(validUntilDate);
    const issuedAt = formatDateForPdfTime(now);

    const overlayValues = [
      { value: displayName, x: 250, y: 227, font: helveticaBold, size: 14 },
      { value: record.dob || '-', x: 250, y: 278, font: helveticaBold, size: 12 },
      { value: nationality, x: 250, y: 326, font: helveticaBold, size: 12 },
      { value: status, x: 250, y: 358, font: helveticaBold, size: 12 },
      { value: sponsorLicence, x: 250, y: 389, font: helveticaBold, size: 12 },
      { value: validFrom, x: 250, y: 454, font: helveticaBold, size: 12 },
      { value: validUntil, x: 250, y: 485, font: helveticaBold, size: 12 }
    ];

    overlayValues.forEach((item) => {
      if (item.value) {
        page.drawText(String(item.value), {
          x: item.x,
          y: item.y,
          size: item.size,
          font: item.font,
          color: rgb(0, 0, 0),
        });
      }
    });

    page.drawText(issuedAt, {
      x: 520,
      y: 585,
      size: 8,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();
    const safeName = `${displayName.replace(/[^a-zA-Z0-9-_]/g, '-') || 'visa'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('render-pdf error', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to render PDF.' });
  }
});

app.post("/api/upload-photo", upload.single("photo"), async (req, res) => {
  try {
    ensureR2Config();
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No photo uploaded." });
    }

    let currentPath = req.body.currentPath;
    // If client provided a full URL (old code may have stored photoURL), extract the key
    if (currentPath && typeof currentPath === "string" && currentPath.startsWith("http")) {
      try {
        const parsed = new URL(currentPath);
        // pathname will be like /<bucket>/<key>
        const parts = parsed.pathname.split('/').filter(Boolean);
        const bucketIndex = parts.indexOf(R2_BUCKET);
        if (bucketIndex >= 0 && parts.length > bucketIndex + 1) {
          currentPath = parts.slice(bucketIndex + 1).join('/');
        } else {
          // fallback: take everything after the first slash
          currentPath = parts.slice(1).join('/');
        }
      } catch (e) {
        // leave currentPath as-is if URL parsing fails
      }
    }

    const filename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = currentPath && typeof currentPath === "string" && currentPath.trim()
      ? currentPath
      : `passportPhotos/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${filename}`;

    console.log("upload-photo: using key=", key);

    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const photoURL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${encodeURI(key)}`;
    res.json({ success: true, photoURL, photoPath: key });
  } catch (error) {
    console.error("R2 upload failed", error);
    res.status(500).json({ success: false, message: "Photo upload failed.", error: error.message });
  }
});

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

app.post("/api/delete-photo", async (req, res) => {
  try {
    ensureR2Config();
    let { key } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, message: "Missing photo key" });
    }

    // If a full URL was provided, extract the R2 object key similar to upload handler
    if (typeof key === 'string' && key.startsWith('http')) {
      try {
        const parsed = new URL(key);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const bucketIndex = parts.indexOf(R2_BUCKET);
        if (bucketIndex >= 0 && parts.length > bucketIndex + 1) {
          key = parts.slice(bucketIndex + 1).join('/');
        } else {
          key = parts.slice(1).join('/');
        }
      } catch (e) {
        // continue with original key if parsing fails
      }
    }

    await r2Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }));

    return res.json({ success: true });
  } catch (error) {
    console.error("Photo delete failed", { key: req.body?.key, message: error.message, name: error.name, statusCode: error.$metadata?.httpStatusCode });
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ success: false, message: "Photo not found" });
    }
    return res.status(500).json({ success: false, message: "Unable to delete photo." });
  }
});

app.get('/api/photo', async (req, res) => {
  try {
    ensureR2Config();
    const key = req.query.key;
    if (!key) {
      return res.status(400).send("Missing photo key.");
    }

    const object = await r2Client.send(new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }));

    if (object.ContentType) {
      res.setHeader("Content-Type", object.ContentType);
    }
    if (object.ContentLength) {
      res.setHeader("Content-Length", object.ContentLength);
    }

    const body = object.Body;
    if (body.pipe) {
      body.pipe(res);
    } else {
      const buffer = await streamToBuffer(body);
      res.send(buffer);
    }
  } catch (error) {
    console.error("Photo proxy failed", { key: req.query.key, message: error.message, name: error.name, statusCode: error.$metadata?.httpStatusCode });
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).send("Photo not found.");
    }
    res.status(500).send("Unable to retrieve photo.");
  }
});

app.post("/api/get-email", async (req, res) => {
  try {
    const passportNumber = String(req.body.passportNumber || '').trim();
    const dob = String(req.body.dob || '').trim();
    if (!passportNumber || !dob) {
      return res.status(400).json({ success: false, message: "passportNumber and dob are required" });
    }

    let recipientEmail;
    try {
      recipientEmail = await getRecordEmail(passportNumber, dob);
    } catch (err) {
      console.error('get-email verify record failed', err);
      return res.status(500).json({ success: false, message: "Unable to verify record: " + err.message });
    }

    if (!recipientEmail) {
      return res.status(404).json({ success: false, message: "No record found for this passport number and DOB combination" });
    }

    return res.json({ success: true, email: recipientEmail });
  } catch (error) {
    console.error("get-email error", error);
    res.status(500).json({ success: false, message: "Unable to lookup email", error: error.message });
  }
});

app.post("/api/send-otp", async (req, res) => {
  try {
    const passportNumber = String(req.body.passportNumber || '').trim();
    const dob = String(req.body.dob || '').trim();
    if (!passportNumber || !dob) {
      return res.status(400).json({ success: false, message: "passportNumber and dob are required" });
    }

    let recipientEmail;
    try {
      recipientEmail = await getRecordEmail(passportNumber, dob);
    } catch (err) {
      console.error('send-otp verify record failed', err);
      return res.status(500).json({ success: false, message: "Unable to verify record: " + err.message });
    }
    
    if (!recipientEmail) {
      return res.status(404).json({ success: false, message: "No record found for this passport number and DOB combination" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const transporter = nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: {
        user: "resend",
        pass: process.env.RESEND_API_KEY
      }
    });

    const info = await transporter.sendMail({
      from: "\"Visa Status\" <visas@securevisaportal.com>",
      sender: "visas@securevisaportal.com",
      replyTo: "visas@securevisaportal.com",
      envelope: { from: "visas@securevisaportal.com", to: recipientEmail },
      to: recipientEmail,
      subject: "Your GOV.UK Security Code",
      text: `Your security code is: ${otp}\n\nThis code will expire in 10 minutes. Do not share this code with anyone.`,
      headers: {
        'List-Unsubscribe': '<mailto:postmaster@securevisaportal.com>',
        'X-Mailer': 'Visa Status Portal'
      },
      html: `
        <body style="font-family: Arial, Helvetica, sans-serif; background:#f3f2f1; padding:20px;">
          <div style="max-width:600px; margin:auto; background:#ffffff; border:1px solid #b1b4b6;">
            <div style="background:#1d70b8; color:white; padding:15px 20px;">
              <h2 style="margin:0;">GOV.UK</h2>
            </div>
            <div style="padding:30px;">
              <h1 style="font-size:28px; margin-top:0;">Your GOV.UK Security Code</h1>
              <p style="font-size:18px;">Your security code is:</p>
              <div style="font-size:36px; font-weight:bold; letter-spacing:6px; padding:15px; border-left:5px solid #1d70b8; background:#f8f8f8; margin:20px 0;">
                ${otp}
              </div>
              <p>This code will expire in <strong>10 minutes</strong>.</p>
              <p>Do not share this code with anyone.</p>
              <p>If you did not request this code, you can safely ignore this email.</p>
              <hr>
              <p style="color:#505a5f;">Visa Status Portal</p>
            </div>
          </div>
        </body>
      `
    });

    // Store OTP in session (10 minute expiry enforced at verification)
    try {
      if (!req.session) req.session = {};
      req.session.otps = req.session.otps || {};
      req.session.otps[`${passportNumber}|${dob}`] = { otp: String(otp), created: Date.now() };
    } catch (e) {
      console.warn('Failed to store OTP in session', e.message);
    }
    console.log('send-otp mail info', { to: recipientEmail, messageId: info && info.messageId, accepted: info && info.accepted, rejected: info && info.rejected, response: info && info.response });
    return res.json({ success: true, email: recipientEmail });
  } catch (error) {
    console.error("send-otp error", error);
    res.status(500).json({ success: false, message: "Unable to send OTP", error: error.message });
  }
});

app.post("/api/verify-otp", async (req, res) => {
  try {
    const { passportNumber, dob, otp } = req.body;
    if (!passportNumber || !dob || !otp) {
      return res.status(400).json({ success: false, message: "Missing parameters" });
    }

    // read stored OTP from session and validate
    const key = `${passportNumber}|${dob}`;
    const stored = req.session && req.session.otps && req.session.otps[key];
    if (!stored) {
      return res.json({ success: false, message: "No OTP stored for this passport/DOB" });
    }

    // Check expiry (10 minutes)
    const age = Date.now() - (stored.created || 0);
    if (age > 10 * 60 * 1000) {
      // remove expired
      delete req.session.otps[key];
      return res.json({ success: false, message: "OTP expired" });
    }

    if (String(otp) === String(stored.otp)) {
      // remove OTP after successful verification
      delete req.session.otps[key];
      return res.json({ success: true });
    }

    return res.json({ success: false, message: "Invalid code" });
  } catch (err) {
    console.error('verify-otp error', err);
    res.status(500).json({ success: false, message: 'Internal error' });
  }
});

app.post("/api/send-sharecode-email", async (req, res) => {
  try {
    const { passportNumber, dob, shareCode } = req.body;
    if (!passportNumber || !dob || !shareCode) {
      return res.status(400).json({ success: false, message: "passportNumber, dob, and shareCode are required" });
    }

    let recipientEmail;
    try {
      recipientEmail = await getRecordEmail(passportNumber, dob);
    } catch (err) {
      return res.status(500).json({ success: false, message: "Unable to verify record: " + err.message });
    }
    
    if (!recipientEmail) {
      return res.status(404).json({ success: false, message: "No record found for this passport number and DOB combination" });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: {
        user: "resend",
        pass: process.env.RESEND_API_KEY
      }
    });

    const html = `
      <body style="font-family: Arial, Helvetica, sans-serif; background:#f3f2f1; padding:20px;">
        <div style="max-width:600px; margin:auto; background:#ffffff; border:1px solid #b1b4b6;">
          <div style="background:#1d70b8; color:white; padding:15px 20px;">
            <h2 style="margin:0;">GOV.UK</h2>
          </div>
          <div style="padding:30px;">
            <h1 style="font-size:28px; margin-top:0;">Your Share Code</h1>
            <p style="font-size:18px;">Your share code is:</p>
            <div style="
              font-size:36px;
              font-weight:bold;
              letter-spacing:6px;
              padding:15px;
              border-left:5px solid #1d70b8;
              background:#f8f8f8;
              margin:20px 0;">
              ${shareCode}
            </div>
            <p>Share this code with the person who needs to verify your immigration status.</p>
            <p>They can use this code along with your date of birth (${dob}) to view your status at <strong>www.gov.uk/check-immigration-status</strong>.</p>
            <hr>
            <p style="color:#505a5f;">UK Visa Status Portal</p>
          </div>
        </div>
      </body>
    `;

    const info2 = await transporter.sendMail({
      from: "\"Visa Status\" <visas@securevisaportal.com>",
      sender: "visas@securevisaportal.com",
      replyTo: "visas@securevisaportal.com",
      envelope: { from: "visas@securevisaportal.com", to: recipientEmail },
      to: recipientEmail,
      subject: "Your Immigration Status Share Code",
      text: `Your share code is: ${shareCode}\n\nUse this code with the recipient's date of birth: ${dob}`,
      headers: {
        'List-Unsubscribe': '<mailto:postmaster@securevisaportal.com>',
        'X-Mailer': 'Visa Status Portal'
      },
      html: html
    });

    console.log('send-sharecode-email mail info', { to: recipientEmail, messageId: info2 && info2.messageId, accepted: info2 && info2.accepted, rejected: info2 && info2.rejected, response: info2 && info2.response });

    return res.json({ success: true, email: recipientEmail });
  } catch (error) {
    console.error("send-sharecode-email error", error);
    res.status(500).json({ success: false, message: "Failed to send share code email", error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});