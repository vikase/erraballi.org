/**
 * erraballi.org inbox — Google Apps Script web app owned by Vikas.
 *
 * What it does
 *   GET  ?faces=1          -> {"faces": {"<personId>": "<image url>", ...}}
 *   POST {kind:"face", pid, name, image:"data:image/jpeg;base64,...", by}
 *        -> saves the photo to the Drive folder "erraballi.org faces",
 *           shares it "anyone with the link can view", and records it in the
 *           "Faces" tab. Returns {"ok":true,"url":"..."}.
 *   POST anything else (album form, later "Fix my details")
 *        -> one row in the "Inbox" tab.
 *
 * Setup (one time)
 *   1. script.google.com > New project. Paste this file as Code.gs.
 *   2. Run setup() once and allow the permissions.
 *   3. Deploy > New deployment > Web app.
 *      Execute as: Me. Who has access: Anyone. Deploy. Copy the /exec URL.
 *
 * To remove a photo: delete its row in the "Faces" tab (and the file in Drive).
 */

const MAX_BYTES = 1500000; // the site shrinks photos to about 100 KB; this is a safety limit

function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('erraballi.org inbox');
    ss.getSheets()[0].setName('Faces').appendRow(['personId', 'name', 'url', 'fileId', 'by', 'at']);
    ss.insertSheet('Inbox').appendRow(['at', 'kind', 'json']);
    p.setProperty('SHEET_ID', ss.getId());
  }
  if (!p.getProperty('FOLDER_ID')) {
    p.setProperty('FOLDER_ID', DriveApp.createFolder('erraballi.org faces').getId());
  }
  Logger.log('Sheet: https://docs.google.com/spreadsheets/d/' + p.getProperty('SHEET_ID'));
}

function sheet_(name) {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSheetByName(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const rows = sheet_('Faces').getDataRange().getValues().slice(1);
  const faces = {};
  rows.forEach(r => { if (r[0] !== '' && r[2]) faces[String(r[0])] = r[2]; }); // later rows win
  return json_({ faces: faces });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (d.kind === 'face') return json_(saveFace_(d));
    sheet_('Inbox').appendRow([new Date(), d.kind || d.type || '', JSON.stringify(d).slice(0, 45000)]);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function saveFace_(d) {
  const pid = parseInt(d.pid, 10);
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(d.image || ''));
  if (!(pid >= 0) || !m) return { ok: false, error: 'bad_input' };
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'too_large' };

  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  const stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss');
  const file = folder.createFile(Utilities.newBlob(bytes, 'image/' + m[1], pid + '-' + stamp + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w640';

  sheet_('Faces').appendRow([pid, String(d.name || '').slice(0, 200), url, file.getId(), String(d.by || '').slice(0, 200), new Date()]);
  return { ok: true, url: url };
}
