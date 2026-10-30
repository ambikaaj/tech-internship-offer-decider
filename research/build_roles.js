// Turns the research JSON (roles/g1..g4.json) into the ROLES block inside decider.html.
// usage: node build_roles.js <decider.html> <roles dir>
const fs = require('fs');
const [htmlPath, dir] = process.argv.slice(2);
let html = fs.readFileSync(htmlPath, 'utf8');

// Company ids and location lists, parsed from the RAW list in decider.html.
const raw = html.split('const RAW = [')[1].split('\n];')[0];
const companies = {};
for (const m of raw.matchAll(/^\s*\['([^']+)', '[a-z]+', '[a-z]+', \d+, \d, \[([^\]]*)\]/gm)) {
  const id = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  companies[id] = {name: m[1], locs: [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1].replace('!', '').split('@')[0])};
}
const ALIASES = {'method-financial': 'methodfi', 'method': 'methodfi', 'snorkel': 'snorkel-ai', 'hebbia': 'hebbia-ai',
  'samsung': 'samsung-electronics-america', 'samsung-global-strategy-group': 'samsung-electronics-america', 'ea': 'electronic-arts',
  'activision': 'activision-blizzard', 'c3-ai-inc': 'c3-ai'};
const idOf = name => { const s = name.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return companies[s] ? s : ALIASES[s] || Object.keys(companies).find(k => s.startsWith(k) || k.startsWith(s)); };

const MONTHLY = {hour: 173.3, hourly: 173.3, week: 4.33, weekly: 4.33, month: 1, monthly: 1, year: 1 / 12, annual: 1 / 12, annually: 1 / 12};
const cityKey = s => s.toLowerCase().replace(/\(.*?\)/g, '').split(/[,/]/)[0].trim();
const out = {}, report = [];
for (const f of fs.readdirSync(dir).filter(f => /^g\d\.json$/.test(f)).sort()) {
  for (const co of JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'))) {
    const id = idOf(co.company);
    if (!id) { report.push(`UNMATCHED company "${co.company}"`); continue; }
    const roles = (co.roles || []).filter(r => r && r.title);
    if (!roles.length) { report.push(`${co.company}: no roles (${(co.notes || '').slice(0, 90)})`); continue; }
    out[id] = (out[id] || []).concat(roles.map(r => {
      const p = r.pay || {}, t = r.timeline || {};
      const k = MONTHLY[(p.unit || '').toLowerCase()];
      const ok = k && p.low != null;
      const low = ok ? Math.round(p.low * k) : null, high = ok ? Math.round((p.high != null ? p.high : p.low) * k) : null;
      // Map posted locations onto the company's locations from the core list (null = all of them).
      const posted = (r.locations || []).map(cityKey);
      let locs = null;
      if (posted.length && !posted.some(x => /remote|united states|^us$|multiple|various/.test(x))) {
        const hit = companies[id].locs.map((l, i) => posted.some(x => cityKey(l).includes(x) || x.includes(cityKey(l))) ? i : -1).filter(i => i >= 0);
        if (hit.length) locs = hit;
        else { report.push(`SKIPPED ${co.company} | ${r.title} | posted only in ${r.locations.join("; ")}`); return null; }
      }
      const unitWord = {hour: '/hr', hourly: '/hr', week: '/wk', weekly: '/wk', month: '/mo', monthly: '/mo', year: '/yr', annual: '/yr', annually: '/yr'}[(p.unit || '').toLowerCase()] || '';
      const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
      const postedText = ok ? `${fmt(p.low)}${p.high != null && p.high !== p.low ? '–' + fmt(p.high) : ''}${unitWord}${p.applies_to ? ', ' + p.applies_to : ''}` : null;
      const notes = [r.notes, r.locations && r.locations.length ? 'Posted locations: ' + r.locations.join('; ') : null].filter(Boolean).join(' ');
      return {
        title: r.title, tech: /technical|pm-t\b|\btpm\b/i.test(r.title), locs, low, high, posted: postedText,
        stipend: p.stipends || null,
        src: ok ? {type: p.source_type || 'other', url: p.source_url || null, cycle: p.cycle || null} : null,
        timeline: (t.applications_open || t.offers || t.interviews || t.deadline)
          ? {open: t.applications_open || null, interviews: t.interviews || null, offers: t.offers || null, deadline: t.deadline || null, type: t.source_type || null, url: t.source_url || null} : null,
        notes: notes.slice(0, 300),
      };
    }).filter(Boolean));
  }
}
// Cleanup: keep a general MBA posting (no PM in the title) only when the company has no PM-specific role, keep only the newest cycle of the same role,
// and flag pay bands too wide for a midpoint to mean anything (e.g. a generic all-intern band).
const yearOf = r => Math.max(0, ...((r.title + ' ' + ((r.src && r.src.cycle) || '')).match(/20\d\d/g) || []).map(Number));
const roleKey = t => t.toLowerCase().replace(/20\d\d|summer|internships?|interns?|[^a-z]/g, '');
for (const id of Object.keys(out)) {
  let rs = out[id];
  for (const r of rs) if (!/product|\bpm\b/i.test(r.title)) { r.general = true; r.notes = ('General MBA posting: interns are matched to teams after hiring, and PM is one possible track, not guaranteed. ' + r.notes).slice(0, 300); }
  if (rs.some(r => !r.general)) rs = rs.filter(r => !r.general);
  const best = {};
  for (const r of rs) { const k = roleKey(r.title); if (!best[k] || yearOf(r) > yearOf(best[k])) best[k] = r; }
  rs = rs.filter(r => best[roleKey(r.title)] === r);
  for (const r of rs) if (r.low && r.high / r.low > 1.9) r.wide = true;
  if (rs.length) out[id] = rs; else delete out[id];
}
for (const [id, rs] of Object.entries(out)) for (const r of rs)
  report.push(`${companies[id].name} | ${r.title}${r.tech ? ' [tech]' : ''}${r.general ? ' [general]' : ''} | ${r.low ? '$' + r.low + '–' + r.high + '/mo' : 'no pay'} | locs ${r.locs ? r.locs.map(i => companies[id].locs[i]).join('; ') : 'all'} | timeline ${r.timeline ? "yes" : "no"}${r.wide ? " [WIDE]" : ""}`);
const missing = Object.keys(companies).filter(id => !out[id]);
report.push(`\n${Object.keys(out).length} companies with roles; no roles: ${missing.map(id => companies[id].name).join(', ')}`);

const block = '/*BEGIN-ROLES*/\n' + Object.entries(out).map(([id, rs]) => `  '${id}': ${JSON.stringify(rs)},`).join('\n') + '\n/*END-ROLES*/';
html = html.replace(/\/\*BEGIN-ROLES\*\/[\s\S]*?\/\*END-ROLES\*\//, block);
fs.writeFileSync(htmlPath, html);
console.log(report.join('\n'));
