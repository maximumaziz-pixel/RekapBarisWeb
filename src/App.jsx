import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, Check,
  ChevronDown, Clock3, Compass, CreditCard, Fingerprint, Heart,
  Instagram, LayoutDashboard, LockKeyhole, Moon, Search,
  ShieldCheck, ShoppingBag, Sun, Ticket, Trophy, UserRound, Users, Vote,
  X, Zap
} from "lucide-react";
import GoogleAuthModal from "./components/AuthModal.jsx";
import WhatsAppFloat from "./components/WhatsAppFloat.jsx";

const navigation = [
  { id: "home", label: "Home", icon: Compass },
  { id: "events", label: "Event", icon: CalendarDays },
  { id: "voting", label: "E-Voting", icon: Vote },
  { id: "tickets", label: "E-Ticketing", icon: Ticket },
  { id: "merch", label: "Merch", icon: ShoppingBag },
  { id: "about", label: "Tentang", icon: Fingerprint }
];
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = response.status === 204 || !isJson ? null : await response.json();
  if (!response.ok) {
    const error = new Error(data?.error || `Server mengembalikan respons HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  if (response.status !== 204 && !isJson) throw new Error("Server mengembalikan respons yang tidak valid.");
  return data;
}

function rupiah(value = 0) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function eventState(event) {
  const now = Date.now();
  if (event.endsAt && new Date(event.endsAt).getTime() < now) return "Selesai";
  if (event.startsAt && new Date(event.startsAt).getTime() <= now) return "Berlangsung";
  return "Tersedia";
}

function formatDate(value) {
  if (!value) return "Jadwal segera diumumkan";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("rb-theme") || "light");
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Semua event");
  const [sortBy, setSortBy] = useState("Default");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [participantName, setParticipantName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busyId, setBusyId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [staffData, setStaffData] = useState({ users: [], events: [], payments: [] });
  const [staffSection, setStaffSection] = useState("overview");
  const [memberDashboard, setMemberDashboard] = useState(null);
  const [productForm, setProductForm] = useState({ name: "", description: "", imageUrl: "", price: "", stock: "" });
  const emptyEventForm = { name: "", institution: "", description: "", posterUrl: "", posterFile: null, startsAt: "", endsAt: "", schedules: [{ startsAt: "", endsAt: "" }], location: "", ticketPrice: "0", votePrice: "1000" };
  const [eventForm, setEventForm] = useState(emptyEventForm);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("rb-theme", theme);
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("auth");
    const token = params.get("resetToken");
    if (token) {
      setResetToken(token);
      setAuthMode("reset-password");
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
      return;
    }
    const messages = {
      success: "Berhasil masuk dengan Google. Selamat datang!",
      pending: "Akun Anda masih menunggu persetujuan tim Rekap Baris.",
      blocked: "Akun ini tidak dapat digunakan. Hubungi administrator.",
      cancelled: "Login Google dibatalkan.",
      account_conflict: "Email ini sudah terhubung ke akun Google lain.",
      not_registered: "Akun belum terdaftar. Daftar terlebih dahulu dengan email dan password.",
      google_error: "Login Google gagal. Periksa konfigurasi OAuth atau masuk dengan email dan password."
    };
    if (!result) return;
    if (result === "google_error" || result === "account_conflict" || result === "not_registered") {
      setError(messages[result]);
      setAuthMode("login");
    } else {
      setNotice(messages[result] || "Status login Google diperbarui.");
      if (result === "success") setActiveTab("dashboard");
    }
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
  }, []);

  const refreshPublicData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventData, merchData] = await Promise.all([api("/events"), api("/merch")]);
      setEvents(eventData.events);
      setProducts(merchData.products);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    try {
      const [summary, users, eventsData, payments, products] = await Promise.all([
        api("/admin/summary"),
        api("/admin/users"),
        api("/admin/events"),
        api("/admin/payments"),
        api("/admin/products")
      ]);
      setDashboard(summary.summary);
      setStaffData({ users: users.users, events: eventsData.events, payments: payments.payments, products: products.products });
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    refreshPublicData();
    api("/auth/me").then((data) => setUser(data.user)).catch((requestError) => {
      if (requestError.status !== 401) setError(requestError.message);
    });
  }, [refreshPublicData]);

  useEffect(() => {
    if (user && ["ADMIN", "TEAM"].includes(user.role)) refreshDashboard();
  }, [user, refreshDashboard]);

  useEffect(() => {
    if (!user || ["ADMIN", "TEAM"].includes(user.role)) return;
    api("/dashboard").then(setMemberDashboard).catch((requestError) => setError(requestError.message));
  }, [user]);

  const openTab = async (tab) => {
    if (tab === activeTab) return;
    setTransitioning(true);
    setError("");
    window.setTimeout(() => {
      setActiveTab(tab);
      setTransitioning(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 170);
  };

  const startAuth = (mode) => {
    setError("");
    setNotice("");
    setAuthMode(mode);
  };

  const authenticateWithPassword = async (mode, credentials) => {
    setError("");
    const endpoint = {
      login: "/auth/login",
      register: "/auth/register",
      "forgot-password": "/auth/forgot-password",
      "reset-password": "/auth/reset-password"
    }[mode];
    if (!endpoint) throw new Error("Jenis autentikasi tidak dikenal.");
    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(credentials)
    });
    setAuthMode("");
    setNotice(mode === "register"
      ? "Pendaftaran berhasil. Akun menunggu persetujuan Admin/Tim Rekap."
      : mode === "login" ? "Berhasil masuk. Selamat datang!" : result.message);
    if (mode === "reset-password") setResetToken("");
    if (result.user) {
      setUser(result.user);
      if (mode === "login") setActiveTab("dashboard");
    }
  };

  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setDashboard(null);
      setMemberDashboard(null);
      setActiveTab("home");
      setNotice("Anda sudah keluar.");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const openEvent = async (event) => {
    setSelectedEvent({ ...event, participants: null });
    setBusyId("event-detail");
    try {
      const data = await api(`/events/${event.id}`);
      setSelectedEvent(data.event);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const pay = async (type, payload, busyKey) => {
    if (!user) {
      setSelectedEvent(null);
      startAuth("login");
      setError("Masuk untuk melanjutkan.");
      return;
    }
    setBusyId(busyKey);
    setError("");
    try {
      const result = await api(`/payments/${type}`, { method: "POST", body: JSON.stringify(payload) });
      window.location.assign(result.redirectUrl);
    } catch (requestError) {
      setError(requestError.message);
      setBusyId("");
    }
  };

  const registerParticipant = async (eventId) => {
    if (!user) {
      setSelectedEvent(null);
      startAuth("login");
      setError("Masuk untuk mendaftarkan peserta.");
      return;
    }
    setBusyId("participant-register");
    try {
      await api(`/events/${eventId}/register`, {
        method: "POST",
        body: JSON.stringify({ participantName: participantName || user.name, teamName })
      });
      setNotice("Pendaftaran peserta dikirim untuk verifikasi.");
      setParticipantName("");
      setTeamName("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const changeStatus = async (path, status, refresh = refreshDashboard) => {
    setBusyId(path);
    try {
      await api(path, { method: "PATCH", body: JSON.stringify({ status }) });
      await refresh();
      setNotice("Perubahan berhasil disimpan.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const createProduct = async (event) => {
    event.preventDefault();
    setBusyId("product-create");
    try {
      await api("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          ...productForm,
          price: Number(productForm.price),
          stock: Number(productForm.stock)
        })
      });
      setProductForm({ name: "", description: "", imageUrl: "", price: "", stock: "" });
      await refreshPublicData();
      setNotice("Produk merchandise ditambahkan.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const createEvent = async (event) => {
    event.preventDefault();
    setBusyId("event-create");
    try {
      const { posterFile, ...eventFields } = eventForm;
      const result = await api("/events", {
        method: "POST",
        body: JSON.stringify({
          ...eventFields,
          startsAt: eventForm.schedules[0]?.startsAt ? new Date(eventForm.schedules[0].startsAt).toISOString() : "",
          endsAt: eventForm.schedules.at(-1)?.endsAt ? new Date(eventForm.schedules.at(-1).endsAt).toISOString() : "",
          schedules: eventForm.schedules.filter((date) => date.startsAt).map((date) => ({ startsAt: new Date(date.startsAt).toISOString(), endsAt: date.endsAt ? new Date(date.endsAt).toISOString() : "" })),
          ticketPrice: Number(eventForm.ticketPrice),
          votePrice: Number(eventForm.votePrice)
        })
      });
      let posterError = "";
      if (posterFile) {
        try {
          if (posterFile.size > 5 * 1024 * 1024) throw new Error("Ukuran poster maksimal 5 MB.");
          if (!["image/jpeg", "image/png", "image/webp"].includes(posterFile.type)) throw new Error("Poster harus JPEG, PNG, atau WebP.");
          await api(`/events/${result.event.id}/poster`, { method: "PUT", headers: { "Content-Type": posterFile.type }, body: posterFile });
        }
        catch (uploadError) { posterError = ` Event tersimpan, tetapi poster gagal diunggah: ${uploadError.message}`; }
      }
      setEventForm(emptyEventForm);
      await refreshPublicData();
      if (["ADMIN", "TEAM"].includes(user?.role)) await refreshDashboard();
      else setMemberDashboard(await api("/dashboard"));
      setNotice(`Event berhasil diajukan. Event Admin langsung aktif; pengajuan lain menunggu verifikasi.${posterError}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const updateProduct = async (id, changes) => {
    setBusyId(`product-${id}`);
    try {
      await api(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
      await Promise.all([refreshPublicData(), refreshDashboard()]);
      setNotice("Stok merchandise berhasil diperbarui.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = events.filter((event) => {
      const searchable = `${event.name} ${event.institution} ${event.location}`.toLowerCase();
      const matchesQuery = !query || searchable.includes(query);
      const state = eventState(event);
      const matchesStatus = statusFilter === "Semua event" || state === statusFilter;
      return matchesQuery && matchesStatus;
    });
    if (sortBy === "Terbaru") return filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (sortBy === "Popular") return filtered.sort((a, b) => (b.votes + b.participants) - (a.votes + a.participants));
    if (sortBy === "Terdekat") return filtered.sort((a, b) => new Date(a.startsAt || "2999-01-01") - new Date(b.startsAt || "2999-01-01"));
    return filtered;
  }, [events, search, sortBy, statusFilter]);

  return (
    <div className="app-shell min-h-screen">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => openTab("home")} aria-label="Rekap Baris, ke beranda">
          <img src="/logo.svg" alt="" />
          <span>rekap<span className="brand-light">baris</span><small>.com</small></span>
        </button>
        <nav className="desktop-nav" aria-label="Navigasi utama">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${activeTab === id ? "is-active" : ""}`} type="button" onClick={() => openTab(id)}>
              <Icon size={16} strokeWidth={1.8} /> {label}
            </button>
          ))}
          {user && ["ADMIN", "TEAM"].includes(user.role) && (
            <button className={`nav-link ${activeTab === "dashboard" ? "is-active" : ""}`} type="button" onClick={() => openTab("dashboard")}>
              <LayoutDashboard size={16} /> Dashboard
            </button>
          )}
          {user && !["ADMIN", "TEAM"].includes(user.role) && (
            <button className={`nav-link ${activeTab === "dashboard" ? "is-active" : ""}`} type="button" onClick={() => openTab("dashboard")}>
              <LayoutDashboard size={16} /> Dashboard
            </button>
          )}
        </nav>
        <div className="top-actions">
          <button className="icon-button theme-toggle" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Ganti tema">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {user ? (
            <div className="user-menu">
              <span className="user-avatar"><UserRound size={16} /></span>
              <span className="user-name">{user.name.split(" ")[0]}</span>
              <button className="button button-quiet button-small" onClick={() => openTab("dashboard")} type="button">Dashboard</button>
              <button className="button button-outline button-small" onClick={logout} type="button">Keluar</button>
            </div>
          ) : (
            <>
              <button className="button button-quiet login-button" onClick={() => startAuth("login")} type="button">Masuk</button>
              <button className="button button-primary header-signup" onClick={() => startAuth("register")} type="button">Daftar <ArrowUpRight size={15} /></button>
            </>
          )}
        </div>
      </header>

      <nav className="mobile-nav" aria-label="Navigasi utama">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`mobile-nav-link ${activeTab === id ? "is-active" : ""}`} onClick={() => openTab(id)} type="button">
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
        {user && <button className={`mobile-nav-link ${activeTab === "dashboard" ? "is-active" : ""}`} onClick={() => openTab("dashboard")} type="button"><LayoutDashboard size={19} /><span>Akun</span></button>}
      </nav>

      {(error || notice) && (
        <div className={`toast ${error ? "toast-error" : "toast-success"}`} role="status">
          {error ? <X size={17} /> : <Check size={17} />}
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Tutup"><X size={16} /></button>
        </div>
      )}

      <main className={`main-content ${transitioning ? "page-exit" : "page-enter"}`}>
        {transitioning ? <PageLoader /> : (
          <>
            {activeTab === "home" && <HomePage onRegister={() => startAuth("register")} onLogin={() => startAuth("login")} onExplore={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} onBrowse={() => openTab("events")} />}
            {["events", "voting", "tickets"].includes(activeTab) && (
              <EventPage
                type={activeTab}
                events={visibleEvents}
                loading={loading}
                search={search}
                setSearch={setSearch}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                sortBy={sortBy}
                setSortBy={setSortBy}
                onSelect={openEvent}
              />
            )}
            {activeTab === "merch" && (
              <MerchPage products={products} loading={loading} user={user} busyId={busyId} onBuy={(product) => pay("merch", { productId: product.id, quantity: 1 }, product.id)} />
            )}
            {activeTab === "about" && <AboutPage onJoin={() => startAuth("register")} />}
            {activeTab === "dashboard" && user && ["ADMIN", "TEAM"].includes(user.role) && <><DashboardPage
              user={user}
              summary={dashboard}
              data={staffData}
              section={staffSection}
              setSection={setStaffSection}
              busyId={busyId}
              productForm={productForm}
              setProductForm={setProductForm}
              onProductCreate={createProduct}
              onUserStatus={(id, status) => changeStatus(`/admin/users/${id}/status`, status)}
              onEventStatus={(id, status) => changeStatus(`/admin/events/${id}/status`, status)}
              onRefresh={refreshDashboard}
            /><DashboardTools products={staffData.products} events={staffData.events} busyId={busyId} eventForm={eventForm} setEventForm={setEventForm} onEventCreate={createEvent} onProductUpdate={updateProduct} /></>}
            {activeTab === "dashboard" && user && !["ADMIN", "TEAM"].includes(user.role) && <MemberDashboard user={user} data={memberDashboard} eventForm={eventForm} setEventForm={setEventForm} onEventCreate={createEvent} busyId={busyId} onRefresh={async () => setMemberDashboard(await api("/dashboard"))} />}
          </>
        )}
      </main>

      <Footer onNavigate={openTab} />

      <WhatsAppFloat />

      {authMode && <GoogleAuthModal
        mode={authMode}
        setMode={startAuth}
        close={() => { setAuthMode(""); setError(""); }}
        error={error}
        resetToken={resetToken}
        onCredentialAuth={authenticateWithPassword}
      />}

      {selectedEvent && <EventModal
        event={selectedEvent}
        loading={busyId === "event-detail"}
        user={user}
        participantName={participantName}
        setParticipantName={setParticipantName}
        teamName={teamName}
        setTeamName={setTeamName}
        quantity={quantity}
        setQuantity={setQuantity}
        busyId={busyId}
        close={() => setSelectedEvent(null)}
        onRegister={registerParticipant}
        onBuyTicket={() => pay("ticket", { eventId: selectedEvent.id, quantity }, "ticket")}
        onVote={(registrationId) => pay("vote", { eventId: selectedEvent.id, registrationId }, registrationId)}
        onLogin={() => { setSelectedEvent(null); startAuth("login"); }}
        onReload={() => openEvent(selectedEvent)}
        onMessage={(message) => setError(message)}
      />}
    </div>
  );
}

function PageLoader() {
  return <div className="page-loader" role="status"><span className="loader-orbit" /><p>Menyiapkan pengalaman Anda...</p></div>;
}

function HomePage({ onRegister, onLogin, onExplore, onBrowse }) {
  return (
    <>
      <section className="hero section-wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse-dot" /> PLATFORM EVENT GENERASI BARU</div>
          <h1>REKAP<br /><em>BARIS.</em></h1>
          <h2>Solusi Digitalisasi Event Anda</h2>
          <p>Mengelola penilaian, voting pasukan, ticketing dalam satu digital platform.</p>
          <div className="hero-actions">
            <button className="button button-primary button-large" onClick={onRegister} type="button">Selenggarakan event anda <ArrowRight size={17} /></button>
            <button className="button button-outline button-large" onClick={onLogin} type="button"><LockKeyhole size={16} /> Masuk</button>
          </div>
          <div className="hero-footnote"><ShieldCheck size={15} /> Aman, praktis, siap untuk momen besar Anda</div>
        </div>
        <div className="hero-art" aria-label="Ilustrasi event Rekap Baris">
          <div className="hero-glow" />
          <img className="hero-logo-watermark" src="/logo.svg" alt="" aria-hidden="true" />
          <div className="hero-ring ring-one" /><div className="hero-ring ring-two" />
          <div className="hero-orbit"><span /><span /><span /></div>
          <div className="hero-card hero-card-top"><div className="mini-icon"><Trophy size={17} /></div><div><strong>Baris Nusantara</strong><small>Event aktif • Bandung</small></div><BadgeCheck size={17} className="verified-mark" /></div>
          <div className="hero-emblem"><span>R</span><small>BARIS<br />BERSATU</small></div>
          <div className="hero-card hero-card-bottom"><div className="avatar-stack"><i>R</i><i>A</i><i>+</i></div><div><strong>Komunitas bertumbuh</strong><small>Event jadi lebih bermakna</small></div></div>
          <div className="hero-stat"><span className="stat-icon"><Zap size={15} /></span><strong>One platform.</strong><small>Endless possibilities.</small></div>
        </div>
        <button className="scroll-hint" type="button" onClick={onExplore}><ArrowDown size={15} /> Apa itu Rekap Baris</button>
      </section>
      <section className="trust-strip">
        <div className="section-wrap trust-inner"><span>DIRANCANG UNTUK KOMUNITAS</span><div><Users size={16} /> Penyelenggara</div><div><Trophy size={16} /> Peserta & juri</div><div><CreditCard size={16} /> Penonton</div></div>
      </section>
      <section className="section-wrap feature-section" id="features">
        <div className="section-heading"><span className="eyebrow">DARI AWAL SAMPAI AKHIR</span><h2>Fokus pada acaranya.<br /><em>Urusan digital kami.</em></h2><p>Perangkat event yang menyatukan penyelenggara, peserta, dan penonton—tanpa proses yang berbelit.</p></div>
        <div className="feature-grid">
          <FeatureCard icon={CalendarDays} number="01" title="Event" text="Temukan kompetisi, kelola pendaftaran, dan pantau informasi acara dalam satu ruang." tone="mint" />
          <FeatureCard icon={Vote} number="02" title="E-Voting" text="Dukung pasukan favorit melalui voting digital dengan pembayaran QRIS." tone="lime" />
          <FeatureCard icon={Ticket} number="03" title="E-Ticketing" text="Beli tiket penonton secara praktis. Semua transaksi tercatat dengan rapi." tone="cream" />
        </div>
        <div className="feature-cta"><span>Siap menyusun baris berikutnya?</span><button className="button button-dark" type="button" onClick={onRegister}>Mulai bersama kami <ArrowRight size={16} /></button></div>
      </section>
      <section className="manifesto">
        <div className="section-wrap manifesto-inner"><div className="manifesto-mark">“</div><div><span className="eyebrow">TUMBUH BERSAMA KOMUNITAS</span><h2>Lebih dari sekadar<br /><em>mengelola acara.</em></h2><p>Rekap Baris membantu setiap momen, dukungan, dan semangat kebersamaan terasa lebih dekat—di dalam maupun di luar lapangan.</p><button className="text-link" type="button" onClick={onBrowse}>Jelajahi event <ArrowRight size={15} /></button></div><div className="manifesto-stamp"><span>RB</span><small>REKAP<br />BARIS</small></div></div>
      </section>
    </>
  );
}

function FeatureCard({ icon: Icon, number, title, text, tone }) {
  return <article className={`feature-card tone-${tone}`}><div className="feature-card-head"><div className="feature-icon"><Icon size={22} /></div><span>{number}</span></div><h3>{title}</h3><p>{text}</p><div className="feature-line" /></article>;
}

function EventPage({ type, events, loading, search, setSearch, statusFilter, setStatusFilter, sortBy, setSortBy, onSelect }) {
  const isVoting = type === "voting";
  const isTickets = type === "tickets";
  const title = isVoting ? "Dukung pasukan pilihanmu." : isTickets ? "Jadi bagian dari tribun." : "Temukan baris berikutnya.";
  return (
    <section className="section-wrap directory-page">
      <div className="page-kicker"><span className="eyebrow">REKAP BARIS / {type === "events" ? "EVENT" : isVoting ? "E-VOTING" : "E-TICKETING"}</span><span className="live-pill"><i /> DIREKTORI EVENT</span></div>
      <div className="directory-heading"><div><h1>{title}</h1><p>Jelajahi event dan kompetisi yang bekerjasama.</p></div><div className="directory-total"><strong>{events.length.toString().padStart(2, "0")}</strong><span>event terkurasi</span></div></div>
      <div className="filter-bar">
        <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari event atau penyelenggara..." /></label>
        <label className="select-wrap"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Semua event</option><option>Tersedia</option><option>Berlangsung</option><option>Selesai</option></select><ChevronDown size={14} /></label>
        <label className="select-wrap"><span>Urutkan</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option>Default</option><option>Terbaru</option><option>Popular</option><option>Terdekat</option></select><ChevronDown size={14} /></label>
      </div>
      {loading ? <CardSkeletons /> : events.length ? (
        <div className="event-grid">{events.map((event, index) => <EventCard key={event.id} event={event} index={index} onClick={() => onSelect(event)} action={isVoting ? "Beri dukungan" : isTickets ? "Beli tiket" : "Lihat detail"} />)}</div>
      ) : <EmptyState icon={CalendarDays} title="Belum ada event yang cocok" text="Coba kata pencarian atau filter yang berbeda. Event baru akan tampil setelah diverifikasi." />}
      <div className="directory-note"><ShieldCheck size={16} /><span>Event ditampilkan setelah melewati verifikasi tim Rekap Baris.</span></div>
    </section>
  );
}

function EventCard({ event, index, onClick, action }) {
  const state = eventState(event);
  const palettes = ["poster-green", "poster-lime", "poster-cream"];
  return (
    <article className="event-card" style={{ animationDelay: `${index * 50}ms` }}>
      <button type="button" className={`event-poster ${palettes[index % palettes.length]}`} onClick={onClick} aria-label={`Buka ${event.name}`}>
        {event.posterUrl ? <img src={event.posterUrl} alt="" loading="lazy" /> : <><span className="poster-spark">✳</span><span className="poster-monogram">RB</span><span className="poster-caption">KOMPETISI<br />BARIS-BERBARIS</span></>}
        <span className={`event-status ${state === "Berlangsung" ? "status-live" : ""}`}><i />{state}</span>
      </button>
      <div className="event-card-body">
        <div className="event-meta"><span><CalendarDays size={14} />{event.schedules?.length ? `${event.schedules.length} tanggal pelaksanaan` : formatDate(event.startsAt)}</span><span><Users size={14} />{event.participants} peserta</span></div>
        <h3>{event.name}</h3><p>{event.institution}{event.location ? ` · ${event.location}` : ""}</p>
        <div className="event-card-bottom"><span className="event-social"><Heart size={14} /> {event.votes} dukungan</span><button type="button" onClick={onClick}>{action} <ArrowRight size={14} /></button></div>
      </div>
    </article>
  );
}

function CardSkeletons() {
  return <div className="event-grid">{[1, 2, 3].map((item) => <div className="skeleton-card" key={item}><div className="skeleton poster-skeleton" /><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line medium" /></div>)}</div>;
}

function MerchPage({ products, loading, user, busyId, onBuy }) {
  return (
    <section className="section-wrap directory-page">
      <div className="page-kicker"><span className="eyebrow">REKAP BARIS / OFFICIAL MERCH</span><span className="live-pill"><i /> TOKO RESMI</span></div>
      <div className="directory-heading"><div><h1>Semangatnya,<br /><em>bisa dibawa pulang.</em></h1><p>Merchandise pilihan untuk merayakan kebersamaan dan mendukung gerakan baris.</p></div><div className="directory-total"><ShoppingBag size={29} /><span>Koleksi resmi</span></div></div>
      {loading ? <CardSkeletons /> : products.length ? (
        <div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}><div className="product-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" /> : <div className="product-placeholder"><span>RB</span><small>OFFICIAL<br />MERCHANDISE</small></div>}<span className="stock-label">{product.stock ? `${product.stock} tersedia` : "Habis"}</span></div><div className="product-details"><span className="eyebrow">REKAP BARIS GOODS</span><h3>{product.name}</h3><p>{product.description || "Koleksi resmi Rekap Baris."}</p><div className="product-purchase"><strong>{rupiah(product.price)}</strong><button className="button button-primary" type="button" disabled={!product.stock || busyId === product.id} onClick={() => onBuy(product)}>{busyId === product.id ? "Memproses..." : user ? "Beli sekarang" : "Masuk untuk beli"}</button></div></div></article>)}</div>
      ) : <EmptyState icon={ShoppingBag} title="Koleksi sedang disiapkan" text="Produk resmi Rekap Baris akan hadir di sini." />}
    </section>
  );
}

function AboutPage({ onJoin }) {
  return <section className="section-wrap about-page"><div className="about-cover"><span className="eyebrow">RUANG UNTUK SEMUA BARIS</span><h1>Teknologi yang<br /><em>menyatukan gerakan.</em></h1><p>Rekap Baris adalah platform digital untuk membuat pengelolaan event, kompetisi, dukungan komunitas, dan ticketing lebih sederhana.</p><button className="button button-primary button-large" onClick={onJoin} type="button">Bertumbuh bersama <ArrowRight size={16} /></button><div className="about-orbit">RB</div></div><div className="about-values"><div><span>01 / KONEKSI</span><h3>Satu ruang untuk seluruh ekosistem event.</h3><p>Penyelenggara, peserta, juri, dan penonton dapat terhubung lewat pengalaman yang konsisten.</p></div><div><span>02 / TRANSPARANSI</span><h3>Proses yang jelas, data yang tertata.</h3><p>Moderasi event dan akun menjaga ruang publik tetap terpercaya dan nyaman digunakan.</p></div><div><span>03 / KEBERSAMAAN</span><h3>Semangat komunitas tetap menjadi pusatnya.</h3><p>Teknologi hadir untuk mendukung momen kebersamaan, bukan menggantikannya.</p></div></div></section>;
}

function MemberDashboard({ user, data, eventForm, setEventForm, onEventCreate, busyId, onRefresh }) {
  const roleNames = {
    PARTICIPANT: "Dashboard Peserta",
    ORGANIZER: "Dashboard Penyelenggara",
    JUDGE: "Dashboard Juri"
  };
  if (!data) return <section className="section-wrap dashboard-page"><div className="dashboard-wait"><span className="loader-orbit" /><span>Memuat dashboard...</span></div></section>;

  return <section className="section-wrap dashboard-page">
    <div className="dashboard-heading">
      <div><span className="eyebrow">DASHBOARD / {user.role}</span><h1>{roleNames[user.role]}</h1><p>Selamat datang, {user.name}. Status akun: {user.status}.</p></div>
    </div>
    <div className="member-dashboard">
      <article className="dashboard-panel">
        <span className="eyebrow">PROFIL AKUN</span>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
        {user.phone && <p>{user.phone}</p>}
        {user.institution && <p>Asal satuan: {user.institution}</p>}
      </article>
      {user.role === "PARTICIPANT" && <>
        <article className="dashboard-panel">
          <span className="eyebrow">PENDAFTARAN EVENT</span>
          <h2>{data.registrations.length} pendaftaran</h2>
          {data.registrations.map((item) => <div className="member-dashboard-row" key={item.id}><strong>{item.event.name}</strong><span>{item.status}</span><small>{item.participantName}{item.teamName ? ` · ${item.teamName}` : ""}</small></div>)}
          {!data.registrations.length && <p className="empty-inline">Belum ada pendaftaran event melalui akun ini.</p>}
        </article>
        <article className="dashboard-panel">
          <span className="eyebrow">PEMBAYARAN</span>
          <h2>{data.payments.length} transaksi terbaru</h2>
          {data.payments.map((payment) => <div className="member-dashboard-row" key={payment.id}><strong>{payment.event?.name || payment.product?.name || payment.type}</strong><span>{payment.status}</span><small>{rupiah(payment.amount)} · {new Date(payment.createdAt).toLocaleDateString("id-ID")}</small></div>)}
          {!data.payments.length && <p className="empty-inline">Belum ada transaksi.</p>}
        </article>
      </>}
      {user.role === "ORGANIZER" && <article className="dashboard-panel">
        <span className="eyebrow">EVENT SAYA</span>
        <h2>{data.events.length} event</h2>
        {data.events.map((event) => <OrganizerEventRow key={event.id} event={event} onSaved={onRefresh} />)}
        {!data.events.length && <p className="empty-inline">Belum ada event di akun ini. Hubungi Tim Rekap untuk mengajukan event.</p>}
      </article>}
      {user.role === "ORGANIZER" && <OrganizerEventForm eventForm={eventForm} setEventForm={setEventForm} onEventCreate={onEventCreate} busyId={busyId} />}
      {user.role === "JUDGE" && <article className="dashboard-panel">
        <span className="eyebrow">EVENT DI SATUAN ANDA</span>
        <h2>{data.events.length} event tersedia</h2>
        <p>{user.institution ? `Daftar ini menampilkan event yang disetujui pada asal satuan ${user.institution}.` : "Daftar event yang telah disetujui."} Penugasan juri dikelola terpisah oleh Tim Rekap.</p>
        {data.events.map((event) => <div className="member-dashboard-row" key={event.id}><strong>{event.name}</strong><span>{event.startsAt ? formatDate(event.startsAt) : "Jadwal segera diumumkan"}</span><small>{event.institution}</small></div>)}
        {!data.events.length && <p className="empty-inline">Belum ada event tersedia untuk asal satuan ini.</p>}
      </article>}
      {user.role === "JUDGE" && data.events.length > 0 && <JudgeScoring events={data.events} />}
    </div>
  </section>;
}

function localDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function OrganizerEventRow({ event, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: event.name,
    description: event.description,
    location: event.location,
    posterUrl: event.posterUrl,
    schedules: event.schedules?.length ? event.schedules.map((date) => ({ startsAt: localDateTimeValue(date.startsAt), endsAt: localDateTimeValue(date.endsAt) })) : event.startsAt ? [{ startsAt: localDateTimeValue(event.startsAt), endsAt: localDateTimeValue(event.endsAt) }] : [{ startsAt: "", endsAt: "" }]
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const schedules = form.schedules.filter((date) => date.startsAt).map((date) => ({ startsAt: new Date(date.startsAt).toISOString(), endsAt: date.endsAt ? new Date(date.endsAt).toISOString() : "" }));
      const { posterFile, ...fields } = form;
      await api(`/events/${event.id}`, { method: "PATCH", body: JSON.stringify({ ...fields, schedules }) });
      if (posterFile) {
        try {
          if (posterFile.size > 5 * 1024 * 1024) throw new Error("Ukuran poster maksimal 5 MB.");
          if (!["image/jpeg", "image/png", "image/webp"].includes(posterFile.type)) throw new Error("Poster harus JPEG, PNG, atau WebP.");
          await api(`/events/${event.id}/poster`, { method: "PUT", headers: { "Content-Type": posterFile.type }, body: posterFile });
        } catch (uploadError) {
          setEditing(false); setError(`Detail event tersimpan, tetapi poster gagal diunggah: ${uploadError.message}`); await onSaved(); return;
        }
      }
      setEditing(false); setForm({ ...form, posterFile: null }); await onSaved();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  return <div className="organizer-event-row">
    <div className="member-dashboard-row"><strong>{event.name}</strong><span>{event.status}</span><small>{event.institution} · {event._count.registrations} pendaftar{event.schedules?.length ? ` · ${event.schedules.length} tanggal` : ""}</small></div>
    <button type="button" className="text-link" onClick={() => setEditing((value) => !value)}>{editing ? "Tutup editor" : "Edit detail"}</button>
    {editing && <form className="organizer-edit-form" onSubmit={save}>{error && <div className="form-alert form-alert-error" role="alert">{error}</div>}
      <label>Nama event<input required minLength="3" maxLength="150" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>Lokasi<input maxLength="200" value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
      <label>Poster HTTPS<input type="url" value={form.posterUrl || ""} onChange={(e) => setForm({ ...form, posterUrl: e.target.value })} /></label>
      <label>Unggah poster<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm({ ...form, posterFile: e.target.files?.[0] || null })} /><small>JPEG, PNG, atau WebP; maksimal 5 MB.</small></label>
      <label>Deskripsi<textarea maxLength="3000" rows="3" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div className="event-date-list">{form.schedules.map((date, index) => <div className="event-date-row" key={index}><label>Tanggal mulai<input type="datetime-local" value={date.startsAt} onChange={(e) => setForm({ ...form, schedules: form.schedules.map((item, i) => i === index ? { ...item, startsAt: e.target.value } : item) })} /></label><label>Tanggal selesai<input type="datetime-local" value={date.endsAt} onChange={(e) => setForm({ ...form, schedules: form.schedules.map((item, i) => i === index ? { ...item, endsAt: e.target.value } : item) })} /></label>{form.schedules.length > 1 && <button type="button" className="reject-button" aria-label={`Hapus tanggal ${index + 1}`} onClick={() => setForm({ ...form, schedules: form.schedules.filter((_, i) => i !== index) })}><X size={15} /></button>}</div>)}<button className="text-link" type="button" onClick={() => setForm({ ...form, schedules: [...form.schedules, { startsAt: "", endsAt: "" }] })}><CalendarDays size={14} /> Tambah tanggal</button></div>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan perubahan"}</button>
    </form>}
  </div>;
}

function JudgeScoring({ events }) {
  const [eventId, setEventId] = useState(events[0]?.id || "");
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setData(null); setError("");
    api(`/judge/events/${eventId}/scoring`).then((result) => {
      setData(result);
      setDrafts(Object.fromEntries(result.scores.map((score) => [`${score.registrationId}:${score.criterionId}`, String(score.value)])));
    }).catch((requestError) => setError(requestError.message));
  }, [eventId]);
  const saveScore = async (registrationId, criterion) => {
    const key = `${registrationId}:${criterion.id}`;
    const value = Number(drafts[key]);
    if (!Number.isFinite(value) || value < criterion.minScore || value > criterion.maxScore) {
      setError(`Nilai ${criterion.name} harus berada pada rentang ${criterion.minScore} sampai ${criterion.maxScore}.`); return;
    }
    setBusy(key); setError(""); setNotice("");
    try {
      await api(`/events/${eventId}/scores`, { method: "POST", body: JSON.stringify({ registrationId, criterionId: criterion.id, value }) });
      setNotice("Nilai berhasil disimpan.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  };
  return <article className="dashboard-panel judge-scoring-panel"><span className="eyebrow">INPUT PENILAIAN JURI</span><h2>Penilaian event</h2>
    <label className="scoring-event-picker">Event<select value={eventId} onChange={(event) => setEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
    {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}{notice && <div className="form-alert" role="status">{notice}</div>}
    {!data && !error ? <p className="empty-inline">Memuat peserta dan kriteria...</p> : data && !data.criteria.length ? <p className="empty-inline">Kriteria untuk event ini belum disiapkan oleh Tim Rekap.</p> : data?.participants.map((participant) => <div className="judge-score-card" key={participant.id}><strong>{participant.teamName || participant.participantName}</strong><small>{participant.participantName}</small>{data.criteria.map((criterion) => {
      const key = `${participant.id}:${criterion.id}`;
      return <form className="judge-score-input" key={criterion.id} onSubmit={(event) => { event.preventDefault(); saveScore(participant.id, criterion); }}><label>{criterion.name}<input required type="number" min={criterion.minScore} max={criterion.maxScore} step="any" value={drafts[key] ?? ""} onChange={(event) => setDrafts({ ...drafts, [key]: event.target.value })} /></label><button className="button button-outline button-small" type="submit" disabled={Boolean(busy)}>{busy === key ? "Menyimpan..." : "Simpan nilai"}</button></form>;
    })}</div>)}
  </article>;
}

function OrganizerEventForm({ eventForm, setEventForm, onEventCreate, busyId }) {
  const updateDate = (index, key, value) => setEventForm({
    ...eventForm,
    schedules: eventForm.schedules.map((date, dateIndex) => dateIndex === index ? { ...date, [key]: value } : date)
  });
  return <article className="dashboard-panel organizer-event-panel"><PanelTitle kicker="PENGELOLAAN PENYELENGGARA" title="Ajukan event" text="Event baru ditinjau Tim Rekap sebelum dipublikasikan. Kamu hanya dapat mengubah event milik akun ini." />
    <form className="event-admin-form" onSubmit={onEventCreate}>
      <label>Nama event<input required minLength="3" maxLength="150" value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} /></label>
      <label>Asal satuan<input required minLength="2" maxLength="120" value={eventForm.institution} onChange={(event) => setEventForm({ ...eventForm, institution: event.target.value })} /></label>
      <label>Lokasi<input maxLength="200" value={eventForm.location} onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })} /></label>
      <label>Poster (URL HTTPS)<input type="url" value={eventForm.posterUrl} onChange={(event) => setEventForm({ ...eventForm, posterUrl: event.target.value })} /></label>
      <label>Unggah poster<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEventForm({ ...eventForm, posterFile: event.target.files?.[0] || null })} /><small>JPEG, PNG, atau WebP; maksimal 5 MB.</small></label>
      <div className="event-date-list">{eventForm.schedules.map((date, index) => <div className="event-date-row" key={index}><label>Tanggal mulai<input type="datetime-local" value={date.startsAt} onChange={(event) => updateDate(index, "startsAt", event.target.value)} /></label><label>Tanggal selesai<input type="datetime-local" value={date.endsAt} onChange={(event) => updateDate(index, "endsAt", event.target.value)} /></label>{eventForm.schedules.length > 1 && <button type="button" className="reject-button" aria-label={`Hapus tanggal ${index + 1}`} onClick={() => setEventForm({ ...eventForm, schedules: eventForm.schedules.filter((_, i) => i !== index) })}><X size={15} /></button>}</div>)}<button className="text-link" type="button" onClick={() => setEventForm({ ...eventForm, schedules: [...eventForm.schedules, { startsAt: "", endsAt: "" }] })}><CalendarDays size={14} /> Tambah tanggal</button></div>
      <label className="event-description-field">Deskripsi<textarea maxLength="3000" rows="3" value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} /></label>
      <button className="button button-primary" type="submit" disabled={busyId === "event-create"}>{busyId === "event-create" ? "Menyimpan..." : "Ajukan event"}<ArrowRight size={15} /></button>
    </form>
  </article>;
}

function DashboardPage({ user, summary, data, section, setSection, busyId, productForm, setProductForm, onProductCreate, onUserStatus, onEventStatus, onRefresh }) {
  const sections = [
    { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
    { id: "scoring", label: "Rekap penilaian", icon: Trophy },
    { id: "users", label: "Akun pengguna", icon: Users },
    { id: "events", label: "Manajemen event", icon: CalendarDays },
    { id: "payments", label: "Voting & ticketing", icon: CreditCard },
    { id: "merch", label: "Merchandise", icon: ShoppingBag }
  ];

  return <section className="section-wrap dashboard-page">
    <div className="dashboard-heading">
      <div><span className="eyebrow">RUANG KERJA / {user?.role === "ADMIN" ? "ADMIN" : "TIM REKAP"}</span><h1>Selamat datang,<br /><em>{user?.name || "Tim Rekap"}.</em></h1><p>{user?.role === "ADMIN" ? "Dashboard Admin: akses data dan moderasi seluruh role." : "Dashboard Tim Rekap: tinjau dan kelola data seluruh role."}</p></div>
      <button className="button button-outline" type="button" onClick={onRefresh}><ArrowRight size={15} /> Muat ulang</button>
    </div>
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        {sections.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "is-active" : ""} onClick={() => setSection(id)} type="button"><Icon size={17} />{label}<ArrowRight size={14} /></button>)}
        <div className="sidebar-note"><ShieldCheck size={16} /><span>Akun staf terlindungi. Tinjau pengajuan sebelum dipublikasikan.</span></div>
      </aside>
      <div className="dashboard-content">
        {!summary ? <div className="dashboard-wait"><span className="loader-orbit" /><span>Memuat data dashboard...</span></div> : section === "overview" ? <>
          <div className="dashboard-welcome"><div><span className="eyebrow">RINGKASAN PLATFORM</span><h2>Aktivitas Rekap Baris</h2></div><span className="live-pill"><i /> DATA TERBARU</span></div>
          <div className="metric-grid"><Metric label="Total akun" value={summary.users} icon={Users} /><Metric label="Menunggu verifikasi" value={summary.pendingUsers} icon={Clock3} tone="yellow" /><Metric label="Event terdaftar" value={summary.events} icon={CalendarDays} /><Metric label="Juri terdaftar" value={summary.judges} icon={Trophy} tone="yellow" /></div>
          <div className="dashboard-panels">
            <div className="dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">PERLU TINDAKAN</span><h3>Pengajuan terbaru</h3></div><button className="text-link" type="button" onClick={() => setSection("users")}>Lihat akun <ArrowRight size={14} /></button></div>
              {data.users.filter((item) => item.status === "PENDING").slice(0, 4).map((item) => <div className="mini-row" key={item.id}><span className="mini-avatar"><UserRound size={15} /></span><div><strong>{item.name}</strong><small>{item.role} · {item.email}</small></div><span className="pending-badge">Pending</span></div>)}
              {!data.users.some((item) => item.status === "PENDING") && <p className="empty-inline">Tidak ada akun yang menunggu verifikasi.</p>}
            </div>
            <div className="dashboard-panel revenue-panel"><span className="eyebrow">PEMBAYARAN TERVERIFIKASI</span><strong>{rupiah(summary.revenue)}</strong><p>{summary.settledPayments} transaksi berhasil tercatat.</p><div className="revenue-decoration"><CreditCard size={27} /></div></div>
          </div>
        </> : section === "scoring" ? <ScoringModule events={data.events} users={data.users} onRefresh={onRefresh} /> : section === "users" ? <>
          <PanelTitle kicker="MANAJEMEN AKUN" title="Akun pengguna" text="Tinjau data dan persetujuan pendaftaran peserta, penyelenggara, serta juri." />
          <div className="staff-table">{data.users.map((item) => <div className="staff-row" key={item.id}>
            <div className="staff-person"><span className="mini-avatar"><UserRound size={15} /></span><div><strong>{item.name}</strong><small>{[item.email, item.phone, item.institution, item.eventName].filter(Boolean).join(" · ")}</small></div></div>
            <span className={`state-badge state-${item.status.toLowerCase()}`}>{item.status}</span><span className="role-label">{item.role}</span>
            {item.status === "PENDING" && !["ADMIN", "TEAM"].includes(item.role)
              ? <div className="row-actions"><button type="button" className="approve-button" disabled={busyId.includes(item.id)} onClick={() => onUserStatus(item.id, "ACTIVE")}><Check size={14} /> Terima</button><button type="button" className="reject-button" onClick={() => onUserStatus(item.id, "REJECTED")}><X size={14} /></button></div>
              : <span className="verified-hint">{item.googleId ? "Google terhubung" : ""}</span>}
          </div>)}</div>
        </> : section === "events" ? <>
          <PanelTitle kicker="MANAJEMEN EVENT" title="Pusat verifikasi event" text="Terima event agar dapat tampil di halaman publik, voting, dan ticketing." />
          {data.events.map((event) => <div className="moderation-card" key={event.id}><div className="moderation-icon"><CalendarDays size={18} /></div><div className="moderation-copy"><span className={`state-badge state-${event.status.toLowerCase()}`}>{event.status}</span><h3>{event.name}</h3><p>{event.institution} · {event.organizer.name} · {event._count.registrations} peserta</p></div><div className="row-actions">
            {event.status === "PENDING" ? <><button className="approve-button" disabled={busyId.includes(event.id)} onClick={() => onEventStatus(event.id, "APPROVED")} type="button"><Check size={14} /> Terima</button><button className="reject-button" onClick={() => onEventStatus(event.id, "REJECTED")} type="button"><X size={14} /> Tolak</button></> : event.status === "APPROVED" ? <button className="reject-button" onClick={() => onEventStatus(event.id, "COMPLETED")} type="button">Tandai selesai</button> : null}
          </div></div>)}
        </> : section === "payments" ? <>
          <PanelTitle kicker="REKAP TRANSAKSI" title="Voting & ticketing" text="Transaksi pembayaran yang diterima melalui Midtrans." />
          {data.payments.map((payment) => <div className="moderation-card payment-row" key={payment.id}><div className="moderation-icon"><CreditCard size={18} /></div><div className="moderation-copy"><span className={`state-badge state-${payment.status.toLowerCase()}`}>{payment.status}</span><h3>{payment.type} · {payment.event?.name || payment.product?.name || "Rekap Baris"}</h3><p>{payment.user.name} · {payment.orderId} · {new Date(payment.createdAt).toLocaleDateString("id-ID")}</p></div><strong>{rupiah(payment.amount)}</strong></div>)}
        </> : <>
          <PanelTitle kicker="STOK & PRODUK" title="Merchandise resmi" text="Tambahkan produk baru ke toko. Stok diperbarui otomatis setelah transaksi." />
          <form className="product-form" onSubmit={onProductCreate}>
            <label>Nama produk<input required minLength="2" maxLength="120" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
            <label>Harga (IDR)<input required type="number" min="1" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label>
            <label>Stok<input required type="number" min="0" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} /></label>
            <label>URL gambar<input type="url" value={productForm.imageUrl} onChange={(event) => setProductForm({ ...productForm, imageUrl: event.target.value })} /></label>
            <label className="form-wide">Deskripsi<input value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
            <button className="button button-primary" disabled={busyId === "product-create"} type="submit">Tambahkan produk <ArrowRight size={15} /></button>
          </form>
          <p className="dashboard-footnote"><ShieldCheck size={15} /> Produk ditampilkan setelah dibuat. Pengeditan katalog dapat dilakukan dari database/admin API.</p>
        </>}
      </div>
    </div>
  </section>;
}

function ScoringModule({ events = [], users = [], onRefresh }) {
  const [eventId, setEventId] = useState("");
  const [scoring, setScoring] = useState(null);
  const [criterionName, setCriterionName] = useState("");
  const [criterionWeight, setCriterionWeight] = useState("1");
  const [judgeId, setJudgeId] = useState("");
  const [judgeForm, setJudgeForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const judges = users.filter((item) => item.role === "JUDGE" && item.status === "ACTIVE");

  useEffect(() => {
    if (!eventId && events.length) setEventId(events[0].id);
  }, [eventId, events]);

  const load = async () => {
    if (!eventId) return;
    setBusy(true);
    setError("");
    try { setScoring(await api(`/admin/scoring/${eventId}`)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { setScoring(null); load(); }, [eventId]);

  const run = async (action, successText) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await load(); setMessage(successText); return true; }
    catch (requestError) { setError(requestError.message); return false; }
    finally { setBusy(false); }
  };
  const createCriterion = async (event) => {
    event.preventDefault();
    if (await run(() => api(`/admin/scoring/${eventId}/criteria`, { method: "POST", body: JSON.stringify({ name: criterionName, weight: Number(criterionWeight) }) }), "Kriteria berhasil ditambahkan.")) setCriterionName("");
  };
  const createJudge = (event) => {
    event.preventDefault();
    return run(async () => {
      await api("/admin/judges", { method: "POST", body: JSON.stringify(judgeForm) });
      setJudgeForm({ name: "", email: "", phone: "" });
      await onRefresh();
    }, "Akun juri dibuat. Aktifkan akun dan minta juri mengatur password melalui WhatsApp reset.");
  };
  const addJudge = (event) => {
    event.preventDefault();
    return run(() => api(`/admin/scoring/${eventId}/judges`, { method: "POST", body: JSON.stringify({ judgeId }) }), "Juri ditugaskan pada event.");
  };

  if (!events.length) return <><PanelTitle kicker="REKAPITULASI" title="Rekap penilaian" text="Pilih event yang sudah tercatat untuk mulai mengatur kriteria dan juri." /><p className="empty-inline">Belum ada event. Tambahkan event terlebih dahulu.</p></>;
  return <div className="scoring-module">
    <PanelTitle kicker="REKAPITULASI PENILAIAN" title="Kelola penilaian event" text="Kriteria, juri, nilai, dan ranking dibatasi pada event pilihan." />
    <label className="scoring-event-picker">Event<select value={eventId} onChange={(event) => setEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.status}</option>)}</select></label>
    {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}{message && <div className="form-alert" role="status">{message}</div>}
    {busy && !scoring ? <p className="empty-inline">Memuat data penilaian...</p> : scoring && <>
      <div className="dashboard-panel scoring-panel"><div className="panel-heading"><div><span className="eyebrow">PENGATURAN EVENT</span><h3>Kriteria penilaian</h3></div><button type="button" className="button button-outline button-small" disabled={busy} onClick={() => run(() => api(`/admin/scoring/${eventId}/default-criteria`, { method: "POST", body: "{}" }), "Kriteria bawaan PBB, Danton, Varfor, dan Kostum tersedia.")}>Tambah kriteria bawaan</button></div>
        {scoring.criteria.map((criterion) => <div className="scoring-row" key={criterion.id}>
          <strong>{criterion.name}</strong><span>Bobot {criterion.weight} · rentang {criterion.minScore}–{criterion.maxScore}</span>
          <label><input type="checkbox" checked={criterion.active} disabled={busy} onChange={(event) => {
            const used = scoring.participants.some((participant) => participant.scores.some((score) => score.criterionId === criterion.id && score.submitted > 0));
            if (used && !window.confirm("Kriteria ini sudah memiliki nilai. Perubahan status akan menghitung ulang ranking sementara. Lanjutkan?")) return;
            run(() => api(`/admin/scoring/${eventId}/criteria/${criterion.id}`, { method: "PATCH", body: JSON.stringify({ active: event.target.checked, confirmRecalculation: used }) }), "Status kriteria diperbarui.");
          }} /> Aktif</label>
          <details className="criterion-edit"><summary>Edit / hapus</summary>
            <form className="scoring-inline-form" onSubmit={(event) => {
              event.preventDefault(); const values = new FormData(event.currentTarget);
              run(() => api(`/admin/scoring/${eventId}/criteria/${criterion.id}`, { method: "PATCH", body: JSON.stringify({ name: values.get("name"), weight: Number(values.get("weight")), minScore: Number(values.get("minScore")), maxScore: Number(values.get("maxScore")) }) }), "Kriteria diperbarui.");
            }}>
              <label>Nama<input name="name" required minLength="2" maxLength="80" defaultValue={criterion.name} /></label>
              <label>Bobot<input name="weight" type="number" min="0.01" max="1000" step="0.01" required defaultValue={criterion.weight} /></label>
              <label>Nilai minimum<input name="minScore" type="number" min="0" max="100000" step="any" required defaultValue={criterion.minScore} /></label>
              <label>Nilai maksimum<input name="maxScore" type="number" min="0" max="100000" step="any" required defaultValue={criterion.maxScore} /></label>
              <button className="button button-outline button-small" disabled={busy} type="submit">Simpan kriteria</button>
              <button className="reject-button" disabled={busy} type="button" onClick={() => {
                if (window.confirm(`Hapus kriteria ${criterion.name}?`)) run(() => api(`/admin/scoring/${eventId}/criteria/${criterion.id}`, { method: "DELETE" }), "Kriteria dihapus.");
              }}>Hapus</button>
            </form>
          </details>
        </div>)}
        {!scoring.criteria.length && <p className="empty-inline">Kriteria belum diatur. Tambahkan kriteria bawaan atau buat kriteria sendiri.</p>}
        <form className="scoring-inline-form" onSubmit={createCriterion}><label>Nama kriteria<input required minLength="2" maxLength="80" value={criterionName} onChange={(event) => setCriterionName(event.target.value)} /></label><label>Bobot<input type="number" min="0.01" step="0.01" max="1000" required value={criterionWeight} onChange={(event) => setCriterionWeight(event.target.value)} /></label><button className="button button-primary" disabled={busy || !eventId} type="submit">Tambah kriteria</button></form>
      </div>
      <div className="dashboard-panel scoring-panel"><div className="panel-heading"><div><span className="eyebrow">PENUGASAN</span><h3>Juri event</h3></div></div>
        {scoring.judges.map((judge) => <div className="scoring-row" key={judge.id}><strong>{judge.name}</strong><span>{judge.email} · {judge.status}</span><button className="reject-button" disabled={busy} type="button" onClick={() => {
          if (window.confirm(`Lepas penugasan ${judge.name} dari event? Nilai tersimpan tetap ada, tetapi tidak dihitung dalam ranking sampai juri ditugaskan kembali.`)) run(() => api(`/admin/scoring/${eventId}/judges/${judge.id}`, { method: "DELETE" }), "Penugasan juri dilepas.");
        }}>Lepas</button><details className="criterion-edit"><summary>Edit data juri</summary><form className="scoring-inline-form" onSubmit={(event) => {
          event.preventDefault(); const values = new FormData(event.currentTarget);
          run(async () => { await api(`/admin/judges/${judge.id}`, { method: "PATCH", body: JSON.stringify({ name: values.get("name"), email: values.get("email"), phone: values.get("phone") }) }); await onRefresh(); }, "Data juri diperbarui.");
        }}><label>Nama<input name="name" required minLength="2" maxLength="120" defaultValue={judge.name} /></label><label>Email<input name="email" required type="email" defaultValue={judge.email} /></label><label>WhatsApp<input name="phone" required type="tel" defaultValue={judge.phone || ""} /></label><button className="button button-outline button-small" disabled={busy} type="submit">Simpan data juri</button><small>Juri aktif dapat menggunakan fitur lupa password untuk mengatur atau mengganti akses melalui WhatsApp.</small></form></details></div>)}
        {!scoring.judges.length && <p className="empty-inline">Belum ada juri yang ditugaskan.</p>}
        <form className="scoring-inline-form" onSubmit={addJudge}><label>Juri aktif<select required value={judgeId} onChange={(event) => setJudgeId(event.target.value)}><option value="">Pilih juri</option>{judges.filter((judge) => !scoring.judges.some((assigned) => assigned.id === judge.id)).map((judge) => <option key={judge.id} value={judge.id}>{judge.name} · {judge.email}</option>)}</select></label><button className="button button-primary" disabled={busy || !judgeId} type="submit">Tugaskan juri</button></form>
        <details className="scoring-create-judge"><summary>Buat akun juri</summary><form className="scoring-inline-form" onSubmit={createJudge}><label>Nama<input required minLength="2" maxLength="120" value={judgeForm.name} onChange={(event) => setJudgeForm({ ...judgeForm, name: event.target.value })} /></label><label>Email<input required type="email" value={judgeForm.email} onChange={(event) => setJudgeForm({ ...judgeForm, email: event.target.value })} /></label><label>Nomor WhatsApp<input required type="tel" value={judgeForm.phone} onChange={(event) => setJudgeForm({ ...judgeForm, phone: event.target.value })} /></label><button className="button button-outline" disabled={busy} type="submit">Buat akun pending</button></form></details>
      </div>
      <div className="dashboard-panel scoring-panel"><div className="panel-heading"><div><span className="eyebrow">RANKING SEMENTARA</span><h3>Hasil dari nilai tersimpan</h3></div><button type="button" className="button button-outline button-small" onClick={() => setShowRanking((open) => !open)}>{showRanking ? "Tutup ranking" : "Detail ranking sementara"}</button></div>
        {showRanking && <><p className="dashboard-footnote">Metode: rata-rata nilai tiap kriteria antar juri, dikalikan bobot, lalu dijumlahkan. Peserta belum lengkap tidak diberi peringkat; nilai seri berbagi peringkat.</p>
        {!scoring.participants.length ? <p className="empty-inline">Belum ada peserta yang disetujui untuk event ini.</p> : scoring.participants.map((participant) => <div className="scoring-rank-row" key={participant.registrationId}><strong>{participant.rank ? `#${participant.rank}` : "—"}</strong><div><b>{participant.teamName || participant.participantName}</b><small>{participant.scores.map((score) => `${score.name}: ${score.average === null ? "Belum dinilai" : score.average.toFixed(2)}`).join(" · ") || "Belum ada kriteria aktif"}</small></div><span>{participant.complete ? participant.total.toFixed(2) : "Belum lengkap"}</span></div>)}</>}
      </div>
    </>}
  </div>;
}

function DashboardTools({ products = [], events = [], busyId, eventForm, setEventForm, onEventCreate, onProductUpdate }) {
  const [toolError, setToolError] = useState("");
  const [openEvent, setOpenEvent] = useState("");
  const [registrations, setRegistrations] = useState([]);
  const [rosterBusy, setRosterBusy] = useState(false);

  const loadRegistrations = async (event) => {
    setRosterBusy(true);
    setToolError("");
    try {
      const result = await api(`/admin/events/${event.id}/participants`);
      setOpenEvent(event.id);
      setRegistrations(result.registrations);
    } catch (requestError) {
      setToolError(requestError.message);
    } finally {
      setRosterBusy(false);
    }
  };

  const reviewRegistration = async (id, status) => {
    setRosterBusy(true);
    try {
      await api(`/admin/registrations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      const selectedEvent = events.find((event) => event.id === openEvent);
      if (selectedEvent) await loadRegistrations(selectedEvent);
    } catch (requestError) {
      setToolError(requestError.message);
    } finally {
      setRosterBusy(false);
    }
  };

  return <section className="section-wrap dashboard-tools">
    {toolError && <div className="form-alert form-alert-error">{toolError}</div>}
    <div className="dashboard-tool-card">
      <PanelTitle kicker="PUSAT PUBLIKASI" title="Buat event baru" text="Lengkapi harga, jadwal, lokasi, dan poster. Event buatan Admin langsung aktif; pengajuan Tim menunggu persetujuan." />
      <form className="event-admin-form" onSubmit={onEventCreate}>
        <label>Nama event<input required minLength="3" maxLength="150" value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} /></label>
        <label>Sekolah / institusi<input required minLength="2" maxLength="120" value={eventForm.institution} onChange={(event) => setEventForm({ ...eventForm, institution: event.target.value })} /></label>
        <label>Lokasi<input maxLength="200" value={eventForm.location} onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })} /></label>
        <label>Poster (URL HTTPS)<input type="url" value={eventForm.posterUrl} onChange={(event) => setEventForm({ ...eventForm, posterUrl: event.target.value })} /></label>
        <label>Unggah poster<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEventForm({ ...eventForm, posterFile: event.target.files?.[0] || null })} /><small>JPEG, PNG, atau WebP; maksimal 5 MB.</small></label>
        <div className="event-date-list">{eventForm.schedules.map((date, index) => <div className="event-date-row" key={index}><label>Tanggal mulai<input type="datetime-local" value={date.startsAt} onChange={(event) => setEventForm({ ...eventForm, schedules: eventForm.schedules.map((item, i) => i === index ? { ...item, startsAt: event.target.value } : item) })} /></label><label>Tanggal selesai<input type="datetime-local" value={date.endsAt} onChange={(event) => setEventForm({ ...eventForm, schedules: eventForm.schedules.map((item, i) => i === index ? { ...item, endsAt: event.target.value } : item) })} /></label>{eventForm.schedules.length > 1 && <button type="button" className="reject-button" aria-label={`Hapus tanggal ${index + 1}`} onClick={() => setEventForm({ ...eventForm, schedules: eventForm.schedules.filter((_, i) => i !== index) })}><X size={15} /></button>}</div>)}<button className="text-link" type="button" onClick={() => setEventForm({ ...eventForm, schedules: [...eventForm.schedules, { startsAt: "", endsAt: "" }] })}><CalendarDays size={14} /> Tambah tanggal</button></div>
        <label>Harga tiket (IDR)<input type="number" min="0" max="100000000" value={eventForm.ticketPrice} onChange={(event) => setEventForm({ ...eventForm, ticketPrice: event.target.value })} /></label>
        <label>Harga vote (IDR)<input type="number" min="1000" max="10000000" value={eventForm.votePrice} onChange={(event) => setEventForm({ ...eventForm, votePrice: event.target.value })} /></label>
        <label className="event-description-field">Deskripsi<textarea maxLength="3000" rows="3" value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} /></label>
        <button className="button button-primary" disabled={busyId === "event-create"} type="submit">{busyId === "event-create" ? "Menyimpan..." : "Publikasikan event"} <ArrowRight size={15} /></button>
      </form>
    </div>
    <div className="dashboard-tool-card">
      <PanelTitle kicker="DATABASE PESERTA EVENT" title="Pendaftaran peserta" text="Tinjau dan verifikasi peserta yang mendaftar pada event." />
      {!events.length ? <p className="empty-inline">Belum ada event terdaftar.</p> : events.map((event) => <div className="roster-event" key={event.id}><div><strong>{event.name}</strong><small>{event.institution} · {event._count.registrations} pendaftar</small></div><button className="button button-outline button-small" type="button" disabled={rosterBusy} onClick={() => openEvent === event.id ? setOpenEvent("") : loadRegistrations(event)}>{openEvent === event.id ? "Tutup daftar" : "Lihat peserta"}</button>{openEvent === event.id && registrations.map((registration) => <div className="roster-person" key={registration.id}><div><strong>{registration.participantName}</strong><small>{registration.teamName || "Pasukan belum diisi"} · {registration.user?.email || "Akun tidak tertaut"}</small></div><span className={`state-badge state-${registration.status.toLowerCase()}`}>{registration.status}</span>{registration.status === "PENDING" && <div className="row-actions"><button className="approve-button" disabled={rosterBusy} onClick={() => reviewRegistration(registration.id, "APPROVED")} type="button"><Check size={13} /> Terima</button><button className="reject-button" disabled={rosterBusy} onClick={() => reviewRegistration(registration.id, "REJECTED")} type="button"><X size={13} /></button></div>}</div>)}</div>)}
    </div>
    <div className="dashboard-tool-card">
      <PanelTitle kicker="KONTROL STOK" title="Inventaris merchandise" text="Stok yang dipesan dicadangkan saat checkout dan dikembalikan jika pembayaran gagal." />
      {!products?.length ? <p className="empty-inline">Belum ada produk merchandise.</p> : products.map((product) => <InventoryRow key={product.id} product={product} busy={busyId === `product-${product.id}`} onSave={(changes) => onProductUpdate(product.id, changes)} />)}
    </div>
  </section>;
}

function InventoryRow({ product, busy, onSave }) {
  const [stock, setStock] = useState(String(product.stock));
  const [active, setActive] = useState(product.active);
  useEffect(() => {
    setStock(String(product.stock));
    setActive(product.active);
  }, [product.stock, product.active]);
  return <form className="inventory-row" onSubmit={(event) => { event.preventDefault(); onSave({ stock: Number(stock), active }); }}>
    <div className="inventory-product"><strong>{product.name}</strong><small>{rupiah(product.price)} · {product.active ? "Aktif di toko" : "Disembunyikan"}</small></div>
    <label>Stok<input aria-label={`Stok ${product.name}`} type="number" min="0" max="100000" value={stock} onChange={(event) => setStock(event.target.value)} /></label>
    <label className="inventory-active"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Aktif</label>
    <button className="approve-button" disabled={busy} type="submit">{busy ? "..." : "Simpan"}</button>
  </form>;
}

function Metric({ label, value, icon: Icon, tone = "" }) {
  return <div className={`metric-card ${tone ? `metric-${tone}` : ""}`}><div className="metric-top"><span>{label}</span><Icon size={17} /></div><strong>{value.toLocaleString("id-ID")}</strong><span className="metric-caption">Seluruh periode</span></div>;
}

function PanelTitle({ kicker, title, text }) {
  return <div className="panel-title"><span className="eyebrow">{kicker}</span><h2>{title}</h2><p>{text}</p></div>;
}

function EventModal({ event, loading, user, participantName, setParticipantName, teamName, setTeamName, quantity, setQuantity, busyId, close, onRegister, onBuyTicket, onVote, onLogin, onReload, onMessage }) {
  const [activeMode, setActiveMode] = useState("overview");
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title"><button className="modal-close" onClick={close} type="button" aria-label="Tutup"><X size={19} /></button>{loading ? <div className="modal-loading"><span className="loader-orbit" /><p>Memuat detail event...</p></div> : <><div className="modal-cover"><span className="eyebrow">EVENT TERVERIFIKASI</span><span className="modal-cover-mark">RB</span></div><div className="modal-body"><span className="live-pill"><i /> {eventState(event)}</span><h2 id="event-modal-title">{event.name}</h2><p className="modal-institution">{event.institution}{event.location ? ` · ${event.location}` : ""}</p><div className="modal-meta"><span><CalendarDays size={15} />{event.schedules?.length ? event.schedules.map((date) => formatDate(date.startsAt)).join(' / ') : formatDate(event.startsAt)}</span><span><Users size={15} />{event.participants?.length || event.participants || 0} peserta terverifikasi</span></div><p className="modal-description">{event.description || "Informasi event ini disediakan oleh penyelenggara Rekap Baris."}</p><div className="modal-tabs"><button className={activeMode === "overview" ? "is-active" : ""} type="button" onClick={() => setActiveMode("overview")}>Informasi</button><button className={activeMode === "participants" ? "is-active" : ""} type="button" onClick={() => setActiveMode("participants")}>Peserta & voting</button></div>{activeMode === "participants" ? <div className="participants-panel"><h3>Peserta Pasukan Terpopuler</h3>{event.participants?.length ? event.participants.map((participant, index) => <div className="participant-row" key={participant.id}><span className="participant-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{participant.name}</strong><small>{participant.teamName || "Peserta terverifikasi"}</small></div><span className="participant-votes"><Heart size={13} />{participant.votes} vote</span><button className="vote-button" onClick={() => onVote(participant.id)} disabled={busyId === participant.id} type="button">{busyId === participant.id ? "..." : <><Vote size={14} /> Vote</>}</button></div>) : <EmptyState icon={Vote} title="Peserta belum tersedia" text="Pendaftaran peserta akan muncul setelah diverifikasi." />}<button className="text-link" type="button" onClick={() => onReload()}>Perbarui daftar <ArrowRight size={14} /></button>{user && <div className="participant-register"><span className="eyebrow">DAFTARKAN PESERTA</span><input placeholder={`Nama peserta (default: ${user.name})`} value={participantName} onChange={(event) => setParticipantName(event.target.value)} /><input placeholder="Nama regu / pasukan" value={teamName} onChange={(event) => setTeamName(event.target.value)} /><button className="button button-outline" onClick={() => onRegister(event.id)} disabled={busyId === "participant-register"} type="button">Kirim pendaftaran</button></div>}</div> : <div className="event-purchase-box"><div><span className="eyebrow">TIKET PENONTON</span><strong>{event.ticketPrice ? rupiah(event.ticketPrice) : "Harga segera diumumkan"}</strong></div><label>Jumlah<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label><button className="button button-primary" type="button" onClick={() => event.ticketPrice > 0 ? onBuyTicket() : onMessage("Harga tiket belum tersedia untuk event ini.")}>{busyId === "ticket" ? "Menyiapkan QRIS..." : "Beli tiket dengan QRIS"} <ArrowRight size={15} /></button></div>}<p className="payment-footnote"><ShieldCheck size={14} /> Pembayaran aman via Midtrans QRIS. {user ? "" : <button type="button" onClick={onLogin}>Masuk untuk transaksi</button>}</p></div></>}</section></div>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div><Icon size={22} /></div><h3>{title}</h3><p>{text}</p></div>;
}

function Footer({ onNavigate }) {
  return <footer className="site-footer"><div className="section-wrap footer-main"><div className="footer-brand"><button className="brand" type="button" onClick={() => onNavigate("home")}><img src="/logo.svg" alt="" /><span>rekap<span className="brand-light">baris</span><small>.com</small></span></button><p>Solusi digital untuk energi event yang menyatukan.</p><a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={17} /></a></div><div className="footer-column"><span>JELAJAHI</span>{navigation.slice(1, 5).map(({ id, label }) => <button key={id} onClick={() => onNavigate(id)} type="button">{label}</button>)}</div><div className="footer-column"><span>PLATFORM</span><button onClick={() => onNavigate("about")} type="button">Tentang kami</button><button onClick={() => onNavigate("events")} type="button">Untuk komunitas</button><button onClick={() => onNavigate("about")} type="button">Pusat bantuan</button></div><div className="footer-note"><span className="eyebrow">MOMEN BESAR DIMULAI DI SINI</span><p>Rancang pengalaman event yang bermakna.</p><button className="text-link" onClick={() => onNavigate("events")} type="button">Mulai menjelajah <ArrowRight size={14} /></button></div></div><div className="section-wrap footer-bottom"><span>© {new Date().getFullYear()} Rekap Baris. Dibuat untuk kebersamaan.</span><span>Privasi · Ketentuan · Bantuan</span></div></footer>;
}

export default App;
