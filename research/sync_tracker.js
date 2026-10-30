// Weekly sync: pulls MBA internship listings (PM, strategy & bizops, finance & corp dev, product marketing & GTM) from the public MBA internship tracker
// (github.com/TrevorDohm/MBA-Tech-Internships-2027) into decider.html and logs what changed.
// Runs every Monday on GitHub (.github/workflows/weekly-sync.yml); a Mac notification shows when run locally.
//
// usage: node research/sync_tracker.js          (normal run)
//        node research/sync_tracker.js --dry    (show changes, write nothing)
//        node research/sync_tracker.js --file research/all-listings.json   (use a downloaded copy instead of fetching)
//
// Safety: if the download fails, looks malformed, or the listing count drops by more than half,
// nothing is written. Each run keeps a dated backup of decider.html in research/backups/.
const https = require('https'), fs = require('fs'), path = require('path'), {execFile} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'decider.html');
const SNAPSHOT = path.join(__dirname, 'tracker-snapshot.json');
const CHANGES = path.join(__dirname, 'tracker-changes.md');
const BACKUPS = path.join(__dirname, 'backups');
const SOURCE = 'https://raw.githubusercontent.com/TrevorDohm/MBA-Tech-Internships-2027/main/listings.json';
const DRY = process.argv.includes('--dry');
const FILE = process.argv.includes('--file') ? process.argv[process.argv.indexOf('--file') + 1] : null;
const CATEGORIES = ['PM', 'Strategy & BizOps', 'Finance & Corp Dev', 'PMM & GTM'];  // must match CAT_FUNC in decider.html

function get(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, {headers: {'User-Agent': 'tech-internship-decider-sync'}, timeout: 30000}, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects) return resolve(get(res.headers.location, redirects - 1));
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let body = ''; res.setEncoding('utf8'); res.on('data', d => body += d); res.on('end', () => resolve(body));
    }).on('timeout', function () { this.destroy(new Error('timed out')); }).on('error', reject);
  });
}

// "$48–$74/hr (Mountain View); ..." -> {low, high} in $/month. Non-USD or unparseable -> null.
function parsePay(text) {
  if (!text || text.indexOf('$') < 0) return null;
  const seg = text.split(';')[0];
  const nums = (seg.match(/\$\s*\d[\d,]*(?:\.\d+)?\s*[kK]?/g) || []).map(s => {
    const n = parseFloat(s.replace(/[$,\s]/g, '')); return /k$/i.test(s.trim()) ? n * 1000 : n;
  });
  if (!nums.length) return null;
  const lo = Math.min(nums[0], nums[1] || nums[0]), hi = Math.max(nums[0], nums[1] || nums[0]);
  let k;
  if (/\/\s*h|hour|\bhr\b/i.test(seg)) k = 173.3;
  else if (/\/\s*mo|month/i.test(seg)) k = 1;
  else if (/\/\s*y|year|annual/i.test(seg)) k = 1 / 12;
  else k = lo < 300 ? 173.3 : lo < 40000 ? 1 : 1 / 12;   // no unit given: guess from size
  return {low: Math.round(lo * k), high: Math.round(hi * k)};
}

const keyOf = l => (l.company + ' | ' + l.role).toLowerCase();
function notify(msg) {
  if (process.platform !== 'darwin') return;
  execFile('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "Tech Internship Offer Decider sync"`], () => {});
}
const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const raw = JSON.parse(FILE ? fs.readFileSync(FILE, 'utf8') : await get(SOURCE));
  if (!Array.isArray(raw) || !raw.length || !raw.every(x => x && x.company && x.role && x.category))
    throw new Error('tracker data has an unexpected shape');
  const other = [...new Set(raw.map(x => x.category).filter(c => !CATEGORIES.includes(c)))];
  const listings = raw.filter(x => CATEGORIES.includes(x.category)).map(x => {
    const p = parsePay(x.pay);
    return {company: x.company, role: x.role, category: x.category, locations: x.locations || [], url: x.url || null, posted: x.date_posted || null,
      status: x.status || null, pay: x.pay || null, low: p ? p.low : null, high: p ? p.high : null,
      sponsorship: x.sponsorship || 'unknown', notes: (x.notes || '').slice(0, 300)};
  });

  const prev = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) : null;
  if (prev && listings.length < prev.listings.length / 2)
    throw new Error(`Listings dropped from ${prev.listings.length} to ${listings.length}; skipping in case the tracker is broken`);

  // What changed since last week
  const lines = [];
  if (prev) {
    const before = new Map(prev.listings.map(l => [keyOf(l), l])), after = new Map(listings.map(l => [keyOf(l), l]));
    for (const [k, l] of after) {
      const o = before.get(k);
      if (!o) lines.push(`- NEW (${l.category}): ${l.company}: ${l.role}${l.pay ? ' (' + l.pay + ')' : ''}${l.status ? ' [' + l.status + ']' : ''}`);
      else {
        if (o.status !== l.status) lines.push(`- STATUS: ${l.company}: ${l.role}: ${o.status} → ${l.status}`);
        if ((o.pay || '') !== (l.pay || '')) lines.push(`- PAY: ${l.company}: ${l.role}: ${o.pay || 'none'} → ${l.pay || 'none'}`);
      }
    }
    for (const [k, l] of before) if (!after.has(k)) lines.push(`- REMOVED: ${l.company}: ${l.role}`);
  } else lines.push(`- First sync: ${listings.length} postings.`);
  if (other.length) lines.push(`- NEEDS REVIEW (new role categories in the tracker, not shown in the tool yet): ${other.join(', ')}`);

  // Companies the page doesn't know how to classify yet
  let html = fs.readFileSync(HTML, 'utf8');
  if (!/\/\*BEGIN-TRACKER\*\/[\s\S]*?\/\*END-TRACKER\*\//.test(html)) throw new Error('TRACKER block not found in decider.html');
  const known = (html.split('const RAW = [')[1].split('\n];')[0].match(/^\s*\['([^']+)'/gm) || []).map(s => s.replace(/^\s*\['/, '').replace(/'$/, ''));
  const metaBlock = html.split('const TRACKER_META = {')[1].split('\n};')[0];
  const meta = (metaBlock.match(/'[^']+':|"[^"]+":/g) || []).map(s => s.slice(1, -2));
  const ck = s => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
  const knownKeys = known.concat(meta).map(ck);
  const unknown = [...new Set(listings.map(l => l.company))].filter(c => {
    const k = ck(c); return !knownKeys.some(m => m === k || (m.length >= 5 && k.length >= 5 && (k.startsWith(m) || m.startsWith(k))));
  });
  if (unknown.length) lines.push(`- NEEDS REVIEW (new companies added with default type/stage/brand): ${unknown.join(', ')}`);

  const summary = lines.filter(l => !l.startsWith('- NEEDS')).length;
  console.log(`[${today()}] ${listings.length} postings; ${prev ? summary + ' change(s)' : 'first sync'}`);
  lines.forEach(l => console.log(l));
  if (DRY) return;

  const block = '/*BEGIN-TRACKER*/' + JSON.stringify({syncedAt: today(), source: 'https://github.com/TrevorDohm/MBA-Tech-Internships-2027', listings}) + '/*END-TRACKER*/';
  const next = html.replace(/\/\*BEGIN-TRACKER\*\/[\s\S]*?\/\*END-TRACKER\*\//, () => block);

  fs.mkdirSync(BACKUPS, {recursive: true});
  fs.writeFileSync(path.join(BACKUPS, `decider-${today()}.html`), html);
  for (const f of fs.readdirSync(BACKUPS).filter(f => /^decider-.*\.html$/.test(f)).sort().slice(0, -8)) fs.unlinkSync(path.join(BACKUPS, f));
  fs.writeFileSync(HTML, next);
  fs.writeFileSync(SNAPSHOT, JSON.stringify({syncedAt: today(), listings}, null, 1));
  fs.appendFileSync(CHANGES, `\n## ${today()}: ${listings.length} postings\n${lines.join('\n')}\n`);
  notify(prev ? (summary ? `${summary} change(s) in postings. See research/tracker-changes.md` : 'No changes this week.')
    + (unknown.length ? ` ${unknown.length} new compan${unknown.length === 1 ? 'y needs' : 'ies need'} review.` : '')
    : `First sync: ${listings.length} postings loaded.`);
}

main().catch(e => {
  console.error(`[${today()}] SYNC FAILED: ${e.message}`);
  notify('Sync failed: ' + e.message + '. The tool was not changed.');
  process.exitCode = 1;
});
