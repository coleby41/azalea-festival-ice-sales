/**
 * ============================================================
 *  PVMC ICE SALES — Google Apps Script
 *  NC Azalea Festival 2026 · Benefiting Appalachia Service Project
 * ============================================================
 *
 *  HOW TO SET UP (do this once):
 *  ─────────────────────────────
 *  1. Go to sheets.google.com → create a new blank spreadsheet
 *     Name it: "PVMC Ice Sales 2026"
 *
 *  2. Click Extensions → Apps Script
 *
 *  3. Delete ALL existing code in the editor, paste this entire file, then Save (Ctrl+S)
 *
 *  4. Run the setup function FIRST before deploying:
 *     - In the function dropdown (top toolbar), select "setupSheet"
 *     - Click the ▶ Run button
 *     - Accept any permission prompts that appear
 *     - You should see a popup: "Setup complete!"
 *
 *  5. Deploy as a Web App:
 *     - Click Deploy → New deployment
 *     - Click the gear ⚙ icon → choose "Web app"
 *     - Description: PVMC Ice Sales API
 *     - Execute as: Me
 *     - Who has access: Anyone
 *     - Click Deploy → Copy the Web App URL
 *
 *  6. Add the URL to the HTML app:
 *     - Open ice-sales-app.html in a text editor
 *     - Find the line:  const SHEET_URL = '';
 *     - Paste your Web App URL between the quotes and save
 *
 *  IMPORTANT: Every time you change this script you must redeploy:
 *     Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy
 * ============================================================
 */


// ── Sheet name ──────────────────────────────────────────────
const SHEET_NAME = 'Orders';

// ── Column positions (1-based) ──────────────────────────────
const C = {
  ORDER_NUM:    1,   // A
  TIMESTAMP:    2,   // B
  PHONE:        3,   // C
  CONTACT:      4,   // D
  VENDOR:       5,   // E
  BAGS:         6,   // F
  PRICE_PER:    7,   // G
  TOTAL:        8,   // H
  IS_FESTIVAL:  9,   // I
  PAYMENT:      10,  // J
  STATUS:       11,  // K
  TAKEN_BY:     12,  // L
  LAST_UPDATED: 13,  // M
};

const HEADERS = [
  'Order #', 'Timestamp', 'Phone', 'Contact Name', 'Vendor Name',
  'Bags', 'Price/Bag ($)', 'Total ($)', 'Festival Office?',
  'Payment', 'Status', 'Taken By', 'Last Updated'
];

const STATUS_COLORS = {
  'Pending':   '#FEF3C7',
  'Preparing': '#DBEAFE',
  'Delivered': '#D0F0E3',
  'Cancelled': '#FDE8E8',
};


// ============================================================
//  doPost  ─  Receives new orders and updates from the app
// ============================================================
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action || 'newOrder';

    if (action === 'newOrder')     return respond(newOrder(data));
    if (action === 'updateStatus') return respond(updateStatus(data.orderNum, data.status));
    if (action === 'updateOrder')  return respond(updateOrder(data));
    if (action === 'deleteOrder')  return respond(deleteOrder(data.orderNum));

    return respond({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}


// ============================================================
//  doGet  ─  Returns all orders for the dashboard
// ============================================================
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'getOrders';
    if (action === 'getOrders') return respond({ ok: true, orders: getAllOrders() });
    return respond({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}


// ============================================================
//  NEW ORDER
// ============================================================
function newOrder(data) {
  const sheet = getSheet();
  const now   = new Date();

  // Auto-increment order number
  const lastRow  = sheet.getLastRow();
  const orderNum = lastRow < 2
    ? 1
    : Number(sheet.getRange(lastRow, C.ORDER_NUM).getValue()) + 1;

  sheet.appendRow([
    orderNum,
    formatDate(now),
    data.phone       || '',
    data.contactName || '',
    data.vendorName  || '',
    Number(data.bags)        || 0,
    Number(data.pricePerBag) || 10,
    Number(data.total)       || 0,
    data.isFestival ? 'Yes' : 'No',
    data.payment === 'credit' ? 'Credit' : 'Pay Now',
    'Pending',
    data.takenBy     || '',
    formatDate(now),
  ]);

  styleRow(sheet, sheet.getLastRow(), 'Pending');
  return { ok: true, orderNum };
}


// ============================================================
//  UPDATE STATUS ONLY
// ============================================================
function updateStatus(orderNum, status) {
  const sheet  = getSheet();
  const rowIdx = findRow(sheet, orderNum);
  if (!rowIdx) return { ok: false, error: 'Order not found: ' + orderNum };

  const clean = capitalize(status);
  sheet.getRange(rowIdx, C.STATUS).setValue(clean);
  sheet.getRange(rowIdx, C.LAST_UPDATED).setValue(formatDate(new Date()));
  styleRow(sheet, rowIdx, clean);

  return { ok: true };
}


// ============================================================
//  UPDATE FULL ORDER (from edit modal)
// ============================================================
function updateOrder(data) {
  const sheet  = getSheet();
  const rowIdx = findRow(sheet, data.orderNum);
  if (!rowIdx) return { ok: false, error: 'Order not found: ' + data.orderNum };

  sheet.getRange(rowIdx, C.PHONE).setValue(data.phone        || '');
  sheet.getRange(rowIdx, C.CONTACT).setValue(data.contactName || '');
  sheet.getRange(rowIdx, C.VENDOR).setValue(data.vendorName   || '');
  sheet.getRange(rowIdx, C.BAGS).setValue(Number(data.bags)         || 0);
  sheet.getRange(rowIdx, C.PRICE_PER).setValue(Number(data.pricePerBag) || 10);
  sheet.getRange(rowIdx, C.TOTAL).setValue(Number(data.total)       || 0);
  sheet.getRange(rowIdx, C.IS_FESTIVAL).setValue(data.isFestival ? 'Yes' : 'No');
  sheet.getRange(rowIdx, C.PAYMENT).setValue(data.payment === 'credit' ? 'Credit' : 'Pay Now');
  sheet.getRange(rowIdx, C.TAKEN_BY).setValue(data.takenBy   || '');
  sheet.getRange(rowIdx, C.LAST_UPDATED).setValue(formatDate(new Date()));

  return { ok: true };
}


// ============================================================
//  DELETE ORDER
// ============================================================
function deleteOrder(orderNum) {
  const sheet  = getSheet();
  const rowIdx = findRow(sheet, orderNum);
  if (!rowIdx) return { ok: false, error: 'Order not found: ' + orderNum };

  sheet.deleteRow(rowIdx);
  return { ok: true };
}


// ============================================================
//  GET ALL ORDERS
// ============================================================
function getAllOrders() {
  const sheet = getSheet();
  const last  = sheet.getLastRow();
  if (last < 2) return [];

  const data = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();

  return data
    .filter(row => row[C.ORDER_NUM - 1] !== '')
    .map(row => ({
      num:         row[C.ORDER_NUM    - 1],
      time:        row[C.TIMESTAMP    - 1],
      phone:       row[C.PHONE        - 1],
      contactName: row[C.CONTACT      - 1],
      vendorName:  row[C.VENDOR       - 1],
      bags:        row[C.BAGS         - 1],
      pricePerBag: row[C.PRICE_PER    - 1],
      total:       row[C.TOTAL        - 1],
      isFestival:  row[C.IS_FESTIVAL  - 1] === 'Yes',
      payment:     row[C.PAYMENT      - 1] === 'Credit' ? 'credit' : 'pay-now',
      status:      (row[C.STATUS      - 1] || 'Pending').toLowerCase(),
      takenBy:     row[C.TAKEN_BY     - 1],
    }))
    .reverse();
}


// ============================================================
//  HELPERS
// ============================================================

function getSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    setupHeaders(sheet);
  }
  return sheet;
}

function findRow(sheet, orderNum) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const nums = sheet.getRange(2, C.ORDER_NUM, last - 1, 1).getValues();
  for (let i = 0; i < nums.length; i++) {
    if (Number(nums[i][0]) === Number(orderNum)) return i + 2;
  }
  return null;
}

function setupHeaders(sheet) {
  const r = sheet.getRange(1, 1, 1, HEADERS.length);
  r.setValues([HEADERS]);
  r.setBackground('#1A2744');
  r.setFontColor('#FFFFFF');
  r.setFontWeight('bold');
  r.setFontSize(11);
  sheet.setFrozenRows(1);

  const widths = [80, 160, 130, 150, 180, 60, 100, 100, 120, 100, 110, 130, 160];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

function styleRow(sheet, rowIdx, status) {
  const bg  = STATUS_COLORS[status] || '#FFFFFF';
  const rng = sheet.getRange(rowIdx, 1, 1, HEADERS.length);
  rng.setBackground(bg);
  rng.setFontSize(10);
  rng.setVerticalAlignment('middle');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MM/dd/yyyy HH:mm:ss');
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
//  SETUP — Run this manually ONE TIME before deploying
// ============================================================
function setupSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    setupHeaders(sheet);
    Logger.log('Orders sheet created.');
  } else {
    const existing = sheet.getRange(1, 1).getValue();
    if (!existing) setupHeaders(sheet);
    Logger.log('Orders sheet already exists.');
  }

  SpreadsheetApp.getUi().alert(
    '✅ Setup complete!\n\n' +
    'The Orders sheet is ready.\n\n' +
    'Next: Deploy → New deployment → Web app\n' +
    '(Execute as: Me | Access: Anyone)'
  );
}