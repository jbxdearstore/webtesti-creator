// Fungsi server panel creator: membuat website buyer baru.
// Letakkan di folder "api" pada repo panel creator (api/buat-website.js).
// Kunci rahasia dibaca dari Environment Variables Vercel: GITHUB_TOKEN, VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN.

const SUPABASE_URL = 'https://yjxdfqvenbsdmgpcdkwe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGRmcXZlbmJzZG1ncGNka3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNDMyNTUsImV4cCI6MjEwNzcxOTI1NX0.h3BUjRlXqwhacgE04QHOfLGwsFJieiIMCLEEUpqkon8';
const SUPABASE_REF = 'yjxdfqvenbsdmgpcdkwe';
const VERCEL_TEAM_SLUG = 'xdear-store';
const PREFIX = 'testi-';
const RESERVED = ['www', 'api', 'admin', 'panel', 'creator', 'testicreatorxdear', 'dashboard', 'login'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

class Gagal extends Error {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, opt, label) {
  const r = await fetch(url, opt);
  const txt = await r.text();
  let body = null;
  try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = { raw: txt }; }
  return { ok: r.ok, status: r.status, body, label };
}
const gh = (path, method, data) => call('https://api.github.com' + path, {
  method: method || 'GET',
  headers: {
    Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'panel-creator',
    'Content-Type': 'application/json'
  },
  body: data ? JSON.stringify(data) : undefined
});
const vc = (path, method, data) => call('https://api.vercel.com' + path + (path.includes('?') ? '&' : '?') + 'slug=' + VERCEL_TEAM_SLUG, {
  method: method || 'GET',
  headers: { Authorization: 'Bearer ' + process.env.VERCEL_TOKEN, 'Content-Type': 'application/json' },
  body: data ? JSON.stringify(data) : undefined
});
const sbm = (path, method, data) => call('https://api.supabase.com' + path, {
  method: method || 'GET',
  headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
  body: data ? JSON.stringify(data) : undefined
});
const db = (jwt, path, method, data, prefer) => call(SUPABASE_URL + '/rest/v1/' + path, {
  method: method || 'GET',
  headers: Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' }, prefer ? { Prefer: prefer } : {}),
  body: data ? JSON.stringify(data) : undefined
});

// Pastikan pemanggil adalah creator yang login (bukan orang lain)
async function cekCreator(jwt) {
  if (!jwt) throw new Gagal('Belum login.');
  const u = await call(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + jwt } });
  const email = u.ok && u.body && String(u.body.email || '').toLowerCase();
  if (!email) throw new Gagal('Login tidak valid. Masuk ulang.');
  const c = await db(jwt, 'creators?select=email&email=eq.' + encodeURIComponent(email));
  if (!c.ok || !Array.isArray(c.body) || !c.body.length) throw new Gagal('Akun ini bukan creator.');
}

async function buat(jwt, inp) {
  const nama = String(inp.nama_toko || '').trim().slice(0, 60);
  const email = String(inp.email || '').trim().toLowerCase();
  const slug = String(inp.slug || '').trim().toLowerCase();
  if (!nama) throw new Gagal('Nama toko wajib diisi.');
  if (!EMAIL_RE.test(email) || /[,()"]/.test(email)) throw new Gagal('Format email tidak valid.');
  if (!SLUG_RE.test(slug) || slug.includes('--')) throw new Gagal('Nama link hanya huruf kecil, angka, dan strip (3 sampai 40 karakter).');
  if (RESERVED.includes(slug)) throw new Gagal('Nama link itu tidak boleh dipakai.');
  const repoName = PREFIX + slug, projName = PREFIX + slug, domain = slug + '.vercel.app';

  // Salinan induk terbaru
  const ind = await db(jwt, 'induk_versi?select=versi,files&order=versi.desc&limit=1');
  if (!ind.ok || !ind.body || !ind.body.length) throw new Gagal('Salinan induk belum ada. Simpan dulu lewat tombol Salinan induk.');
  const induk = ind.body[0];
  if (!induk.files['index.html']) throw new Gagal('Salinan induk tidak punya index.html.');

  // Cek duplikat di catatan panel
  const dup = await db(jwt, 'owners?select=id&or=(email.eq.' + encodeURIComponent(email) + ',domain.eq.' + domain + ',github_repo.eq.' + repoName + ',vercel_project.eq.' + projName + ')');
  if (dup.ok && dup.body && dup.body.length) throw new Gagal('Email, nama link, atau nama folder itu sudah dipakai buyer lain.');

  const made = { owner: null, repo: false, project: null };
  const warn = [];
  let ghUser = null;
  try {
    // 1. Catat buyer
    const o = await db(jwt, 'owners', 'POST', {
      nama_toko: nama, email, status: 'aktif', aktif: true,
      github_repo: repoName, vercel_project: projName, domain
    }, 'return=representation');
    if (!o.ok || !o.body || !o.body[0]) throw new Gagal('Gagal mencatat buyer. Pastikan SQL tahap 1 sudah dijalankan.');
    made.owner = o.body[0];

    // 2. Folder GitHub
    const u = await gh('/user');
    if (!u.ok) throw new Gagal('Kunci GitHub ditolak. Periksa GITHUB_TOKEN.');
    ghUser = u.body.login;
    const rp = await gh('/user/repos', 'POST', { name: repoName, private: true, auto_init: true, description: 'Website testimoni ' + nama });
    if (!rp.ok) throw new Gagal(rp.status === 422 ? 'Folder GitHub dengan nama itu sudah ada.' : 'Gagal membuat folder GitHub (kode ' + rp.status + ').');
    made.repo = true;

    // 3. Proyek Vercel terhubung ke folder tadi
    const pj = await vc('/v11/projects', 'POST', { name: projName, framework: null, gitRepository: { type: 'github', repo: ghUser + '/' + repoName } });
    if (!pj.ok) {
      const m = (pj.body && pj.body.error && pj.body.error.message) || '';
      throw new Gagal(pj.status === 409 ? 'Proyek Vercel dengan nama itu sudah ada.' : 'Gagal membuat proyek Vercel: ' + (m || 'kode ' + pj.status) + '. Pastikan aplikasi Vercel di GitHub diberi akses ke semua folder.');
    }
    made.project = pj.body.id;

    // 4. Link .vercel.app sesuai keinginan buyer
    const dm = await vc('/v10/projects/' + made.project + '/domains', 'POST', { name: domain });
    if (!dm.ok) throw new Gagal(dm.status === 409 || dm.status === 400 ? 'Link ' + domain + ' sudah dipakai orang lain. Coba nama lain.' : 'Gagal memasang link ' + domain + ' (kode ' + dm.status + ').');
    if (dm.body && dm.body.verified === false) warn.push('Link ' + domain + ' belum terverifikasi oleh Vercel.');

    // 5. Daftar tamu tepercaya di Supabase (kalau gagal, tidak membatalkan website)
    try {
      const cfg = await sbm('/v1/projects/' + SUPABASE_REF + '/config/auth');
      if (!cfg.ok) throw new Error('baca ' + cfg.status);
      const list = String(cfg.body.uri_allow_list || '').split(',').map((s) => s.trim()).filter(Boolean);
      ['https://' + domain + '/**', 'https://' + projName + '.vercel.app/**'].forEach((x) => { if (!list.includes(x)) list.push(x); });
      const up = await sbm('/v1/projects/' + SUPABASE_REF + '/config/auth', 'PATCH', { uri_allow_list: list.join(',') });
      if (!up.ok) throw new Error('tulis ' + up.status);
    } catch (e) {
      warn.push('Link belum masuk daftar tamu tepercaya Supabase (' + e.message + '). Tambahkan manual: https://' + domain + '/** di Authentication, URL Configuration.');
    }

    // 6. Isi folder dengan salinan induk + config.js buyer, satu commit. Ini memicu Vercel membangun website.
    const files = Object.assign({}, induk.files, {
      'config.js': "window.APP_CONFIG = {\n  SUPABASE_URL: '" + SUPABASE_URL + "',\n  SUPABASE_KEY: '" + SUPABASE_KEY + "',\n  OWNER_ID: '" + made.owner.id + "'\n};\n"
    });
    let head = null;
    for (let i = 0; i < 5 && !head; i++) {
      const rf = await gh('/repos/' + ghUser + '/' + repoName + '/git/ref/heads/main');
      if (rf.ok) head = rf.body.object.sha; else await wait(1200);
    }
    if (!head) throw new Gagal('Folder GitHub belum siap. Coba lagi.');
    const names = Object.keys(files);
    const blobs = await Promise.all(names.map((n) => gh('/repos/' + ghUser + '/' + repoName + '/git/blobs', 'POST', { content: Buffer.from(files[n], 'utf8').toString('base64'), encoding: 'base64' })));
    if (blobs.some((b) => !b.ok)) throw new Gagal('Gagal mengunggah file ke GitHub.');
    const tr = await gh('/repos/' + ghUser + '/' + repoName + '/git/trees', 'POST', { tree: names.map((n, i) => ({ path: n, mode: '100644', type: 'blob', sha: blobs[i].body.sha })) });
    if (!tr.ok) throw new Gagal('Gagal menyusun file di GitHub.');
    const cm = await gh('/repos/' + ghUser + '/' + repoName + '/git/commits', 'POST', { message: 'Website awal (induk versi ' + induk.versi + ')', tree: tr.body.sha, parents: [head] });
    if (!cm.ok) throw new Gagal('Gagal menyimpan file di GitHub.');
    const rf = await gh('/repos/' + ghUser + '/' + repoName + '/git/refs/heads/main', 'PATCH', { sha: cm.body.sha });
    if (!rf.ok) throw new Gagal('Gagal memasang file di GitHub.');

    await db(jwt, 'owners?id=eq.' + made.owner.id, 'PATCH', { induk_versi: induk.versi });
    return { ok: true, owner_id: made.owner.id, project: projName, domain, repo: repoName, induk_versi: induk.versi, warn };
  } catch (e) {
    // Batalkan hanya yang dibuat dalam permintaan ini
    if (made.project) await vc('/v9/projects/' + made.project, 'DELETE');
    if (made.repo && ghUser) await gh('/repos/' + ghUser + '/' + repoName, 'DELETE');
    if (made.owner) await db(jwt, 'owners?id=eq.' + made.owner.id, 'DELETE');
    throw e;
  }
}

async function status(jwt, project) {
  const own = await db(jwt, 'owners?select=id&vercel_project=eq.' + encodeURIComponent(project));
  if (!own.ok || !own.body || !own.body.length) throw new Gagal('Proyek itu tidak ada di catatan.');
  const d = await vc('/v6/deployments?app=' + encodeURIComponent(project) + '&limit=1&target=production');
  if (!d.ok) throw new Gagal('Gagal membaca status Vercel.');
  const x = d.body && d.body.deployments && d.body.deployments[0];
  return { ok: true, state: x ? (x.readyState || x.state) : 'NONE' };
}

// ===== TAHAP 3: ambil file website, tanda tangan zip, hapus website =====
const crypto = require('crypto');
const FORBID = ['testicreatorxdear']; // tidak boleh dihapus apa pun yang terjadi
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const aman = (n) => typeof n === 'string' && n.startsWith(PREFIX) && NAME_OK.test(n) && !FORBID.includes(n.toLowerCase());

async function ambilOwner(jwt, id) {
  if (!UUID_RE.test(String(id || ''))) throw new Gagal('ID buyer tidak valid.');
  const o = await db(jwt, 'owners?select=*&id=eq.' + id);
  if (!o.ok || !o.body || !o.body[0]) throw new Gagal('Buyer tidak ditemukan.');
  return o.body[0];
}

async function ambil(jwt, id) {
  const o = await ambilOwner(jwt, id);
  if (!aman(o.github_repo)) throw new Gagal('Nama folder tidak berawalan ' + PREFIX + ', panel menolak membacanya.');
  const u = await gh('/user');
  if (!u.ok) throw new Gagal('Kunci GitHub ditolak.');
  const base = '/repos/' + u.body.login + '/' + o.github_repo;
  const tr = await gh(base + '/git/trees/main?recursive=1');
  if (!tr.ok) throw new Gagal('Gagal membaca folder GitHub buyer (kode ' + tr.status + ').');
  const blobs = (tr.body.tree || []).filter((t) => t.type === 'blob');
  if (!blobs.length || blobs.length > 80) throw new Gagal('Jumlah file di folder GitHub tidak wajar (' + blobs.length + ').');
  const res = await Promise.all(blobs.map((b) => gh(base + '/git/blobs/' + b.sha)));
  const files = {};
  res.forEach((r, i) => {
    if (!r.ok) throw new Gagal('Gagal membaca file ' + blobs[i].path + '.');
    files[blobs[i].path] = String(r.body.content || '').replace(/\n/g, '');
  });
  return { ok: true, files };
}

function sign(text) {
  if (!process.env.ZIP_SECRET) throw new Gagal('ZIP_SECRET belum diisi di Environment Variables Vercel.');
  return crypto.createHmac('sha256', process.env.ZIP_SECRET).update(text, 'utf8').digest('hex');
}
function tanda(manifest) {
  const m = String(manifest || '');
  if (!m || m.length > 2000000) throw new Gagal('Isi manifest tidak valid.');
  return { ok: true, sig: sign(m) };
}
function periksa(manifest, sig) {
  const a = Buffer.from(sign(String(manifest || '')), 'hex');
  const b = Buffer.from(String(sig || '').trim(), 'hex');
  return { ok: true, valid: a.length === b.length && crypto.timingSafeEqual(a, b) };
}

async function hapus(jwt, id) {
  const o = await ambilOwner(jwt, id);
  if (o.status === 'dihapus') throw new Gagal('Website ini sudah dihapus.');
  const repo = o.github_repo, proj = o.vercel_project;
  if (!aman(repo) || !aman(proj)) throw new Gagal('Nama folder atau proyek tidak berawalan ' + PREFIX + ', jadi panel menolak menghapusnya.');
  const u = await gh('/user');
  if (!u.ok) throw new Gagal('Kunci GitHub ditolak.');
  const login = u.body.login, warn = [];

  // Pastikan yang akan dihapus benar-benar milik buyer ini
  const pj = await vc('/v9/projects/' + encodeURIComponent(proj));
  let projAda = true;
  if (pj.status === 404) projAda = false;
  else if (!pj.ok) throw new Gagal('Gagal membaca proyek Vercel (kode ' + pj.status + ').');
  else {
    const lr = String((pj.body.link && pj.body.link.repo) || '').split('/').pop().toLowerCase();
    if (lr !== repo.toLowerCase()) throw new Gagal('Proyek Vercel ' + proj + ' tidak terhubung ke folder ' + repo + ', jadi tidak dihapus.');
  }
  const rp = await gh('/repos/' + login + '/' + repo);
  let repoAda = true;
  if (rp.status === 404) repoAda = false;
  else if (!rp.ok) throw new Gagal('Gagal membaca folder GitHub (kode ' + rp.status + ').');

  // 1. Proyek Vercel (website langsung offline). Kalau gagal, folder GitHub belum disentuh.
  if (projAda) {
    const d = await vc('/v9/projects/' + pj.body.id, 'DELETE');
    if (!d.ok && d.status !== 404) throw new Gagal('Gagal menghapus proyek Vercel (kode ' + d.status + '). Folder GitHub belum disentuh.');
  }
  // 2. Folder GitHub
  if (repoAda) {
    const d = await gh('/repos/' + login + '/' + repo, 'DELETE');
    if (!d.ok && d.status !== 404) warn.push('Folder GitHub ' + repo + ' belum terhapus (kode ' + d.status + '). Hapus manual di GitHub.');
  }
  // 3. Keluarkan link dari daftar tamu tepercaya Supabase
  try {
    const cfg = await sbm('/v1/projects/' + SUPABASE_REF + '/config/auth');
    if (!cfg.ok) throw new Error('baca ' + cfg.status);
    const buang = ['https://' + o.domain + '/**', 'https://' + proj + '.vercel.app/**'];
    const list = String(cfg.body.uri_allow_list || '').split(',').map((s) => s.trim()).filter(Boolean);
    const baru = list.filter((x) => !buang.includes(x));
    if (baru.length !== list.length) {
      const up = await sbm('/v1/projects/' + SUPABASE_REF + '/config/auth', 'PATCH', { uri_allow_list: baru.join(',') });
      if (!up.ok) throw new Error('tulis ' + up.status);
    }
  } catch (e) {
    warn.push('Link belum dikeluarkan dari daftar tamu tepercaya Supabase (' + e.message + '). Hapus manual di Authentication, URL Configuration.');
  }
  // 4. Tandai di panel
  const up = await db(jwt, 'owners?id=eq.' + o.id, 'PATCH', { status: 'dihapus', aktif: false, dihapus_pada: new Date().toISOString() });
  if (!up.ok) warn.push('Website sudah terhapus, tapi status di panel gagal diubah. Ubah manual.');
  return { ok: true, warn };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metode tidak didukung.' });
  try {
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    await cekCreator(jwt);
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (b.action === 'status') return res.status(200).json(await status(jwt, String(b.project || '')));
    if (b.action === 'buat') return res.status(200).json(await buat(jwt, b));
    if (b.action === 'ambil') return res.status(200).json(await ambil(jwt, b.owner_id));
    if (b.action === 'tanda') return res.status(200).json(tanda(b.manifest));
    if (b.action === 'periksa') return res.status(200).json(periksa(b.manifest, b.sig));
    if (b.action === 'hapus') return res.status(200).json(await hapus(jwt, b.owner_id));
    return res.status(400).json({ ok: false, error: 'Perintah tidak dikenal.' });
  } catch (e) {
    return res.status(e instanceof Gagal ? 400 : 500).json({ ok: false, error: e instanceof Gagal ? e.message : 'Terjadi kesalahan di server.' });
  }
};
