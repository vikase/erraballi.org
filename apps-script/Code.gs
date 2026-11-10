/**
 * erraballi.org inbox — Google Apps Script web app owned by Vikas.
 * The sheet "erraballi.org inbox" is private to Vikas. Emails and phone numbers stay in it and never go to the site.
 *
 * What it does
 *   GET  ?faces=1  -> {"faces": {"<personId>": "<image url>"},
 *                      "values": {"<personId>": {"bday":..,"city":..,"occ":..}}, answers sent through the site
 *                                  (latest applied row per field in "Details"). The site shows these over
 *                                  data/people.psv. Not the whole master sheet: its raw text is not cleaned.
 *                      "asked": {"<personId>": ["bday","city","occ"]},  fields someone already sent (not the values)
 *                      "reach": [<personId>, ...]}                       people who said relatives can message them
 *   GET  ?people=1 -> the people list as text, in the same format as data/people.psv, built from the master
 *                     sheet "Family tree master (erraballi.org)", tab People. The site reads this first, so a hand
 *                     edit in the sheet shows on the site within about 5 minutes. Birthdays are tidied ("Mar 24, no
 *                     year" -> "Mar 24"); "|" and line breaks in a cell become spaces.
 *   POST {kind:"face", pid, name, image:"data:image/jpeg;base64,...", by}
 *        -> saves the photo to the Drive folder "erraballi.org faces" and records it in the "Faces" tab.
 *   POST {kind:"details", by, byName, people:[{pid, name, bday, city, occ, web, about, ask, note, email, phone, canMessage}]}
 *        web (website), about (one line) and ask ("ask me about") are kept only when the person sends them about
 *        themselves (pid == by). They go to the master sheet columns Website, About and Ask me about. No LinkedIn links.
 *        -> one row per field in the "Details" tab. Birthday, city and work also go straight into the master
 *           sheet "Family tree master (erraballi.org)", tab People, so they show on the site at once. A relative
 *           does not overwrite a field that the person set about themselves. The old value is kept in "Details".
 *           Notes ("anything to correct") stay in "Details" for a person to read. Email, phone and canMessage are kept only when the
 *           person sends them about themselves (pid == by); they go to the "Contacts" tab (one row per person).
 *   POST {kind:"message", to, from, fromName, replyEmail, replyPhone, text}
 *        -> emails the message to the person (if they allowed messages). The sender never sees the address.
 *           If the person gave a phone only, the message goes to Vikas to pass on. Logged in "Messages".
 *   POST anything else (album form, story form) -> one row in the "Inbox" tab.
 *   Evening digest: dailyDigest() runs about 8 PM New York time and emails the owner one list of the day's
 *        changes (details with old and new values, photos, contact updates, messages, forms). No email on a quiet
 *        day. Run testDigest() to get a [TEST] copy of the last 7 days.
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
 * To undo a wrong answer: fix the cell in the master sheet. The "Details" tab shows the old value (oldValue).
 */

const MAX_BYTES = 1500000;      // the site shrinks photos to about 100 KB; this is a safety limit
const MAX_MESSAGES_PER_DAY = 40; // all senders together; protects the email quota from abuse
const MASTER_ID = '1pY4EbZRVKolImll693VJv02XRCT3_c8khBLVvlOmses'; // "Family tree master (erraballi.org)"
const MASTER_COLS = { bday: 'Birthday', city: 'Current city', occ: 'Occupation', web: 'Website', about: 'About', ask: 'Ask me about' }; // header names in tab People
const SELF_ONLY = ['web', 'about', 'ask']; // only the person can set these, about themselves
const FIELD_MAX = { note: 1000, web: 200, about: 200, ask: 150 };
// data/people.psv column -> master sheet header. Keep this order: it is the order of the columns on the site.
const PSV_COLS = [['id', 'ID'], ['name', 'Name'], ['rel', 'Relationship to Vikas'], ['born', 'Birth year'],
  ['died', 'Death year'], ['places', 'Places'], ['occ', 'Occupation'], ['city', 'Current city'], ['gen', 'Gen'],
  ['parents', 'Parent IDs'], ['spouses', 'Spouse IDs'], ['bday', 'Birthday'], ['title', 'Title'],
  ['web', 'Website'], ['about', 'About'], ['ask', 'Ask me about']];
const TABS = {
  Faces: ['personId', 'name', 'url', 'fileId', 'by', 'at'],
  Inbox: ['at', 'kind', 'json'],
  Details: ['at', 'personId', 'name', 'field', 'value', 'sentById', 'sentByName', 'oldValue', 'applied'],
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
  ensureDigestTrigger_(); // evening digest email, about 8 PM New York time
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
  if (e && e.parameter && e.parameter.people) {
    return ContentService.createTextOutput(peoplePsv_()).setMimeType(ContentService.MimeType.TEXT);
  }
  const faces = {};
  rows_('Faces').forEach(r => { if (r[0] !== '' && r[2]) faces[String(r[0])] = r[2]; }); // later rows win
  const asked = {};
  rows_('Details').forEach(r => {
    const id = String(r[1]), f = String(r[3]);
    if (id === '' || !/^(bday|city|occ)$/.test(f)) return;
    (asked[id] = asked[id] || []).indexOf(f) < 0 && asked[id].push(f);
  });
  const values = {};
  rows_('Details').forEach(r => { // later rows win
    const id = String(r[1]), f = String(r[3]);
    if (id === '' || !/^(bday|city|occ|web|about|ask)$/.test(f) || String(r[8]) !== 'yes') return;
    (values[id] = values[id] || {})[f] = String(r[4]);
  });
  const reach = rows_('Contacts').filter(r => r[4] === true && (r[2] || r[3])).map(r => Number(r[0]));
  return json_({ faces: faces, asked: asked, reach: reach, values: values });
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
    ['bday', 'city', 'occ', 'web', 'about', 'ask', 'note'].forEach(f => {
      let v = str_(x[f], FIELD_MAX[f] || 120);
      if (!v) return;
      if (SELF_ONLY.indexOf(f) >= 0 && pid !== by) return; // website, about and ask: only about yourself
      if (f === 'web') {
        if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
        if (!/^https?:\/\/[^\s\/]+\.[^\s]+$/i.test(v) || /linkedin\.com/i.test(v)) return;
      }
      let old = '', applied = 'note';
      if (f !== 'note') {
        const self = pid === by, selfSet = !self && setBySelf_(pid, f);
        if (selfSet) applied = 'no: the person set it';
        else { const r = writeMaster_(pid, f, v); old = r.old; applied = r.ok ? 'yes' : 'no: ' + r.error; }
      }
      det.appendRow([now, pid, name, f, v, by >= 0 ? by : '', byName, old, applied]);
      det.getRange(det.getLastRow(), 5).setNumberFormat('@').setValue(v); n++; // keep "Feb 18" as text
    });
    // Contact details only from the person themselves.
    if (pid === by && (x.email || x.phone || x.canMessage !== undefined)) {
      saveContact_(pid, name, str_(x.email, 120), str_(x.phone, 40), x.canMessage === true);
      n++;
    }
  });
  return { ok: true, saved: n };
}

// True if the person already sent this field about themselves.
function setBySelf_(pid, f) {
  return rows_('Details').some(r => Number(r[1]) === pid && String(r[3]) === f && Number(r[5]) === pid && String(r[8]) === 'yes');
}
function masterSheet_() { return SpreadsheetApp.openById(MASTER_ID).getSheetByName('People'); }
const MONTHS_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Mar 24, no year" / "March 24" / "24 Mar" / a date cell -> "Mar 24". Unknown text is kept as it is.
function tidyBday_(v, shown) {
  if (v instanceof Date) return MONTHS_[v.getMonth()] + ' ' + v.getDate();
  let t = String(shown || v || '').replace(/,?\s*no year/i, '').trim();
  let m = /^([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2})?(?:st|nd|rd|th)?(?:,?\s*\d{4})?$/.exec(t);
  if (!m) { const k = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*/.exec(t); if (k) m = [t, k[2], k[1]]; }
  if (!m) return t;
  const mon = m[1].charAt(0).toUpperCase() + m[1].slice(1, 3).toLowerCase();
  return MONTHS_.indexOf(mon) < 0 ? t : (m[2] ? mon + ' ' + Number(m[2]) : mon);
}
// The whole people list, as data/people.psv text. Cached for 5 minutes; an answer from the site clears it.
function peoplePsv_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('psv');
  if (hit) return hit;
  const rng = masterSheet_().getDataRange(), vals = rng.getValues(), shown = rng.getDisplayValues(), head = shown[0];
  const cols = PSV_COLS.map(([k, h]) => [k, head.indexOf(h)]);
  const clean = x => String(x).replace(/[|\r\n]+/g, ' ').trim();
  const lines = [PSV_COLS.map(c => c[0]).join('|')];
  for (let i = 1; i < shown.length; i++) {
    const idC = cols[0][1];
    if (idC < 0 || shown[i][idC] === '') continue;
    lines.push(cols.map(([k, c]) => c < 0 ? '' : k === 'bday' ? clean(tidyBday_(vals[i][c], shown[i][c])) : clean(shown[i][c])).join('|'));
  }
  const out = lines.join('\n') + '\n';
  if (out.length < 95000) cache.put('psv', out, 300);
  return out;
}
function writeMaster_(pid, f, v) {
  try {
    const sh = masterSheet_(), data = sh.getDataRange().getValues(), head = data[0];
    const idC = head.indexOf('ID'), c = head.indexOf(MASTER_COLS[f]);
    if (idC < 0 || c < 0) return { ok: false, error: 'column missing' };
    for (let i = 1; i < data.length; i++) {
      if (Number(data[i][idC]) === pid) {
        const old = String(data[i][c]);
        sh.getRange(i + 1, c + 1).setNumberFormat('@').setValue(v);
        CacheService.getScriptCache().remove('psv');
        return { ok: true, old: old };
      }
    }
    return { ok: false, error: 'person not found' };
  } catch (err) { return { ok: false, error: String(err).slice(0, 100) }; }
}
function saveContact_(pid, name, email, phone, canMessage) {
  const sh = sheet_('Contacts');
  const rows = sh.getDataRange().getValues();
  let at = -1;
  for (let i = 1; i < rows.length; i++) if (Number(rows[i][0]) === pid) at = i + 1;
  const old = at > 0 ? rows[at - 1] : null;
  const row = [pid, name, email || (old ? old[2] : ''), phone || (old ? old[3] : ''), canMessage, new Date()];
  if (at > 0) sh.getRange(at, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  // No email here: the evening digest lists contact updates.
}

// ---- Evening digest: one email a day to the owner, only on days with changes. ----
// setup() makes a trigger that runs dailyDigest() at about 8 PM New York time.
// To test: run testDigest() in the editor. It sends the last 7 days and does not move the "last sent" time.
function dailyDigest() { digest_(false); }
function testDigest() { digest_(true); }

function digest_(test) {
  const p = PropertiesService.getScriptProperties();
  const now = new Date();
  const since = test ? new Date(now - 7 * 864e5) : new Date(Number(p.getProperty('LAST_DIGEST')) || now - 864e5);
  const tz = 'America/New_York', fmt = d => Utilities.formatDate(d, tz, 'MMM d, h:mm a');
  const isNew = d => d instanceof Date && d > since && d <= now;
  const FIELD = { bday: 'birthday', city: 'city', occ: 'work', web: 'website', about: 'about', ask: 'ask me about', note: 'note' };
  const parts = [];
  // Sheets turns "Feb 18" into a date cell; show it as "Feb 18" again.
  const val = v => v instanceof Date ? Utilities.formatDate(v, tz, 'MMM d') : String(v);

  const det = rows_('Details').filter(r => isNew(r[0]));
  if (det.length) parts.push('DETAILS (' + det.length + ')\n' + det.map(r => {
    const who = String(r[6] || 'someone'), f = FIELD[r[3]] || r[3];
    const self = String(r[5]) !== '' && Number(r[5]) === Number(r[1]);
    const change = r[3] === 'note' ? ': "' + val(r[4]) + '"'
      : ' -> "' + val(r[4]) + '"' + (r[7] ? ' (was "' + val(r[7]) + '")' : '') + (r[8] === 'yes' ? '' : ' [not applied: ' + r[8] + ']');
    return '- ' + fmt(r[0]) + '  ' + r[2] + ', ' + f + change + (self ? '' : '  (by ' + who + ')');
  }).join('\n'));

  const faces = rows_('Faces').filter(r => isNew(r[5]));
  if (faces.length) parts.push('PHOTOS (' + faces.length + ')\n' + faces.map(r =>
    '- ' + fmt(r[5]) + '  ' + r[1] + '  ' + r[2]).join('\n'));

  const con = rows_('Contacts').filter(r => isNew(r[5]));
  if (con.length) parts.push('CONTACT DETAILS (' + con.length + ')\n' + con.map(r =>
    '- ' + fmt(r[5]) + '  ' + r[1] + ' (relatives can message: ' + (r[4] === true ? 'yes' : 'no') + ')').join('\n') +
    '\nIf one was not really that person, set canMessage to FALSE in the Contacts tab.');

  const msg = rows_('Messages').filter(r => isNew(r[0]));
  if (msg.length) parts.push('MESSAGES (' + msg.length + ')\n' + msg.map(r =>
    '- ' + fmt(r[0]) + '  ' + r[4] + ' to ' + r[2] + ' (' + r[9] + ')').join('\n'));

  const inbox = rows_('Inbox').filter(r => isNew(r[0]));
  if (inbox.length) parts.push('FORMS (' + inbox.length + ')\n' + inbox.map(r =>
    '- ' + fmt(r[0]) + '  ' + (r[1] || 'form') + ': ' + String(r[2]).slice(0, 300)).join('\n'));

  if (!test) p.setProperty('LAST_DIGEST', String(now.getTime()));
  if (!parts.length && !test) return; // quiet day: no email
  const n = det.length + faces.length + con.length + msg.length + inbox.length;
  MailApp.sendEmail(owner_(), (test ? '[TEST] ' : '') + 'erraballi.org: ' + n + ' change' + (n === 1 ? '' : 's') + ' today',
    (parts.length ? parts.join('\n\n') : 'No changes in the last 7 days.') +
    '\n\nTo undo a change, fix the cell in the master sheet:\nhttps://docs.google.com/spreadsheets/d/' + MASTER_ID +
    '\nInbox sheet (all rows):\nhttps://docs.google.com/spreadsheets/d/' + p.getProperty('SHEET_ID'),
    { name: 'erraballi.org' });
}

function ensureDigestTrigger_() {
  if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyDigest')) return;
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(20).inTimezone('America/New_York').create();
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
