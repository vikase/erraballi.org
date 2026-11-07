/**
 * erraballi.org inbox — Google Apps Script web app owned by Vikas.
 * The sheet "erraballi.org inbox" is private to Vikas. Emails and phone numbers stay in it and never go to the site.
 *
 * What it does
 *   GET  ?faces=1  -> {"faces": {"<personId>": "<image url>"},
 *                      "asked": {"<personId>": ["bday","city","occ"]},  fields someone already sent (not the values)
 *                      "reach": [<personId>, ...]}                       people who said relatives can message them
 *   POST {kind:"face", pid, name, image:"data:image/jpeg;base64,...", by}
 *        -> saves the photo to the Drive folder "erraballi.org faces" and records it in the "Faces" tab.
 *   POST {kind:"details", by, byName, people:[{pid, name, bday, city, occ, note, email, phone, canMessage}]}
 *        -> one row per field in the "Details" tab. Email, phone and canMessage are kept only when the
 *           person sends them about themselves (pid == by); they go to the "Contacts" tab (one row per person).
 *   POST {kind:"message", to, from, fromName, replyEmail, replyPhone, text}
 *        -> emails the message to the person (if they allowed messages). The sender never sees the address.
 *           If the person gave a phone only, the message goes to Vikas to pass on. Logged in "Messages".
 *   POST anything else (album form, story form) -> one row in the "Inbox" tab.
 *
 * Setup (one time)
 *   1. script.google.com > New project. Paste this file as Code.gs.
 *   2. Run setup() once and allow the permissions.
 *   3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy. Copy the /exec URL.
 * Update (after a change to this file)
 *   1. Paste the new file. Run setup() once (it adds missing tabs; allow the new email permission).
 *   2. Deploy > Manage deployments > pencil icon > Version: New version > Deploy. The /exec URL stays the same.
 *
 * To remove a photo: delete its row in the "Faces" tab (and the file in Drive).
 * To stop messages to a person: set canMessage to FALSE in the "Contacts" tab.
 */

const MAX_BYTES = 1500000;      // the site shrinks photos to about 100 KB; this is a safety limit
const MAX_MESSAGES_PER_DAY = 40; // all senders together; protects the email quota from abuse
const TABS = {
  Faces: ['personId', 'name', 'url', 'fileId', 'by', 'at'],
  Inbox: ['at', 'kind', 'json'],
  Details: ['at', 'personId', 'name', 'field', 'value', 'sentById', 'sentByName', 'done'],
  Contacts: ['personId', 'name', 'email', 'phone', 'canMessage', 'updated'],
  Messages: ['at', 'toId', 'toName', 'fromId', 'fromName', 'replyEmail', 'replyPhone', 'text', 'deliveredTo', 'result'],
};

function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('erraballi.org inbox');
    ss.getSheets()[0].setName('Faces');
    p.setProperty('SHEET_ID', ss.getId());
  }
  const ss = SpreadsheetApp.openById(p.getProperty('SHEET_ID'));
  Object.keys(TABS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(TABS[name]);
  });
  if (!p.getProperty('FOLDER_ID')) {
    p.setProperty('FOLDER_ID', DriveApp.createFolder('erraballi.org faces').getId());
  }
  Logger.log('Emails left today: ' + MailApp.getRemainingDailyQuota()); // asks for the email permission
  Logger.log('Sheet: https://docs.google.com/spreadsheets/d/' + p.getProperty('SHEET_ID'));
}

function sheet_(name) {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSheetByName(name);
}
function rows_(name) {
  const sh = sheet_(name);
  return sh ? sh.getDataRange().getValues().slice(1) : [];
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
const str_ = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 200);
const owner_ = () => Session.getEffectiveUser().getEmail();

function doGet(e) {
  const faces = {};
  rows_('Faces').forEach(r => { if (r[0] !== '' && r[2]) faces[String(r[0])] = r[2]; }); // later rows win
  const asked = {};
  rows_('Details').forEach(r => {
    const id = String(r[1]), f = String(r[3]);
    if (id === '' || !/^(bday|city|occ)$/.test(f)) return;
    (asked[id] = asked[id] || []).indexOf(f) < 0 && asked[id].push(f);
  });
  const reach = rows_('Contacts').filter(r => r[4] === true && (r[2] || r[3])).map(r => Number(r[0]));
  return json_({ faces: faces, asked: asked, reach: reach });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (d.kind === 'face') return json_(saveFace_(d));
    if (d.kind === 'details') return json_(saveDetails_(d));
    if (d.kind === 'message') return json_(relay_(d));
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

  sheet_('Faces').appendRow([pid, str_(d.name), url, file.getId(), str_(d.by), new Date()]);
  return { ok: true, url: url };
}

function saveDetails_(d) {
  const by = parseInt(d.by, 10), byName = str_(d.byName), now = new Date();
  const list = Array.isArray(d.people) ? d.people.slice(0, 30) : [];
  const det = sheet_('Details');
  let n = 0;
  list.forEach(x => {
    const pid = parseInt(x.pid, 10);
    if (!(pid >= 0)) return;
    const name = str_(x.name);
    ['bday', 'city', 'occ', 'note'].forEach(f => {
      const v = str_(x[f], f === 'note' ? 1000 : 120);
      if (v) { det.appendRow([now, pid, name, f, v, by >= 0 ? by : '', byName, false]); n++; }
    });
    // Contact details only from the person themselves.
    if (pid === by && (x.email || x.phone || x.canMessage !== undefined)) {
      saveContact_(pid, name, str_(x.email, 120), str_(x.phone, 40), x.canMessage === true);
      n++;
    }
  });
  return { ok: true, saved: n };
}

function saveContact_(pid, name, email, phone, canMessage) {
  const sh = sheet_('Contacts');
  const rows = sh.getDataRange().getValues();
  let at = -1;
  for (let i = 1; i < rows.length; i++) if (Number(rows[i][0]) === pid) at = i + 1;
  const old = at > 0 ? rows[at - 1] : null;
  const row = [pid, name, email || (old ? old[2] : ''), phone || (old ? old[3] : ''), canMessage, new Date()];
  if (at > 0) sh.getRange(at, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  try {
    MailApp.sendEmail(owner_(), 'erraballi.org: ' + name + ' updated their contact details',
      name + ' (person ' + pid + ') sent contact details on family.erraballi.org.\n' +
      'Relatives can message them: ' + (canMessage ? 'yes' : 'no') + '.\n\n' +
      'If this was not really ' + name + ', set canMessage to FALSE in the Contacts tab:\n' +
      'https://docs.google.com/spreadsheets/d/' + PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  } catch (err) {}
}

function relay_(d) {
  const to = parseInt(d.to, 10), text = str_(d.text, 2000), fromName = str_(d.fromName, 100);
  const replyEmail = str_(d.replyEmail, 120), replyPhone = str_(d.replyPhone, 40);
  if (!(to >= 0) || !text || !fromName) return { ok: false, error: 'bad_input' };
  if (!replyEmail && !replyPhone) return { ok: false, error: 'no_reply' };

  const cache = CacheService.getScriptCache(), key = 'msg-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd');
  const count = Number(cache.get(key) || 0);
  if (count >= MAX_MESSAGES_PER_DAY) return { ok: false, error: 'busy' };

  const c = rows_('Contacts').filter(r => Number(r[0]) === to).pop();
  if (!c || c[4] !== true) return { ok: false, error: 'not_reachable' };
  const toName = String(c[1] || 'there');

  const reply = [replyEmail && ('Email: ' + replyEmail), replyPhone && ('Phone or WhatsApp: ' + replyPhone)].filter(Boolean).join('\n');
  const body = text + '\n\n— ' + fromName + '\n' + reply + '\n\n' +
    'This message came through the family tree at family.erraballi.org. ' + fromName + ' cannot see your email address or phone number. ' +
    'To stop these messages, reply to Vikas or ask him to turn them off.';
  let deliveredTo = '', result = 'sent';
  try {
    if (c[2]) {
      deliveredTo = 'person';
      const opts = { name: 'Erraballi family tree' };
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyEmail)) opts.replyTo = replyEmail;
      MailApp.sendEmail(String(c[2]), 'A message from ' + fromName + ' (Erraballi family tree)', 'Hi ' + toName.split(' ')[0] + ',\n\n' + body, opts);
    } else {
      deliveredTo = 'owner';
      MailApp.sendEmail(owner_(), 'Please pass on: message for ' + toName + ' (text ' + c[3] + ')',
        toName + ' gave only a phone number, so this message came to you. Please send it to them by text or WhatsApp at ' + c[3] + '.\n\n' + body);
    }
    cache.put(key, String(count + 1), 21600);
  } catch (err) { result = 'error: ' + err; }
  sheet_('Messages').appendRow([new Date(), to, toName, str_(d.from), fromName, replyEmail, replyPhone, text, deliveredTo, result]);
  return result === 'sent' ? { ok: true } : { ok: false, error: 'send_failed' };
}
