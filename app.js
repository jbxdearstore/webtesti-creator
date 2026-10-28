(function () {
  const C = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const h = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const mb = (b) => (b / 1048576).toFixed(1);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let owners = [], booted = null;

  /* ===== LAYAR & NOTIFIKASI ===== */
  const SCREENS = ['sLoad', 'sLogin', 'sDenied', 'sApp'];
  function show(id) { SCREENS.forEach((s) => { $(s).hidden = s !== id; }); }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 4000);
  }
  function deny(msg) { $('denMsg').textContent = msg; show('sDenied'); }

  /* ===== CONFIG.JS UNTUK WEBSITE OWNER ===== */
  function configText(o) {
    return "window.APP_CONFIG = {\n" +
      "  SUPABASE_URL: '" + C.SUPABASE_URL + "',\n" +
      "  SUPABASE_KEY: '" + C.SUPABASE_KEY + "',\n" +
      "  OWNER_ID: '" + o.id + "'\n" +
      "};\n";
  }
  function showConfig(o, title) {
    $('cfgTitle').textContent = title || ('config.js \u2014 ' + o.nama_toko);
    $('cfgText').value = configText(o);
    $('modalCfg').hidden = false;
  }
  async function copyConfig() {
    const ta = $('cfgText');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(ta.value);
        return toast('Tersalin.');
      }
      throw new Error('no clipboard');
    } catch (e) {
      ta.select();
      try { document.execCommand('copy'); toast('Tersalin.'); }
      catch (e2) { toast('Gagal menyalin. Tahan teks lalu pilih Salin.'); }
    }
  }

  /* ===== CSV ===== */
  function cell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(name, header, rows) {
    const lines = [header.map(cell).join(',')].concat(rows.map((r) => r.map(cell).join(',')));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportOwners() {
    downloadCsv('owner-' + stamp() + '.csv',
      ['id', 'nama_toko', 'email', 'status', 'kuota_mb', 'terpakai_mb', 'folder_github', 'proyek_vercel', 'link', 'dibuat'],
      owners.map((o) => [o.id, o.nama_toko, o.email, stOf(o), mb(o.kuota_bytes), mb(o.terpakai_bytes || 0), o.github_repo, o.vercel_project, o.domain, o.dibuat]));
    toast('File owner diunduh.');
  }
  async function exportTesti() {
    const btn = $('bExpTesti');
    btn.disabled = true;
    try {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('testimonials').select('*').order('dibuat').range(from, from + 999);
        if (error) throw new Error('Gagal mengambil testimoni.');
        all.push(...data);
        if (data.length < 1000) break;
      }
      const nm = {};
      owners.forEach((o) => { nm[o.id] = o.nama_toko; });
      downloadCsv('testimoni-' + stamp() + '.csv',
        ['owner', 'nama_customer', 'label', 'rating', 'teks', 'media_type', 'media_path', 'video_url', 'tanggal', 'tampil', 'urutan', 'dibuat'],
        all.map((t) => [nm[t.owner_id] || t.owner_id, t.nama_customer, t.label, t.rating, t.teks, t.media_type, t.media_path, t.video_url, t.tanggal, t.tampil ? 'ya' : 'tidak', t.urutan, t.dibuat]));
      toast(all.length + ' testimoni diunduh.');
    } catch (e) {
      toast(e.message || 'Gagal export.');
    } finally { btn.disabled = false; }
  }

  /* ===== DAFTAR OWNER ===== */
  const stOf = (o) => o.status || (o.aktif ? 'aktif' : 'nonaktif');
  const ST = { aktif: ['on', 'Aktif'], nonaktif: ['warn', 'Nonaktif sementara'], dihapus: ['gray', 'Dihapus'] };
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  function ownerEl(o) {
    const st = stOf(o);
    const r = h('div', 'item' + (st === 'nonaktif' ? ' off' : st === 'dihapus' ? ' gone' : ''));
    const top = h('div', 'otop');
    const l = h('div');
    l.appendChild(h('div', 'nm', o.nama_toko));
    l.appendChild(h('div', 'muted small', o.email));
    top.appendChild(l);
    top.appendChild(h('span', 'badge ' + (ST[st] || ST.aktif)[0], (ST[st] || ST.aktif)[1]));
    r.appendChild(top);

    const info = h('div', 'info');
    info.textContent = 'Folder GitHub: ' + (o.github_repo || 'belum diisi') +
      '\nProyek Vercel: ' + (o.vercel_project || 'belum diisi') +
      '\nLink: ' + (o.domain || 'belum diisi') +
      (st === 'dihapus' && o.dihapus_pada ? '\nDihapus: ' + fmtDate(o.dihapus_pada) : '');
    r.appendChild(info);

    if (st === 'dihapus') return r;

    const used = o.terpakai_bytes || 0, max = o.kuota_bytes || 1;
    const q = h('div', 'qrow');
    q.appendChild(h('span', null, 'Penyimpanan'));
    q.appendChild(h('span', null, mb(used) + ' / ' + mb(max) + ' MB'));
    r.appendChild(q);
    const bar = h('div', 'bar');
    const fill = h('i');
    fill.style.width = Math.min(100, (used / max) * 100) + '%';
    bar.appendChild(fill);
    r.appendChild(bar);

    const a = h('div', 'acts');
    const b0 = h('button', 'btn ghost sm', 'Catatan website'); b0.onclick = () => openNote(o);
    const b1 = h('button', 'btn ghost sm', 'Salin config.js'); b1.onclick = () => showConfig(o);
    const b2 = h('button', 'btn ghost sm', 'Ganti email'); b2.onclick = () => changeEmail(o);
    const b3 = h('button', 'btn ghost sm', 'Ubah kuota'); b3.onclick = () => changeQuota(o);
    const on = st === 'aktif';
    const b4 = h('button', on ? 'btn danger sm' : 'btn sm', on ? 'Nonaktifkan sementara' : 'Aktifkan'); b4.onclick = () => toggle(o);
    const b5 = h('button', 'btn danger sm', 'Hapus website'); b5.onclick = () => openDel(o);
    [b0, b1, b2, b3, b4, b5].forEach((b) => a.appendChild(b));
    r.appendChild(a);
    return r;
  }
  function render() {
    $('rows').replaceChildren(...owners.map(ownerEl));
    $('empty').hidden = owners.length > 0;
    $('stOwner').textContent = owners.length;
    $('stAktif').textContent = owners.filter((o) => stOf(o) === 'aktif').length;
    $('stMb').textContent = mb(owners.reduce((s, o) => s + (o.terpakai_bytes || 0), 0));
  }
  async function load() {
    const { data, error } = await sb.from('owners').select('*').order('dibuat', { ascending: false });
    if (error) return toast('Gagal memuat daftar owner. Muat ulang halaman.');
    owners = data; render();
  }

  /* ===== AKSI ===== */
  async function toggle(o) {
    const on = stOf(o) === 'aktif';
    if (on && !confirm('Nonaktifkan sementara ' + o.nama_toko + '? Website-nya langsung menampilkan "Layanan ini sedang tidak aktif" dan buyer tidak bisa masuk dashboard. Folder, proyek, dan datanya tetap ada.')) return;
    const patch = on ? { aktif: false, status: 'nonaktif' } : { aktif: true, status: 'aktif' };
    const { error } = await sb.from('owners').update(patch).eq('id', o.id);
    if (error) return toast('Gagal mengubah status. Pastikan SQL tahap 1 sudah dijalankan.');
    Object.assign(o, patch); render();
    toast(o.nama_toko + (on ? ' dinonaktifkan sementara.' : ' diaktifkan.'));
  }
  async function changeEmail(o) {
    const v = prompt('Email Google baru untuk ' + o.nama_toko + ':', o.email);
    if (v === null) return;
    const email = v.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return toast('Format email tidak valid.');
    if (email === o.email) return;
    const { error } = await sb.from('owners').update({ email }).eq('id', o.id);
    if (error) return toast(error.code === '23505' ? 'Email itu sudah dipakai owner lain.' : 'Gagal mengganti email.');
    o.email = email; render(); toast('Email diganti.');
  }
  async function changeQuota(o) {
    const v = prompt('Kuota penyimpanan baru untuk ' + o.nama_toko + ' (MB):', mb(o.kuota_bytes));
    if (v === null) return;
    const n = parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n) || n < 1 || n > 2000) return toast('Masukkan angka 1 sampai 2000 MB.');
    const bytes = Math.round(n * 1048576);
    const { error } = await sb.from('owners').update({ kuota_bytes: bytes }).eq('id', o.id);
    if (error) return toast('Gagal mengubah kuota.');
    o.kuota_bytes = bytes; render(); toast('Kuota diubah.');
  }
  async function addOwner(e) {
    e.preventDefault();
    const nama = $('aNama').value.trim();
    const email = $('aEmail').value.trim().toLowerCase();
    if (!nama) return toast('Nama toko wajib diisi.');
    if (!EMAIL_RE.test(email)) return toast('Format email tidak valid.');
    const btn = $('aSave');
    btn.disabled = true; btn.textContent = 'Menyimpan\u2026';
    try {
      const { data, error } = await sb.from('owners').insert({ nama_toko: nama, email }).select().single();
      if (error) throw new Error(error.code === '23505' ? 'Email itu sudah terdaftar sebagai owner.' : 'Gagal menyimpan: ' + error.message);
      $('modalAdd').hidden = true;
      owners.unshift(data); render();
      showConfig(data, 'Owner dibuat. Simpan config.js ini');
    } catch (err) {
      toast(err.message);
    } finally { btn.disabled = false; btn.textContent = 'Simpan'; }
  }

  /* ===== CATATAN WEBSITE BUYER ===== */
  const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
  let noteOwner = null;
  function openNote(o) {
    noteOwner = o;
    $('noteTitle').textContent = 'Catatan website: ' + o.nama_toko;
    $('nRepo').value = o.github_repo || '';
    $('nProj').value = o.vercel_project || '';
    $('nDomain').value = o.domain || '';
    $('modalNote').hidden = false;
  }
  async function saveNote(e) {
    e.preventDefault();
    const o = noteOwner;
    const repo = $('nRepo').value.trim(), proj = $('nProj').value.trim();
    let dom = $('nDomain').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (dom && dom.indexOf('.') < 0) dom += '.vercel.app';
    if (repo && !NAME_RE.test(repo)) return toast('Nama folder GitHub hanya boleh huruf, angka, titik, strip, dan garis bawah.');
    if (proj && !NAME_RE.test(proj)) return toast('Nama proyek Vercel hanya boleh huruf, angka, titik, strip, dan garis bawah.');
    if (dom && !/^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(dom)) return toast('Link harus berakhiran .vercel.app.');
    const patch = { github_repo: repo || null, vercel_project: proj || null, domain: dom || null };
    const btn = $('nSave');
    btn.disabled = true;
    const { error } = await sb.from('owners').update(patch).eq('id', o.id);
    btn.disabled = false;
    if (error) return toast(error.code === '23505' ? 'Folder, proyek, atau link itu sudah dipakai buyer lain.' : 'Gagal menyimpan. Pastikan SQL tahap 1 sudah dijalankan.');
    Object.assign(o, patch); render();
    $('modalNote').hidden = true;
    toast('Catatan disimpan.');
  }

  /* ===== SALINAN INDUK ===== */
  const FILE_RE = /^[A-Za-z0-9_.-]+\.(html|js|css|json|txt|svg)$/i;
  const kb = (s) => (new Blob([s]).size / 1024).toFixed(1);
  let induk = null, indukHist = [], picked = {};

  async function loadInduk() {
    const cur = await sb.from('induk_versi').select('*').order('versi', { ascending: false }).limit(1);
    if (cur.error) throw new Error('Gagal memuat salinan induk. Pastikan SQL tahap 1 sudah dijalankan.');
    induk = cur.data[0] || null;
    const hist = await sb.from('induk_versi').select('id,versi,dibuat,catatan').order('versi', { ascending: false }).limit(15);
    indukHist = hist.error ? [] : hist.data;
  }
  function renderInduk() {
    $('indukInfo').textContent = induk
      ? 'Versi ' + induk.versi + ', disimpan ' + fmtDate(induk.dibuat) + '. Website buyer baru memakai versi ini.'
      : 'Belum ada salinan induk. Pilih semua file website (index.html, app.js, admin.html, admin.js, privacy.html) lalu simpan.';
    const f = $('indukFiles');
    f.replaceChildren();
    const files = induk ? induk.files : {};
    Object.keys(files).sort().forEach((n) => {
      const r = h('div', 'frow');
      r.appendChild(h('span', null, n));
      r.appendChild(h('span', 'muted small', kb(files[n]) + ' KB'));
      f.appendChild(r);
    });
    const hh = $('indukHist');
    hh.replaceChildren();
    if (indukHist.length > 1) {
      hh.appendChild(h('label', null, 'Versi sebelumnya'));
      indukHist.slice(1).forEach((v) => {
        const r = h('div', 'frow');
        const t = h('span', 'small', 'Versi ' + v.versi + ', ' + fmtDate(v.dibuat) + (v.catatan ? ': ' + v.catatan : ''));
        const b = h('button', 'btn ghost sm', 'Pulihkan');
        b.onclick = () => restoreInduk(v);
        r.appendChild(t); r.appendChild(b);
        hh.appendChild(r);
      });
    }
  }
  async function pickFiles(ev) {
    picked = {};
    let total = 0;
    for (const f of ev.target.files) {
      if (f.name.toLowerCase() === 'config.js') { toast('config.js dilewati karena dibuat otomatis untuk tiap buyer.'); continue; }
      if (!FILE_RE.test(f.name)) { toast(f.name + ' dilewati: jenis file tidak didukung.'); continue; }
      if (f.size > 600 * 1024) { toast(f.name + ' dilewati: lebih dari 600 KB.'); continue; }
      total += f.size;
      if (total > 3 * 1048576) { toast('Total file terlalu besar (maksimal 3 MB).'); picked = {}; break; }
      picked[f.name] = await f.text();
    }
    const n = Object.keys(picked);
    $('indukPicked').textContent = n.length ? 'Dipilih: ' + n.join(', ') : '';
  }
  async function saveInduk() {
    const names = Object.keys(picked);
    if (!names.length) return toast('Pilih file dulu.');
    const base = induk ? induk.files : {};
    const files = Object.assign({}, base, picked);
    if (!files['index.html']) return toast('File index.html harus ada di salinan induk.');
    const ganti = names.filter((n) => n in base), baru = names.filter((n) => !(n in base));
    const ver = (induk ? induk.versi : 0) + 1;
    if (!confirm('Simpan sebagai versi ' + ver + '?' + (ganti.length ? '\nDiganti: ' + ganti.join(', ') : '') + (baru.length ? '\nDitambah: ' + baru.join(', ') : ''))) return;
    const btn = $('indukSave');
    btn.disabled = true;
    const { error } = await sb.from('induk_versi').insert({ versi: ver, catatan: $('indukNote').value.trim() || null, files });
    btn.disabled = false;
    if (error) return toast(error.code === '23505' ? 'Versi bentrok. Tutup lalu buka lagi.' : 'Gagal menyimpan versi baru.');
    picked = {}; $('indukPick').value = ''; $('indukNote').value = ''; $('indukPicked').textContent = '';
    try { await loadInduk(); renderInduk(); } catch (e) { toast(e.message); }
    toast('Versi ' + ver + ' disimpan.');
  }
  async function restoreInduk(v) {
    if (!confirm('Pulihkan isi versi ' + v.versi + ' sebagai versi baru?')) return;
    const { data, error } = await sb.from('induk_versi').select('files').eq('id', v.id).maybeSingle();
    if (error || !data) return toast('Gagal membaca versi itu.');
    const ver = (induk ? induk.versi : 0) + 1;
    const res = await sb.from('induk_versi').insert({ versi: ver, catatan: 'Pulihkan versi ' + v.versi, files: data.files });
    if (res.error) return toast('Gagal memulihkan.');
    try { await loadInduk(); renderInduk(); } catch (e) { toast(e.message); }
    toast('Versi ' + ver + ' disimpan.');
  }

  /* ===== BUAT WEBSITE BUYER ===== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function api(body) {
    const { data } = await sb.auth.getSession();
    const token = data && data.session ? data.session.access_token : '';
    const r = await fetch('/api/buat-website', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j) throw new Error('Server tidak merespons. Pastikan folder api sudah terpasang di panel.');
    if (!j.ok) throw new Error(j.error || 'Gagal.');
    return j;
  }
  async function buatWebsite(e) {
    e.preventDefault();
    const nama = $('wNama').value.trim(), email = $('wEmail').value.trim().toLowerCase(), slug = $('wSlug').value.trim().toLowerCase();
    if (!nama) return toast('Nama toko wajib diisi.');
    if (!EMAIL_RE.test(email)) return toast('Format email tidak valid.');
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return toast('Nama link hanya huruf kecil, angka, dan strip (3 sampai 40 karakter).');
    if (!confirm('Buat website untuk ' + nama + '?\nLink: https://' + slug + '.vercel.app\nEmail buyer: ' + email)) return;
    const btn = $('wSave'), prog = $('wProg');
    btn.disabled = true; prog.hidden = false;
    prog.textContent = 'Membuat folder, proyek, dan link. Tunggu sekitar 30 detik\u2026';
    try {
      const j = await api({ action: 'buat', nama_toko: nama, email, slug });
      await load();
      prog.textContent = 'Vercel sedang membangun website\u2026';
      let state = '';
      for (let i = 0; i < 40; i++) {
        await sleep(4000);
        try { state = (await api({ action: 'status', project: j.project })).state; } catch (er) { state = ''; }
        if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') break;
      }
      $('modalNew').hidden = true;
      if (state === 'READY') {
        toast('Website aktif: ' + j.domain);
        if (confirm('Website aktif di https://' + j.domain + '. Buka sekarang?')) window.open('https://' + j.domain, '_blank');
      } else if (state === 'ERROR' || state === 'CANCELED') {
        toast('Vercel gagal membangun website. Periksa proyek ' + j.project + ' di Vercel.');
      } else {
        toast('Website masih dibangun. Cek lagi sebentar lagi di https://' + j.domain);
      }
      if (j.warn && j.warn.length) setTimeout(() => alert(j.warn.join('\n\n')), 400);
    } catch (er) {
      prog.hidden = true;
      toast(er.message);
    } finally { btn.disabled = false; }
  }

  /* ===== HAPUS WEBSITE BUYER + ZIP ===== */
  const pubUrl = (p) => C.SUPABASE_URL + '/storage/v1/object/public/testimoni/' + String(p).split('/').map(encodeURIComponent).join('/');
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha256 = async (u8) => toHex(await crypto.subtle.digest('SHA-256', u8));
  const b64ToU8 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  let delO = null, delZip = null, delBusy = false;

  async function allRows(table, ownerId) {
    const out = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await sb.from(table).select('*').eq('owner_id', ownerId).order('dibuat', { ascending: true }).range(from, from + 499);
      if (error) throw new Error('Gagal membaca data ' + table + '.');
      out.push(...data);
      if (data.length < 500) break;
    }
    return out;
  }

  async function buildZip(o, say) {
    if (!window.JSZip) throw new Error('Pustaka zip belum termuat. Muat ulang halaman.');
    say('Mengambil data buyer\u2026');
    const ow = await sb.from('owners').select('*').eq('id', o.id).single();
    if (ow.error) throw new Error('Gagal membaca data buyer.');
    const st = await sb.from('settings').select('*').eq('owner_id', o.id).maybeSingle();
    if (st.error) throw new Error('Gagal membaca pengaturan tampilan.');
    const testi = await allRows('testimonials', o.id);

    say('Mengambil file website dari GitHub\u2026');
    const web = (await api({ action: 'ambil', owner_id: o.id })).files;

    const paths = [...new Set(testi.map((t) => t.media_path).filter(Boolean).concat(st.data && st.data.logo_path ? [st.data.logo_path] : []))];
    const entries = {};
    const put = (name, u8) => { entries[name] = u8; };
    put('data/owner.json', enc.encode(JSON.stringify(ow.data, null, 2)));
    put('data/settings.json', enc.encode(JSON.stringify(st.data || null, null, 2)));
    put('data/testimonials.json', enc.encode(JSON.stringify(testi, null, 2)));
    Object.keys(web).forEach((n) => put('website/' + n, b64ToU8(web[n])));

    let done = 0;
    const queue = paths.slice();
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        const r = await fetch(pubUrl(p));
        if (!r.ok) throw new Error('Gagal mengunduh foto ' + p + '. Tidak ada yang dihapus.');
        put('foto/' + p, new Uint8Array(await r.arrayBuffer()));
        say('Mengunduh foto ' + (++done) + ' dari ' + paths.length + '\u2026');
      }
    };
    if (paths.length) { say('Mengunduh foto 0 dari ' + paths.length + '\u2026'); await Promise.all([worker(), worker(), worker(), worker()]); }

    say('Menyusun dan menandatangani zip\u2026');
    const hash = {};
    for (const n of Object.keys(entries)) hash[n] = await sha256(entries[n]);
    const b = ow.data;
    const manifest = {
      format: 'testi-zip', versi_format: 1, dibuat: new Date().toISOString(),
      buyer: { id: b.id, nama_toko: b.nama_toko, email: b.email, kuota_bytes: b.kuota_bytes, terpakai_bytes: b.terpakai_bytes, github_repo: b.github_repo, vercel_project: b.vercel_project, domain: b.domain, induk_versi: b.induk_versi, dibuat: b.dibuat },
      hitung: { testimoni: testi.length, foto: paths.length, file_website: Object.keys(web).length },
      hash
    };
    const mText = JSON.stringify(manifest);
    const sig = (await api({ action: 'tanda', manifest: mText })).sig;
    const zip = new JSZip();
    zip.file('manifest.json', mText);
    zip.file('tanda-tangan.txt', sig);
    Object.keys(entries).forEach((n) => zip.file(n, entries[n]));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

    // baca balik zip: semua file harus ada
    const back = await JSZip.loadAsync(blob);
    for (const n of Object.keys(hash)) if (!back.file(n)) throw new Error('Zip tidak lengkap (' + n + '). Tidak ada yang dihapus.');
    for (const n of Object.keys(hash).filter((x) => !x.startsWith('foto/'))) {
      if ((await sha256(await back.file(n).async('uint8array'))) !== hash[n]) throw new Error('Zip rusak (' + n + '). Tidak ada yang dihapus.');
    }
    const day = new Date().toISOString().slice(0, 10);
    return { blob, name: (b.github_repo || 'website') + '-' + day + '.zip', manifest };
  }
  const enc = new TextEncoder();

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function delStage(n) {
    const one = n === 1;
    $('delTypeLbl').hidden = !one; $('delType').hidden = !one;
    $('delAgain').hidden = one;
    $('delGo').textContent = one ? 'Unduh zip' : 'Sudah tersimpan, hapus sekarang';
    $('delLead').textContent = one
      ? 'Datanya diunduh dulu sebagai zip ke perangkatmu. Folder GitHub dan proyek Vercel baru dihapus setelah kamu memastikan zip tersimpan. Data testimoni di Supabase tidak dihapus.'
      : 'Zip sudah diunduh: ' + delZip.name + ' (' + mb(delZip.blob.size) + ' MB). Cek di perangkatmu bahwa file itu tersimpan. Setelah kamu lanjut, folder GitHub dan proyek Vercel dihapus permanen.';
  }

  async function openDel(o) {
    if (!o.github_repo || !o.vercel_project) return toast('Isi Catatan website dulu (folder GitHub dan proyek Vercel).');
    delO = o; delZip = null;
    const q = (f) => f.then((r) => (r.count == null ? '?' : r.count));
    const nT = await q(sb.from('testimonials').select('id', { count: 'exact', head: true }).eq('owner_id', o.id));
    const nF = await q(sb.from('testimonials').select('id', { count: 'exact', head: true }).eq('owner_id', o.id).not('media_path', 'is', null));
    const sum = $('delSum'); sum.replaceChildren();
    [['Nama toko', o.nama_toko], ['Email buyer', o.email], ['Folder GitHub', o.github_repo], ['Proyek Vercel', o.vercel_project], ['Link', o.domain || '-'],
     ['Testimoni', nT], ['Testimoni berfoto', nF], ['Penyimpanan foto', mb(o.terpakai_bytes || 0) + ' / ' + mb(o.kuota_bytes) + ' MB'], ['Versi induk', o.induk_versi || '-']]
      .forEach((r) => { const d = h('div', 'srow'); d.appendChild(h('span', 'muted', r[0])); d.appendChild(h('span', null, String(r[1]))); sum.appendChild(d); });
    $('delTypeLbl').textContent = 'Ketik nama toko "' + o.nama_toko + '" untuk konfirmasi';
    $('delType').value = ''; $('delProg').hidden = true;
    delStage(1);
    $('modalDel').hidden = false;
  }

  async function delGo() {
    if (delBusy) return;
    const prog = $('delProg'), say = (t) => { prog.hidden = false; prog.textContent = t; };
    delBusy = true; $('delGo').disabled = true; $('delCancel').disabled = true;
    try {
      if (!delZip) {
        if ($('delType').value.trim() !== delO.nama_toko) throw new Error('Nama toko belum sama dengan yang diminta.');
        delZip = await buildZip(delO, say);
        downloadBlob(delZip.blob, delZip.name);
        prog.hidden = true;
        delStage(2);
      } else {
        say('Menghapus proyek Vercel dan folder GitHub\u2026');
        const j = await api({ action: 'hapus', owner_id: delO.id });
        $('modalDel').hidden = true;
        await load();
        toast(delO.nama_toko + ' dihapus. Zip: ' + delZip.name);
        if (j.warn && j.warn.length) setTimeout(() => alert(j.warn.join('\n\n')), 400);
        delZip = null;
      }
    } catch (er) { prog.hidden = true; toast(er.message); }
    finally { delBusy = false; $('delGo').disabled = false; $('delCancel').disabled = false; }
  }

  /* ===== LOGIN ===== */
  async function boot(session) {
    const uid = session.user.id;
    if (booted === uid) return;
    booted = uid;
    show('sLoad');
    const email = String(session.user.email || '').toLowerCase();
    const { data, error } = await sb.from('creators').select('email').eq('email', email).maybeSingle();
    if (error) return deny('Gagal memeriksa akun. Muat ulang halaman.');
    if (!data) return deny('Email ' + email + ' bukan creator.');
    $('who').textContent = email;
    show('sApp');
    await load();
  }
  async function logout() {
    await sb.auth.signOut();
    booted = null; owners = [];
    show('sLogin');
  }

  $('bLogin').onclick = () => sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname }
  });
  $('bOut1').onclick = logout;
  $('bOut2').onclick = logout;
  $('bAdd').onclick = () => { $('formAdd').reset(); $('modalAdd').hidden = false; };
  $('aCancel').onclick = () => { $('modalAdd').hidden = true; };
  $('formAdd').onsubmit = addOwner;
  $('cfgClose').onclick = () => { $('modalCfg').hidden = true; };
  $('cfgCopy').onclick = copyConfig;
  $('bExpOwner').onclick = exportOwners;
  $('bExpTesti').onclick = exportTesti;

  $('bInduk').onclick = async () => {
    try { await loadInduk(); } catch (e) { return toast(e.message); }
    picked = {}; $('indukPick').value = ''; $('indukPicked').textContent = ''; $('indukNote').value = '';
    renderInduk();
    $('modalInduk').hidden = false;
  };
  $('indukPick').onchange = pickFiles;
  $('indukSave').onclick = saveInduk;
  $('indukClose').onclick = () => { $('modalInduk').hidden = true; };
  $('formNote').onsubmit = saveNote;
  $('nCancel').onclick = () => { $('modalNote').hidden = true; };

  $('bNew').onclick = () => { $('formNew').reset(); $('wPrev').textContent = 'Link: namatoko.vercel.app'; $('wProg').hidden = true; $('modalNew').hidden = false; };
  $('wCancel').onclick = () => { $('modalNew').hidden = true; };
  $('wSlug').oninput = () => { $('wPrev').textContent = 'Link: ' + ($('wSlug').value.trim().toLowerCase() || 'namatoko') + '.vercel.app'; };
  $('formNew').onsubmit = buatWebsite;

  $('delGo').onclick = delGo;
  $('delAgain').onclick = () => { if (delZip) downloadBlob(delZip.blob, delZip.name); };
  $('delCancel').onclick = () => { if (!delBusy) { $('modalDel').hidden = true; delZip = null; } };

  sb.auth.onAuthStateChange((ev, session) => {
    if (session) boot(session);
    else { booted = null; show('sLogin'); }
  });
})();