const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { events: [], products: [], user: null, config: {}, selectedRole: "participant", activeEvent: null };
const roleLabels = { participant: "Peserta", organizer: "Penyelenggara event", judge: "Juri", team: "Tim Rekap", admin: "Admin" };
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const rupiah = (amount) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount || 0);
const toast = (message) => {
  const box = $("#toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("show"), 3300);
};
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  $("#merch-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-merch]");
    if (button) buyMerch(Number(button.dataset.merch));
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Permintaan gagal. Silakan coba kembali.");
  return payload;
}
function openModal(content) {
  $("#modal-content").innerHTML = content;
  $("#modal-backdrop").classList.add("open");
  $("#modal-backdrop").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("#modal-backdrop").classList.remove("open");
  $("#modal-backdrop").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function showError(form, message) {
  let error = $(".form-error", form);
  if (!error) {
    error = document.createElement("div");
    error.className = "form-error";
    form.prepend(error);
  }
  error.textContent = message;
}
function loginModal() {
  openModal(`<div class="modal-kicker">SELAMAT DATANG KEMBALI</div><h2 id="modal-title">Masuk ke RekapBaris</h2><p class="modal-lead">Masuk untuk melanjutkan aktivitas event Anda.</p>
    <form id="login-form"><div class="field"><label for="login-email">EMAIL</label><input id="login-email" type="email" name="email" autocomplete="email" required></div><div class="field"><label for="login-password">PASSWORD</label><input id="login-password" type="password" name="password" autocomplete="current-password" required></div><button type="button" class="link-button" id="forgot-link">Lupa sandi?</button><button class="button button-primary modal-submit">Masuk <span>↗</span></button></form>
    <div class="google-divider">atau masuk dengan Google</div><div class="google-button-wrap" id="google-button"></div><p class="modal-switch">Belum punya akun? <button class="link-button" data-modal-action="register">Daftar sekarang</button></p>`);
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = Object.fromEntries(new FormData(form));
      state.user = (await api("/api/login", { method: "POST", body: data })).user;
      closeModal(); updateHeader(); toast(`Selamat datang, ${state.user.name}.`);
    } catch (error) { showError(form, error.message); }
  });
  $("#forgot-link").addEventListener("click", forgotModal);
  drawGoogleButton();
}
function registerModal(initialRole = "participant") {
  state.selectedRole = initialRole;
  const roles = [
    ["participant", "♟", "Peserta"], ["organizer", "▧", "Penyelenggara"], ["judge", "⚖", "Juri"]
  ];
  openModal(`<div class="modal-kicker">MULAI BERSAMA KAMI</div><h2 id="modal-title">Buat akun baru</h2><p class="modal-lead">Pilih jenis akun untuk mendapatkan pengalaman yang sesuai.</p>
    <div class="role-choices">${roles.map(([id, icon, label]) => `<button class="role-choice ${id === initialRole ? "selected" : ""}" data-role="${id}"><span>${icon}</span>${label}</button>`).join("")}</div>
    <form id="register-form"><div class="form-grid"><div class="field full"><label>NAMA LENGKAP</label><input name="name" autocomplete="name" required></div><div class="field"><label>EMAIL</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>NOMOR TELEPON</label><input name="phone" type="tel" autocomplete="tel" required></div><div class="field full"><label>PASSWORD (MINIMAL 10 KARAKTER)</label><input name="password" type="password" minlength="10" autocomplete="new-password" required></div><div class="field full organizer-field" hidden><label>SEKOLAH / INSTITUSI</label><input name="institution"></div><div class="field full organizer-field" hidden><label>NAMA EVENT</label><input name="eventName"></div></div><button class="button button-primary modal-submit">Daftar akun <span>↗</span></button></form>
    <div class="google-divider">atau daftar dengan Google</div><div class="google-button-wrap" id="google-button"></div><p class="modal-switch">Sudah punya akun? <button class="link-button" data-modal-action="login">Masuk</button></p>`);
  const setRole = (role) => {
    state.selectedRole = role;
    $$(".role-choice").forEach((button) => button.classList.toggle("selected", button.dataset.role === role));
    $$(".organizer-field").forEach((field) => {
      field.hidden = role !== "organizer";
      $("input", field).required = role === "organizer";
    });
  };
  $$(".role-choice").forEach((button) => button.addEventListener("click", () => setRole(button.dataset.role)));
  setRole(initialRole);
  $("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      state.user = (await api("/api/register", { method: "POST", body: { ...Object.fromEntries(new FormData(form)), role: state.selectedRole } })).user;
      closeModal(); updateHeader();
      toast("Akun dibuat. Akun akan aktif setelah verifikasi Tim Rekap.");
    } catch (error) { showError(form, error.message); }
  });
  drawGoogleButton();
}
function organizerModal() { registerModal("organizer"); }
function drawGoogleButton() {
  const container = $("#google-button");
  if (!container) return;
  if (!state.config.googleClientId) {
    container.innerHTML = '<span class="modal-lead">Google Sign-In aktif setelah Client ID dikonfigurasi admin.</span>';
    return;
  }
  const waitGoogle = () => {
    if (!window.google?.accounts?.id) return setTimeout(waitGoogle, 250);
    google.accounts.id.initialize({
      client_id: state.config.googleClientId,
      callback: async ({ credential }) => {
        try {
          const form = $("#register-form");
          const fields = form ? Object.fromEntries(new FormData(form)) : {};
          state.user = (await api("/api/google", { method: "POST", body: { credential, role: state.selectedRole, phone: fields.phone || "", institution: fields.institution || "", eventName: fields.eventName || "" } })).user;
          closeModal(); updateHeader(); toast("Akun Google berhasil dihubungkan. Menunggu verifikasi.");
        } catch (error) { toast(error.message); }
      }
    });
    google.accounts.id.renderButton(container, { theme: document.body.classList.contains("dark") ? "filled_black" : "outline", size: "large", text: "continue_with", shape: "rectangular", width: 300 });
  };
  waitGoogle();
}
function forgotModal() {
  openModal(`<div class="modal-kicker">BANTUAN AKUN</div><h2 id="modal-title">Lupa password?</h2><p class="modal-lead">Masukkan email akun Anda. Kami akan mengirimkan tautan reset yang berlaku selama 30 menit.</p><form id="forgot-form"><div class="field"><label>EMAIL</label><input name="email" type="email" autocomplete="email" required></div><button class="button button-primary modal-submit">Kirim tautan reset <span>↗</span></button></form><p class="modal-switch"><button class="link-button" data-modal-action="login">Kembali ke masuk</button></p>`);
  $("#forgot-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/forgot-password", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
      toast(result.message); closeModal();
    } catch (error) { showError(event.currentTarget, error.message); }
  });
}
function resetPasswordModal(token) {
  openModal(`<div class="modal-kicker">KEAMANAN AKUN</div><h2 id="modal-title">Buat password baru</h2><p class="modal-lead">Gunakan password minimal 10 karakter. Anda perlu masuk kembali setelah password diperbarui.</p><form id="reset-form"><div class="field"><label>PASSWORD BARU</label><input name="password" type="password" minlength="10" autocomplete="new-password" required></div><button class="button button-primary modal-submit">Simpan password</button></form>`);
  $("#reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/reset-password", { method: "POST", body: { token, ...Object.fromEntries(new FormData(event.currentTarget)) } });
      history.replaceState(null, "", location.pathname);
      toast(result.message); loginModal();
    } catch (error) { showError(event.currentTarget, error.message); }
  });
}
function updateHeader() {
  const area = $(".header-actions");
  const old = $("#header-account");
  if (old) old.remove();
  if (!state.user) return;
  $$(".header-login,.header-register").forEach((button) => button.hidden = true);
  const account = document.createElement("button");
  account.id = "header-account";
  account.className = "button button-primary";
  account.textContent = ["admin", "team"].includes(state.user.role) ? "Dashboard" : state.user.role === "judge" ? "Panel Juri" : state.user.role === "organizer" ? "Event saya" : state.user.name.split(" ")[0];
  account.addEventListener("click", () => ["admin", "team"].includes(state.user.role) ? dashboardModal() : state.user.role === "judge" ? judgeModal() : state.user.role === "organizer" ? organizerDashboard() : toast(state.user.status === "verified" ? `Masuk sebagai ${roleLabels[state.user.role]}.` : "Akun Anda menunggu verifikasi Tim Rekap."));
  area.insertBefore(account, $("#mobile-menu"));
}
function renderMerch() {
  const container = $("#merch-grid");
  if (!container) return;
  container.innerHTML = state.products.length ? state.products.map((product) =>
    `<article class="merch-card"><div class="merch-image" style="background-image:url('${esc(product.image).replace(/'/g, "%27")}')"></div><div class="merch-card-content"><h3>${esc(product.name)}</h3><p>${esc(product.description)}</p><div class="merch-buy-row"><strong>${rupiah(product.price)}</strong><button class="button button-primary" data-merch="${product.id}">Beli sekarang ↗</button></div></div></article>`
  ).join("") : '<div class="empty-card">Koleksi merchandise belum tersedia.</div>';
}
function eventStatus(event) {
  if (event.status === "completed") return "completed";
  return new Date(event.starts_at).getTime() < Date.now() ? "ongoing" : "available";
}
function renderEvents() {
  const search = ($("#event-search")?.value || "").toLowerCase().trim();
  const filter = $("#event-status")?.value || "all";
  const sort = $("#event-sort")?.value || "default";
  let events = state.events.filter((event) => {
    const matches = `${event.title} ${event.venue} ${event.category}`.toLowerCase().includes(search);
    return matches && (filter === "all" || eventStatus(event) === filter);
  });
  if (sort === "newest") events.sort((a, b) => b.id - a.id);
  if (sort === "popular") events.sort((a, b) => b.popularity - a.popularity);
  if (sort === "nearest") events.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const labels = { available: "TERSEDIA", ongoing: "BERLANGSUNG", completed: "SELESAI" };
  $("#event-count").textContent = `${events.length} event ditemukan`;
  $("#event-grid").innerHTML = events.length ? events.map((event) => {
    const status = eventStatus(event);
    const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(event.starts_at));
    const image = event.poster ? `background-image:url('${esc(event.poster).replace(/'/g, "%27")}')` : "";
    return `<article class="event-card"><div class="event-image" style="${image}"><span class="event-tag">${esc(event.category)}</span><span class="event-status ${status}">${labels[status]}</span><span class="event-date">◷ &nbsp;${date}</span></div><div class="event-body"><span class="event-category">REKAPBARIS · EVENT</span><h3>${esc(event.title)}</h3><div class="event-meta">⌖ &nbsp;${esc(event.venue)}</div><p class="event-description">${esc(event.description)}</p><div class="event-action"><span class="event-price">Tiket mulai <strong>${rupiah(event.ticket_price)}</strong></span><button class="text-button" data-event="${event.id}">Jelajahi ↗</button></div></div></article>`;
  }).join("") : '<div class="empty-card">Belum ada event yang sesuai dengan pencarian Anda.</div>';
}
async function showEvent(id) {
  try {
    const { event, candidates } = await api(`/api/events/${id}`);
    state.activeEvent = event;
    const status = eventStatus(event);
    const image = event.poster ? `style="background-image:url('${esc(event.poster).replace(/'/g, "%27")}')"` : "";
    openModal(`<div class="details-cover" ${image}><span>${esc(event.category)} · ${new Date(event.starts_at).toLocaleDateString("id-ID", { dateStyle: "long" })}</span></div><div class="modal-kicker">EVENT REKAPBARIS</div><h2 id="modal-title">${esc(event.title)}</h2><p class="modal-lead">⌖ ${esc(event.venue)}<br>◷ ${new Date(event.starts_at).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}</p><p class="modal-lead">${esc(event.description)}</p><div class="field"><label>JUMLAH TIKET</label><select id="ticket-quantity">${[1,2,3,4,5,6,7,8,9,10].map((n)=>`<option value="${n}">${n} tiket</option>`).join("")}</select></div><button class="button button-primary modal-submit" id="buy-ticket" ${status !== "available" ? "disabled" : ""}>Beli tiket · ${rupiah(event.ticket_price)} <span>↗</span></button><div class="google-divider">— DUKUNG PASUKAN FAVORIT —</div>${candidates.length ? `<div class="candidate-list">${candidates.map((candidate)=>`<label class="candidate-option"><input type="radio" name="candidate" value="${candidate.id}"><span>${esc(candidate.name)}<small>${esc(candidate.institution)} · ${candidate.votes} dukungan</small></span></label>`).join("")}</div><button class="button button-outline modal-submit" id="vote-button" ${status !== "available" ? "disabled" : ""}>Dukung pasukan · ${rupiah(state.config.votePrice || 5000)} <span>↗</span></button>` : "<p class='modal-lead'>Voting akan dibuka oleh penyelenggara event.</p>"}`);
    $("#buy-ticket").addEventListener("click", () => createOrder({ eventId: event.id, kind: "ticket", quantity: Number($("#ticket-quantity").value) }));
    $("#vote-button")?.addEventListener("click", () => {
      const candidateId = $('input[name="candidate"]:checked')?.value;
      if (!candidateId) return toast("Pilih pasukan yang ingin didukung.");
      createOrder({ eventId: event.id, kind: "vote", candidateId: Number(candidateId), quantity: 1 });
    });
  } catch (error) { toast(error.message); }
}
async function createOrder(body) {
  if (!state.user) { closeModal(); loginModal(); return toast("Masuk terlebih dahulu untuk melanjutkan."); }
  try {
    const result = await api("/api/orders", { method: "POST", body });
    location.assign(result.redirectUrl);
  } catch (error) { toast(error.message); }
}
function buyMerch(merchId) {
  const product = state.products.find((item) => item.id === merchId);
  if (!product) return toast("Produk tidak tersedia.");
  openModal(`<div class="modal-kicker">MERCH REKAPBARIS</div><h2 id="modal-title">Pesan ${esc(product.name)}</h2><p class="modal-lead">${esc(product.description)} · ${rupiah(product.price)} per item</p><form id="merch-form"><div class="field"><label>JUMLAH (MAKSIMAL 10)</label><input name="quantity" type="number" min="1" max="10" value="1" required></div><div class="field"><label>ALAMAT LENGKAP PENGIRIMAN</label><textarea name="shippingAddress" rows="3" minlength="10" placeholder="Nama jalan, kota, provinsi, kode pos" required></textarea></div><button class="button button-primary modal-submit">Lanjutkan pembayaran <span>↗</span></button></form>`);
  $("#merch-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = Object.fromEntries(new FormData(form));
      await createOrder({ merchId, kind: "merch", quantity: Number(data.quantity), shippingAddress: data.shippingAddress });
    } catch (error) { showError(form, error.message); }
  });
}
async function dashboardModal(tab = "users") {
  if (!state.user || !["admin", "team"].includes(state.user.role)) return loginModal();
  try {
    const result = await api("/api/admin/overview");
    openModal(`<div class="modal-kicker">RUANG KERJA REKAPBARIS</div><h2 id="modal-title">Dashboard ${roleLabels[state.user.role]}</h2><p class="modal-lead">Kelola akun, event, dan data platform Anda.</p><div class="dashboard-stats"><div class="stat-card"><b>${result.stats.users}</b><small>Pengguna</small></div><div class="stat-card"><b>${result.stats.pending}</b><small>Menunggu verifikasi</small></div><div class="stat-card"><b>${result.stats.events}</b><small>Event</small></div><div class="stat-card"><b>${rupiah(result.stats.revenue)}</b><small>Pembayaran sukses</small></div></div><div class="dashboard-tabs"><button class="dashboard-tab ${tab === "users" ? "active" : ""}" data-dash="users">Verifikasi akun</button><button class="dashboard-tab ${tab === "events" ? "active" : ""}" data-dash="events">Event</button>${state.user.role === "admin" ? '<button class="dashboard-tab" data-dash="staff">Akun staf</button>' : ""}<button class="dashboard-tab" data-dash="logout">Keluar</button></div><div id="dashboard-panel"></div>`);
    $(".dashboard-tabs").insertAdjacentHTML("afterbegin", `<button class="dashboard-tab ${tab === "profile" ? "active" : ""}" data-dash="profile">Akun saya</button>`);
    const panel = $("#dashboard-panel");
    if (tab === "users") {
      const users = result.users.filter((user) => !["admin", "team"].includes(user.role));
      panel.innerHTML = `<div class="data-list">${users.length ? users.map((user)=>`<div class="data-row"><span><b>${esc(user.name)}</b><small>${esc(user.email)} · ${roleLabels[user.role] || user.role}</small></span><span><span class="status-pill ${user.status}">${user.status === "verified" ? "TERVERIFIKASI" : "MENUNGGU"}</span> ${user.status !== "verified" ? `<button class="button button-primary verify-user" data-user="${user.id}">Verifikasi</button>` : ""}</span></div>`).join("") : '<div class="data-row">Belum ada pendaftar.</div>'}</div>`;
      $$(".verify-user", panel).forEach((button) => button.addEventListener("click", async () => {
        try { await api(`/api/admin/users/${button.dataset.user}/verify`, { method: "POST" }); dashboardModal("users"); toast("Akun berhasil diverifikasi."); }
        catch (error) { toast(error.message); }
      }));
      panel.insertAdjacentHTML("beforeend", `<h3>Transaksi terbaru</h3><div class="data-list">${result.orders.length ? result.orders.slice(0, 10).map((order) => `<div class="data-row"><span><b>${esc(order.event_title || order.product_name || "Transaksi")} · ${esc(order.customer_name)}</b><small>${esc(order.customer_email)} · ${order.kind === "vote" ? "Voting" : order.kind === "ticket" ? "Tiket" : "Merch"} × ${order.quantity}</small></span><span>${rupiah(order.amount)}<small>${esc(order.status)}</small></span></div>`).join("") : '<div class="data-row">Belum ada transaksi.</div>'}</div>`);
    } else if (tab === "events") {
      panel.innerHTML = `<div class="data-list">${result.events.map((event)=>`<div class="data-row"><span><b>${esc(event.title)}</b><small>${esc(event.venue)} · ${new Date(event.starts_at).toLocaleDateString("id-ID")}</small></span><span>${rupiah(event.ticket_price)} ${event.status === "pending" ? `<button class="button button-primary verify-event" data-event="${event.id}">Setujui</button>` : `<small>${event.status}</small>`}</span></div>`).join("")}</div>${state.user.role === "admin" ? '<button class="button button-primary" id="new-event">+ Tambah event</button>' : ""}`;
      $$(".verify-event", panel).forEach((button) => button.addEventListener("click", async () => {
        try { await api(`/api/admin/events/${button.dataset.event}/verify`, { method: "POST" }); dashboardModal("events"); toast("Event berhasil disetujui."); }
        catch (error) { toast(error.message); }
      }));
      $("#new-event")?.addEventListener("click", newEventModal);
    } else if (tab === "staff") {
      panel.innerHTML = `<p class="modal-lead">Akun staf pertama dan akun admin berikutnya dikelola di sini. Gunakan password minimal 12 karakter.</p><form id="staff-form"><div class="form-grid"><div class="field"><label>NAMA</label><input name="name" required></div><div class="field"><label>EMAIL</label><input type="email" name="email" required></div><div class="field"><label>PASSWORD AWAL</label><input type="password" minlength="12" name="password" required></div><div class="field"><label>JENIS AKUN</label><select name="role"><option value="team">Tim Rekap</option><option value="admin">Admin</option></select></div></div><button class="button button-primary modal-submit">Buat akun staf</button></form>`;
      $("#staff-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        try { await api("/api/admin/accounts", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) }); dashboardModal("staff"); toast("Akun staf berhasil dibuat."); }
        catch (error) { showError(event.currentTarget, error.message); }
      });
    } else if (tab === "profile") {
      panel.innerHTML = `<p class="modal-lead">Perbarui nama/email login atau ganti password akun staf Anda.</p><form id="profile-form"><div class="field"><label>NAMA</label><input name="name" value="${esc(state.user.name)}" required></div><div class="field"><label>EMAIL LOGIN</label><input name="email" type="email" value="${esc(state.user.email)}" required></div><div class="field"><label>PASSWORD SAAT INI</label><input name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label>PASSWORD BARU (KOSONGKAN JIKA TIDAK DIGANTI)</label><input name="newPassword" type="password" minlength="10" autocomplete="new-password"></div><button class="button button-primary modal-submit">Simpan perubahan</button></form>`;
      $("#profile-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        try {
          state.user = (await api("/api/staff/profile", { method: "POST", body: Object.fromEntries(new FormData(form)) })).user;
          updateHeader(); dashboardModal("profile"); toast("Profil akun berhasil diperbarui.");
        } catch (error) { showError(form, error.message); }
      });
    }
    $$(".dashboard-tab").forEach((button) => button.addEventListener("click", async () => {
      if (button.dataset.dash === "logout") {
        await api("/api/logout", { method: "POST" }); state.user = null; $$(".header-login,.header-register").forEach((item) => item.hidden = false); $("#header-account")?.remove(); closeModal(); toast("Anda telah keluar."); return;
      }
      dashboardModal(button.dataset.dash);
    }));
  } catch (error) { toast(error.message); }
}
async function judgeModal() {
  if (!state.user || state.user.role !== "judge") return loginModal();
  if (state.user.status !== "verified") return toast("Akun Juri Anda menunggu verifikasi Tim Rekap.");
  try {
    const { entries } = await api("/api/judge/scores");
    const groups = new Map();
    entries.forEach((entry) => {
      if (!groups.has(entry.event_id)) groups.set(entry.event_id, { title: entry.event_title, rows: [] });
      groups.get(entry.event_id).rows.push(entry);
    });
    openModal(`<div class="modal-kicker">PENILAIAN KOMPETISI</div><h2 id="modal-title">Panel Juri</h2><p class="modal-lead">Berikan nilai 1–100 untuk setiap pasukan. Nilai dapat diperbarui selama event belum selesai.</p><div id="judge-panel">${groups.size ? [...groups.values()].map((group) => `<section class="judge-event"><h3>${esc(group.title)}</h3>${group.rows.map((row) => `<form class="judge-entry" data-candidate="${row.candidate_id}"><span><b>${esc(row.candidate_name)}</b><small>${esc(row.institution)}</small></span><input name="score" type="number" min="1" max="100" value="${row.score ?? ""}" placeholder="Nilai" required aria-label="Nilai"><input name="notes" maxlength="500" value="${esc(row.notes || "")}" placeholder="Catatan (opsional)" aria-label="Catatan"><button class="button button-primary">Simpan</button>${row.score !== null ? `<span class="saved-score">Tersimpan: ${row.score}/100</span>` : ""}</form>`).join("")}</section>`).join("") : '<div class="empty-card">Belum ada event aktif atau peserta untuk dinilai.</div>'}</div>`);
    $$(".judge-entry").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/judge/scores", { method: "POST", body: { candidateId: Number(form.dataset.candidate), ...Object.fromEntries(new FormData(form)) } });
        toast("Nilai berhasil disimpan.");
        judgeModal();
      } catch (error) { showError(form, error.message); }
    }));
  } catch (error) { toast(error.message); }
}
async function organizerDashboard() {
  if (!state.user || state.user.role !== "organizer") return loginModal();
  if (state.user.status !== "verified") return toast("Akun penyelenggara Anda menunggu verifikasi Tim Rekap.");
  try {
    const { events } = await api("/api/organizer/overview");
    openModal(`<div class="modal-kicker">RUANG PENYELENGGARA</div><h2 id="modal-title">Event saya</h2><p class="modal-lead">Ajukan event baru untuk ditinjau Tim Rekap. Event tampil ke publik setelah disetujui.</p><button class="button button-primary" id="organizer-add-event">+ Ajukan event</button><div class="data-list">${events.length ? events.map((event)=>`<div class="data-row"><span><b>${esc(event.title)}</b><small>${esc(event.venue)} · ${new Date(event.starts_at).toLocaleDateString("id-ID")}</small></span><span><span class="status-pill ${event.status === "available" ? "verified" : ""}">${event.status === "pending" ? "MENUNGGU PERSETUJUAN" : esc(event.status.toUpperCase())}</span></span></div>`).join("") : '<div class="data-row">Belum ada event. Ajukan event pertamamu.</div>'}</div>`);
    $("#organizer-add-event").addEventListener("click", newEventModal);
  } catch (error) { toast(error.message); }
}
function newEventModal() {
  openModal(`<div class="modal-kicker">ADMIN REKAPBARIS</div><h2 id="modal-title">Tambahkan event</h2><p class="modal-lead">Event dan peserta dapat diisi pada formulir ini. Daftar peserta satu per baris dengan format <b>Nama pasukan | Sekolah</b>.</p><form id="event-form"><div class="form-grid"><div class="field full"><label>NAMA EVENT</label><input name="title" required></div><div class="field"><label>KATEGORI</label><input name="category" placeholder="Kompetisi" required></div><div class="field"><label>HARGA TIKET (RUPIAH)</label><input name="ticketPrice" type="number" min="0" value="0" required></div><div class="field full"><label>LOKASI</label><input name="venue" required></div><div class="field full"><label>TANGGAL & WAKTU</label><input name="startsAt" type="datetime-local" required></div><div class="field full"><label>URL POSTER (OPSIONAL)</label><input name="poster" type="url"></div><div class="field full"><label>DESKRIPSI</label><textarea name="description" rows="3" required></textarea></div><div class="field full"><label>PESERTA VOTING / KANDIDAT JURI (OPSIONAL)</label><textarea name="candidates" rows="3" placeholder="Garuda Muda | SMA Negeri 1"></textarea></div></div><button class="button button-primary modal-submit">Simpan event</button></form>`);
  $("#event-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    raw.startsAt = new Date(raw.startsAt).toISOString();
    try {
      const organizer = state.user?.role === "organizer";
      await api(organizer ? "/api/organizer/events" : "/api/admin/events", { method: "POST", body: raw });
      state.events = (await api("/api/events")).events; renderEvents();
      if (organizer) organizerDashboard();
      else { closeModal(); toast("Event berhasil ditambahkan."); }
    } catch (error) { showError(form, error.message); }
  });
}
function setup() {
  const dark = localStorage.getItem("rb-theme") === "dark";
  document.body.classList.toggle("dark", dark);
  $("#theme-icon").textContent = dark ? "☀" : "☾";
  $("#theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("rb-theme", isDark ? "dark" : "light");
    $("#theme-icon").textContent = isDark ? "☀" : "☾";
  });
  $("#mobile-menu").addEventListener("click", () => $("#mobile-nav").classList.toggle("open"));
  $$(".mobile-nav a").forEach((link) => link.addEventListener("click", () => $("#mobile-nav").classList.remove("open")));
  $("#event-search").addEventListener("input", renderEvents);
  $("#event-status").addEventListener("change", renderEvents);
  $("#event-sort").addEventListener("change", renderEvents);
  $("#event-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-event]");
    if (button) showEvent(Number(button.dataset.event));
  });
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-backdrop").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-open],[data-modal-action]");
    if (!action) return;
    if (action.dataset.open === "login" || action.dataset.modalAction === "login") loginModal();
    if (action.dataset.open === "register" || action.dataset.modalAction === "register") registerModal();
    if (action.dataset.open === "organizer") organizerModal();
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || !entry.target.id) return;
      $$(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.nav === entry.target.id));
    });
  }, { rootMargin: "-25% 0px -65% 0px" });
  $$(".section-anchor").forEach((section) => observer.observe(section));
}
async function init() {
  setup();
  try {
    const [config, events, merchandise] = await Promise.all([api("/api/config"), api("/api/events"), api("/api/merchandise")]);
    state.config = config; state.events = events.events; state.products = merchandise.products; renderEvents(); renderMerch();
    try { state.user = (await api("/api/me")).user; updateHeader(); }
    catch (error) {
      if (!error.message.includes("masuk") && !error.message.includes("Sesi telah berakhir")) throw error;
    }
  } catch (error) {
    $("#event-grid").innerHTML = `<div class="empty-card">${esc(error.message)}. Muat ulang halaman untuk mencoba lagi.</div>`;
  }
  const resetToken = new URLSearchParams(location.search).get("reset");
  if (resetToken) resetPasswordModal(resetToken);
  else if (new URLSearchParams(location.search).has("payment")) toast("Terima kasih. Status pembayaran akan diperbarui setelah konfirmasi Midtrans.");
  setTimeout(() => $("#page-loader").classList.add("hide"), 450);
}
init();
