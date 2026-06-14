// Firebase modules require a module-supporting browser and are best loaded over HTTP/S.
// If you open admin.html via file://, use a local server instead.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCBDESuLDHbqKb-g2mSPKrnxmM6Cl1lQEw",
  authDomain: "visaportal-55200.firebaseapp.com",
  projectId: "visaportal-55200",
  storageBucket: "visaportal-55200.firebasestorage.app",
  messagingSenderId: "359907899762",
  appId: "1:359907899762:web:a0da526c31adb0f18245eb"
};

const API_BASE_URL = (window.API_BASE && window.API_BASE.trim())
  ? window.API_BASE
  : ((typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'http://127.0.0.1:3000');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const collectionName = "visaAdminRecords";

const adminForm = document.getElementById("adminForm");
const recordIdInput = document.getElementById("recordId");
const currentPhotoPathInput = document.getElementById("currentPhotoPath");
const nameInput = document.getElementById("name");
const dobInput = document.getElementById("dob");
const nationalityInput = document.getElementById("nationality");
const statusInput = document.getElementById("status");
const passportNumberInput = document.getElementById("passportNumber");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const photoFileInput = document.getElementById("photoFile");
const cancelEditButton = document.getElementById("cancelEdit");
const recordsBody = document.getElementById("recordsBody");
const statusMessage = document.getElementById("statusMessage");
const statusMessageTitle = document.getElementById("statusMessageTitle");
const statusMessageText = document.getElementById("statusMessageText");
const recordCount = document.getElementById("recordCount");

let currentRecords = [];

function showStatus(title, message, isError = false) {
  statusMessage.classList.remove("hidden");
  statusMessage.classList.toggle("govuk-notification-banner--error", isError);
  statusMessage.classList.toggle("govuk-notification-banner--success", !isError);
  statusMessageTitle.textContent = title;
  statusMessageText.textContent = message;
  window.setTimeout(() => {
    statusMessage.classList.add("hidden");
  }, 5000);
}

function resetForm() {
  adminForm.reset();
  recordIdInput.value = "";
  if (currentPhotoPathInput) {
    currentPhotoPathInput.value = "";
  }
  cancelEditButton.classList.add("hidden");
}

async function fetchRecordsFromFirestore() {
  console.log("Fetching records directly from Firestore");
  const recordsQuery = query(collection(db, collectionName), orderBy("name"));
  const snapshot = await getDocs(recordsQuery);
  return snapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));
}

async function fetchRecords() {
  console.log("Fetching records from server API");
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin-records`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server request failed: ${response.status} ${errorText}`);
    }
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.message || 'Unable to load records.');
    }
    currentRecords = Array.isArray(payload.records) ? payload.records : [];
    renderRecords(currentRecords);
  } catch (error) {
    console.error("Unable to fetch records from server API", error);
    showStatus("Warning", `Server API unavailable: ${error.message || error}. Attempting direct Firestore fetch.`, true);
    try {
      currentRecords = await fetchRecordsFromFirestore();
      renderRecords(currentRecords);
      showStatus("Loaded from Firestore", `Loaded ${currentRecords.length} records directly from Firestore.`, false);
    } catch (fallbackError) {
      console.error("Firestore fallback failed", fallbackError);
      showStatus("Error", `Unable to load records: ${fallbackError.message || fallbackError}`, true);
    }
  }
}

async function uploadPhoto(file, currentPath = null) {
  if (!file) return { photoURL: null, photoPath: currentPath };

  const form = new FormData();
  form.append("photo", file);
  if (currentPath) {
    form.append("currentPath", currentPath);
  }

  const response = await fetch(`${API_BASE_URL}/api/upload-photo`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return { photoURL: data.photoURL, photoPath: data.photoPath };
}

function renderRecords(records) {
  recordsBody.innerHTML = "";
  if (!records.length) {
    recordsBody.innerHTML = `<tr><td colspan="10">No records found.</td></tr>`;
    recordCount.textContent = "0 records available.";
    return;
  }

  recordCount.textContent = `${records.length} record${records.length === 1 ? "" : "s"} available.`;

  records.forEach(record => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(record.name)}</td>
      <td>${escapeHtml(record.dob)}</td>
      <td>${escapeHtml(record.nationality)}</td>
      <td>${escapeHtml(record.status)}</td>
      <td>${escapeHtml(record.passportNumber)}</td>
      <td>${record.photoURL ? `<a href="${record.photoURL}" target="_blank">View</a>` : "-"}</td>
      <td>${escapeHtml(record.email)}</td>
      <td>${escapeHtml(record.phone)}</td>
      <td>
        <button class="govuk-button govuk-button--secondary" data-action="edit" data-id="${record.id}" type="button">Edit</button>
        <button class="govuk-button govuk-button--warning" data-action="delete" data-id="${record.id}" type="button">Delete</button>
      </td>
      <td>
        <button class="govuk-button govuk-button--secondary pdf-button" data-action="downloadPdf" data-id="${record.id}" type="button" aria-label="Download PDF for ${escapeHtml(record.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm9 1.5V8h4.5L15 3.5ZM12 13H8v-2h4v2Zm4 4H8v-2h8v2Zm0-4h-2v-2h2v2Z"></path></svg>
          PDF
        </button>
      </td>
    `;
    recordsBody.appendChild(row);
  });
}

function escapeHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/\'/g, "&#039;");
}

function formatDateForPdf(date) {
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

function formatDateForPdfTime(date) {
  const datePart = formatDateForPdf(date);
  const timePart = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

function generateSponsorLicenceNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 9; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getPdfLibrary() {
  const jsPDFClass = window.jspdf?.jsPDF || window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
  if (!jsPDFClass) {
    throw new Error('PDF library is not loaded. Ensure jspdf.umd.min.js is loaded before admin.js.');
  }
  return jsPDFClass;
}

async function fetchImageDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load image: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read image Blob'));
    reader.readAsDataURL(blob);
  });
}

function drawWrappedText(pdf, text, x, y, maxWidth, lineHeight = 6) {
  const lines = pdf.splitTextToSize(String(text), maxWidth);
  lines.forEach((line, index) => pdf.text(line, x, y + index * lineHeight));
  return lines.length;
}

async function createPdfForRecord(record) {
  const jsPDFClass = getPdfLibrary();
  const pdf = new jsPDFClass({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  const now = new Date();
  const validFrom = formatDateForPdf(now);
  const validUntilDate = new Date(now);
  validUntilDate.setFullYear(validUntilDate.getFullYear() + 2);
  const validUntil = formatDateForPdf(validUntilDate);
  const sponsorLicence = generateSponsorLicenceNumber();
  const displayName = record.name || 'Unknown user';
  const passportNumber = record.passportNumber || '-';
  const nationality = record.nationality || '-';
  const status = record.status || '-';
  const filename = `immigration-status-${passportNumber || displayName.replace(/\s+/g, '-').toLowerCase()}.pdf`;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 40;

  let userImageDataUrl = null;
  if (record.photoURL) {
    try {
      userImageDataUrl = await fetchImageDataUrl(record.photoURL);
    } catch (error) {
      console.warn('User image not loaded for PDF:', error.message);
    }
  }

  const renderHeader = (pageNumber) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor('#1d70b8');
    pdf.text('View your immigration status – GOV.UK', 20, 18);
    pdf.setFontSize(9);
    pdf.setTextColor('#6f777b');
    pdf.text('https://view-immigration-status.service.gov.uk/status', 20, 26);
    pdf.text(`${pageNumber}/5`, pageWidth - 20, 18, { align: 'right' });
    pdf.text(formatDateForPdfTime(now), pageWidth - 20, 26, { align: 'right' });
    pdf.setDrawColor(29, 112, 184);
    pdf.setLineWidth(0.8);
    pdf.line(20, 30, pageWidth - 20, 30);
  };

  const renderFirstPage = () => {
    renderHeader(1);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor('#0b0c0c');
    pdf.text('View and prove your immigration status', 20, 44);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(14);
    pdf.text('Your immigration status (eVisa)', 20, 56);

    if (userImageDataUrl) {
      const imageSize = 50;
      pdf.addImage(userImageDataUrl, 'JPEG', pageWidth - 20 - imageSize, 38, imageSize, imageSize);
    }

    const boxY = 68;
    const boxHeight = 70;
    pdf.setFillColor(242, 243, 245);
    pdf.rect(18, boxY, contentWidth, boxHeight, 'F');

    const leftX = 24;
    const rightX = pageWidth / 2 + 5;

    const drawField = (label, value, x, y) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor('#0b0c0c');
      pdf.text(label, x, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.text(String(value), x, y + 6);
    };

    drawField('Name', displayName, leftX, boxY + 10);
    drawField('Date of birth', record.dob || '-', leftX, boxY + 24);
    drawField('Nationality', nationality, leftX, boxY + 38);
    drawField('Status', status, leftX, boxY + 52);

    drawField('Sponsor licence number', sponsorLicence, rightX, boxY + 10);
    drawField('Valid from', validFrom, rightX, boxY + 24);
    drawField('Valid until', validUntil, rightX, boxY + 38);

    let sectionY = boxY + boxHeight + 12;
    pdf.setDrawColor(208, 212, 217);
    pdf.setLineWidth(0.5);
    pdf.line(20, sectionY, pageWidth - 20, sectionY);
    sectionY += 10;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor('#0b0c0c');
    pdf.text('Prove your status', 20, sectionY);
    sectionY += 10;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    drawWrappedText(pdf, `Nationality: ${nationality}`, 20, sectionY, contentWidth);
    drawWrappedText(pdf, `Passport no: ${passportNumber}`, 20, sectionY + 8, contentWidth);
    drawWrappedText(pdf, `Status: ${status}`, 20, sectionY + 16, contentWidth);
    drawWrappedText(pdf, `Valid from: ${validFrom}`, 20, sectionY + 24, contentWidth);
    drawWrappedText(pdf, `Valid until: ${validUntil}`, 20, sectionY + 32, contentWidth);

    pdf.setFontSize(9);
    pdf.setTextColor('#6f777b');
    pdf.text('Generated by Visa Portal Admin', 20, pageHeight - 12);
  };

  const renderTextPage = (pageNumber, heading, lines) => {
    renderHeader(pageNumber);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor('#0b0c0c');
    pdf.text(heading, 20, 48);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    let y = 58;
    lines.forEach((line) => {
      if (!line.trim()) {
        y += 8;
        return;
      }
      const indent = line.startsWith(' ') ? 6 : 0;
      const wrapped = pdf.splitTextToSize(line.trim(), contentWidth - indent - 8);
      wrapped.forEach((textLine) => {
        pdf.text(textLine, 20 + indent, y);
        y += 6;
      });
      y += 2;
    });

    pdf.setFontSize(9);
    pdf.setTextColor('#6f777b');
    pdf.text('Generated by Visa Portal Admin', 20, pageHeight - 12);
  };

  renderFirstPage();

  pdf.addPage();
  renderTextPage(2, 'Get a share code', [
    'share code.',
    '',
    'What you can do in the UK',
    'You can:',
    ' live in the UK',
    ' work - up to 20 hours a week during term time and full-time during the holidays. You must share proof of your term dates with your employer',
    ' work on a placement which is part of the course your student visa is based on',
    ' the work placement must be a compulsory part of your course and assessed as part of your course. Any work is also subject to the restrictions below',
    ' study - with your licensed sponsor, subject to Academic Technology Approval Scheme (ATAS) conditions',
    ' (https://www.gov.uk/guidance/academic-technology-approval-scheme)',
    ' rent somewhere to live in the UK',
    ' use the National Health Service (NHS) in a similar way to permanent UK residents',
    ' access a current account with a bank or building society in the UK',
    ' travel in and out of the country if you can provide a valid passport or travel document - you may not be able to enter the UK without one',
    'When you can start a permanent full-time job'
  ]);

  pdf.addPage();
  renderTextPage(3, 'If you apply for a Skilled Worker visa, you can start', [
    'work in a permanent full-time job up to 3 months before your course completion date.',
    'If you apply for a Graduate visa, you can start work in a permanent full-time job once you have successfully completed your course of study.',
    'All of the following must also apply:',
    ' you are studying full-time at degree level or above with a higher education provider that has a track record of compliance as a student sponsor (https://www.gov.uk/government/publications/register-of-licensed-sponsors-students)',
    ' you made a valid Skilled Worker or Graduate visa application when you had permission as a student',
    ' you are waiting for a decision on your Skilled Worker or Graduate visa application, or the outcome of any administrative review against a refusal',
    'What you cannot do',
    'You cannot:',
    ' access public funds (https://www.gov.uk/government/publications/public-funds--2/public-funds)',
    ' work as a professional sportsperson or sports coach',
    ' work as an entertainer',
    ' work in a position which would fill a permanent full-time vacancy unless you applied for a Skilled Worker or Graduate visa',
    ' run a business or be self-employed - unless you have applied for a start-up visa',
    ' study at a state school or academy'
  ]);

  pdf.addPage();
  renderTextPage(4, 'Continuous absence', [
    'If you stay outside the UK without returning for more than 2 years, your permission will normally lapse if it has not yet expired. You will have to apply for a new visa to enter the UK.',
    'Legal basis of status',
    'You have been granted permission to enter or stay in the UK, (also known as Leave to enter or remain) until 27 March 2028.',
    'National Insurance number',
    'You will need to obtain a National Insurance number if you plan to work in the UK. If you have one already, it will show at the top of your immigration status profile. If you do not have a National Insurance number, you must apply for one. You can start work while you are waiting for a National Insurance number if you can prove your right to work to your employer. If it has been more than 8 weeks since you applied for a National Insurance number, call the application helpline.',
    'Keep your details up to date',
    'You must keep your personal details up to date in your UK Visas and Immigration (UKVI) account.',
    'You can check and update the details in your UKVI account including your:'
  ]);

  pdf.addPage();
  renderTextPage(5, 'phone number', [
    ' email address',
    ' home address',
    ' passport or other identity documents, including',
    ' change of name or nationality',
    'If there is an error on your eVisa',
    'If any of the information is wrong, you can report an error with your eVisa.',
    'Before you travel',
    'You may be delayed or denied boarding by carriers if you have not added the passport or identity document you are travelling with to your account.',
    'Use the update your UKVI account details service to add a passport or identity document to your account.',
    'Nationality information',
    'When you add a passport or identity document to your account, the nationality on the newly added document will be displayed on your eVisa.',
    'Finish and leave service (/leave)'
  ]);

  pdf.save(filename);
}

function populateForm(record) {
  recordIdInput.value = record.id;
  nameInput.value = record.name || "";
  dobInput.value = record.dob || "";
  nationalityInput.value = record.nationality || "";
  statusInput.value = record.status || "";
  passportNumberInput.value = record.passportNumber || "";
  emailInput.value = record.email || "";
  phoneInput.value = record.phone || "";
  cancelEditButton.classList.remove("hidden");
  // persist the existing photo key or URL so uploads can reuse it
  if (currentPhotoPathInput) {
    currentPhotoPathInput.value = record.photoPath || record.photoURL || "";
  }
}

async function removeRecord(docId) {
  const record = currentRecords.find(item => item.id === docId);
  if (!record) return;

  try {
    if (record.photoPath) {
      const response = await fetch(`${API_BASE_URL}/api/delete-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: record.photoPath })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare delete failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Unknown error deleting photo");
      }
    }

    await deleteDoc(doc(db, collectionName, docId));
    showStatus("Deleted", "Record and associated photo have been deleted.");
    await fetchRecords();
    resetForm();
  } catch (error) {
    console.error(error);
    showStatus("Error", error.message, true);
  }
}

async function saveRecord(event) {
  event.preventDefault();

  console.log('saveRecord started');

  const item = {
    name: nameInput.value.trim(),
    dob: dobInput.value,
    nationality: nationalityInput.value.trim(),
    status: statusInput.value.trim(),
    passportNumber: passportNumberInput.value.trim(),
    email: emailInput.value.trim(),
    phone: phoneInput.value.trim()
  };

  const existingId = recordIdInput.value;

  const existingRecord = currentRecords.find(r => r.id === existingId);
  // prefer the existing record's stored key or URL for overwrite; fallback to hidden input if needed
  const currentPhotoPath = existingRecord?.photoPath || existingRecord?.photoURL || (currentPhotoPathInput ? currentPhotoPathInput.value : null) || null;
  const file = photoFileInput?.files && photoFileInput.files[0];

  try {
    console.log('saveRecord data before upload', { existingId, item, currentPhotoPath });
    if (file) {
      console.log('Saving record: uploading file, currentPhotoPath=', currentPhotoPath);
      const uploadResult = await uploadPhoto(file, currentPhotoPath);
      console.log('uploadResult', uploadResult);
      item.photoURL = uploadResult.photoURL;
      item.photoPath = uploadResult.photoPath;

      // If upload produced a different key than the previous one, attempt to delete the old object
      const previousKeyOrUrl = existingRecord?.photoPath || existingRecord?.photoURL || null;
      if (previousKeyOrUrl && previousKeyOrUrl !== uploadResult.photoPath) {
        try {
          await fetch(`${API_BASE_URL}/api/delete-photo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: previousKeyOrUrl })
          });
        } catch (e) {
          console.warn('Failed to cleanup old photo at', previousKeyOrUrl, e.message);
        }
      }
    } else if (existingRecord) {
      item.photoURL = existingRecord.photoURL || null;
      item.photoPath = existingRecord.photoPath || null;
    }

    if (existingId) {
      console.log('Updating Firestore doc', existingId, item);
      await setDoc(doc(db, collectionName, existingId), item, { merge: true });
      showStatus("Updated", "Record updated successfully.");
    } else {
      console.log('Adding Firestore doc', item);
      await addDoc(collection(db, collectionName), item);
      showStatus("Saved", "Record added successfully.");
    }

    await fetchRecords();
    resetForm();
  } catch (error) {
    console.error(error);
    showStatus("Error", "Unable to save record. Check console for details.", true);
  }
}

recordsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  const docId = button.dataset.id;

  if (action === "edit") {
    const record = currentRecords.find(item => item.id === docId);
    if (record) {
      populateForm(record);
    }
  }

  if (action === "delete") {
    if (confirm("Delete this record permanently?")) {
      await removeRecord(docId);
    }
  }

  if (action === "downloadPdf") {
    const record = currentRecords.find(item => item.id === docId);
    if (record) {
      const url = `/api/render-pdf?id=${encodeURIComponent(record.id)}`;
      window.open(url, '_blank');
    }
  }
});

adminForm.addEventListener("submit", saveRecord);
cancelEditButton.addEventListener("click", resetForm);

fetchRecords().catch(error => {
  console.error(error);
  showStatus("Error", "Unable to load records. Check console for details.", true);
});
