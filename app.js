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
      ['id', 'nama_toko', 'email', 'aktif', 'kuota_mb', 'terpakai_mb', 'dibuat'],
      owners.map((o) => [o.id, o.nama_toko, o.email, o.aktif ? 'ya' : 'tidak', mb(o.kuota_bytes), mb(o.terpakai_bytes || 0), o.dibuat]));
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
  function ownerEl(o) {
    const r = h('div', 'item' + (o.aktif ? '' : ' off'));
    const top = h('div', 'otop');
    const l = h('div');
    l.appendChild(h('div', 'nm', o.nama_toko));
    l.appendChild(h('div', 'muted small', o.email));
    top.appendChild(l);
    top.appendChild(h('span', 'badge ' + (o.aktif ? 'on' : 'offb'), o.aktif ? 'Aktif' : 'Nonaktif'));
    r.appendChild(top);

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
    const b1 = h('button', 'btn ghost sm', 'Salin config.js'); b1.onclick = () => showConfig(o);
    const b2 = h('button', 'btn ghost sm', 'Ganti email'); b2.onclick = () => changeEmail(o);
    const b3 = h('button', 'btn ghost sm', 'Ubah kuota'); b3.onclick = () => changeQuota(o);
    const b4 = h('button', o.aktif ? 'btn danger sm' : 'btn sm', o.aktif ? 'Nonaktifkan' : 'Aktifkan'); b4.onclick = () => toggle(o);
    [b1, b2, b3, b4].forEach((b) => a.appendChild(b));
    r.appendChild(a);
    return r;
  }
  function render() {
    $('rows').replaceChildren(...owners.map(ownerEl));
    $('empty').hidden = owners.length > 0;
    $('stOwner').textContent = owners.length;
    $('stAktif').textContent = owners.filter((o) => o.aktif).length;
    $('stMb').textContent = mb(owners.reduce((s, o) => s + (o.terpakai_bytes || 0), 0));
  }
  async function load() {
    const { data, error } = await sb.from('owners').select('*').order('dibuat', { ascending: false });
    if (error) return toast('Gagal memuat daftar owner. Muat ulang halaman.');
    owners = data; render();
  }

  /* ===== AKSI ===== */
  async function toggle(o) {
    if (o.aktif && !confirm('Nonaktifkan ' + o.nama_toko + '? Website-nya langsung menampilkan "Layanan tidak aktif".')) return;
    const { error } = await sb.from('owners').update({ aktif: !o.aktif }).eq('id', o.id);
    if (error) return toast('Gagal mengubah status.');
    o.aktif = !o.aktif; render();
    toast(o.nama_toko + (o.aktif ? ' diaktifkan.' : ' dinonaktifkan.'));
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

  sb.auth.onAuthStateChange((ev, session) => {
    if (session) boot(session);
    else { booted = null; show('sLogin'); }
  });
})();