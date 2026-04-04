const CONFIG = {
  spreadsheetId: '',
  sheetName: 'Endorsement Submissions',
  notifyEmail: 'campaign@example.org',
  allowedType: 'endorsement',
  allowedModes: ['organization', 'individual'],
  requiredFields: ['type', 'name', 'email', 'submitted_at', 'endorsement_mode', 'secondary_label', 'secondary_value', 'review_status'],
  sheetHeaders: ['submitted_at', 'endorsement_mode', 'name', 'secondary_label', 'secondary_value', 'email', 'message', 'review_status', 'source_page', 'locale', 'honeypot_status'],
  debugErrors: true
};

function doPost(e) {
  try {
    const payload = parsePayload_(e);

    if (payload.type !== CONFIG.allowedType) {
      return jsonResponse_({ ok: false, error: 'invalid-type' });
    }

    if (payload.honeypot) {
      return jsonResponse_({ ok: false, error: 'spam-blocked' });
    }

    const validationError = validatePayload_(payload);
    if (validationError) {
      return jsonResponse_({ ok: false, error: validationError });
    }

    getTargetSheet_().appendRow(buildRow_(payload));
    sendNotification_(payload);

    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse_(buildErrorResponse_(error));
  }
}

function parsePayload_(e) {
  const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  const payload = JSON.parse(rawBody);
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  return payload;
}

function validatePayload_(payload) {
  for (const fieldName of CONFIG.requiredFields) {
    if (!String(payload[fieldName] || '').trim()) {
      return `missing-${fieldName}`;
    }
  }

  if (!CONFIG.allowedModes.includes(payload.endorsement_mode)) {
    return 'invalid-endorsement-mode';
  }

  if (payload.review_status !== 'pending') {
    return 'invalid-review-status';
  }

  return '';
}

function getTargetSheet_() {
  const spreadsheet = getTargetSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.sheetName);
  }

  ensureHeaders_(sheet);
  return sheet;
}

function getTargetSpreadsheet_() {
  if (CONFIG.spreadsheetId) {
    return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No active spreadsheet. Set CONFIG.spreadsheetId or bind this script to a spreadsheet.');
  }

  return spreadsheet;
}

function ensureHeaders_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, CONFIG.sheetHeaders.length);
  const currentHeaders = headerRange.getValues()[0];
  const hasHeaders = currentHeaders.some(cell => String(cell || '').trim());

  if (!hasHeaders) {
    headerRange.setValues([CONFIG.sheetHeaders]);
  }
}

function buildRow_(payload) {
  return [
    payload.submitted_at || '',
    payload.endorsement_mode || '',
    payload.name || '',
    payload.secondary_label || '',
    payload.secondary_value || '',
    payload.email || '',
    payload.message || '',
    payload.review_status || 'pending',
    payload.source_page || '',
    payload.locale || '',
    'clear'
  ];
}

function sendNotification_(payload) {
  if (!CONFIG.notifyEmail) return;

  const subject = `[RM] New ${payload.endorsement_mode || 'endorsement'} endorsement`;
  const body = [
    'A new endorsement submission has arrived.',
    '',
    `Submitted: ${payload.submitted_at || ''}`,
    `Mode: ${payload.endorsement_mode || ''}`,
    `Name: ${payload.name || ''}`,
    `${payload.secondary_label || 'Additional info'}: ${payload.secondary_value || ''}`,
    `Email: ${payload.email || ''}`,
    payload.message ? `Message: ${payload.message}` : '',
    `Review status: ${payload.review_status || 'pending'}`,
    payload.source_page ? `Source page: ${payload.source_page}` : '',
    payload.locale ? `Locale: ${payload.locale}` : ''
  ].filter(Boolean).join('\n');

  MailApp.sendEmail(CONFIG.notifyEmail, subject, body);
}

function buildErrorResponse_(error) {
  const detail = error && error.message ? String(error.message) : 'Unknown error';
  const response = { ok: false, error: 'server-error' };

  if (CONFIG.debugErrors) {
    response.detail = detail;
  }

  return response;
}

function testEndorsementWrite() {
  const payload = {
    type: 'endorsement',
    endorsement_mode: 'organization',
    name: 'Test Organization',
    secondary_label: 'Contact person',
    secondary_value: 'Test Contact',
    email: 'test@example.com',
    message: 'Test write from Apps Script editor',
    review_status: 'pending',
    source_page: 'endorse',
    locale: 'en',
    honeypot: '',
    submitted_at: new Date().toISOString()
  };

  const validationError = validatePayload_(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  getTargetSheet_().appendRow(buildRow_(payload));
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}