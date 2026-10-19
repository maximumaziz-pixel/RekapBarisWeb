import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, Check,
  ChevronDown, Clock3, Compass, CreditCard, Fingerprint, Flag, Heart,
  Instagram, LayoutDashboard, LockKeyhole, Mail, Moon, Search,
  ShieldCheck, ShoppingBag, Sun, Ticket, Trophy, UserRound, Users, Vote,
  X, Zap
} from "lucide-react";

const navigation = [
  { id: "home", label: "Home", icon: Compass },
  { id: "events", label: "Event", icon: CalendarDays },
  { id: "voting", label: "E-Voting", icon: Vote },
  { id: "tickets", label: "E-Ticketing", icon: Ticket },
  { id: "merch", label: "Merch", icon: ShoppingBag },
  { id: "about", label: "Tentang", icon: Fingerprint }
];
const roleOptions = [
  { id: "PARTICIPANT", label: "Peserta", icon: UserRound },
  { id: "ORGANIZER", label: "Penyelenggara", icon: Flag },
  { id: "JUDGE", label: "Juri", icon: Trophy }
];

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(data?.error || "Permintaan tidak dapat diproses.");
    error.status = response.status;
    throw error;
  }
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
  const [authMode, setAuthMode] = useState(() => window.location.pathname === "/reset-password" ? "reset" : "");
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [authForm, setAuthForm] = useState({ name: "", email: "", phone: "", password: "", code: "", role: "PARTICIPANT", institution: "", eventName: "" });
  const [authPhone, setAuthPhone] = useState("");
  const [resetToken, setResetToken] = useState(new URLSearchParams(window.location.search).get("token") || "");
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
  const [productForm, setProductForm] = useState({ name: "", description: "", imageUrl: "", price: "", stock: "" });
  const [eventForm, setEventForm] = useState({ name: "", institution: "", description: "", posterUrl: "", startsAt: "", endsAt: "", location: "", ticketPrice: "0", votePrice: "1000" });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("rb-theme", theme);
  }, [theme]);

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

  const updateAuthField = (event) => setAuthForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setError("");
    setNotice("");
    try {
      if (authMode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ ...authForm, phone: authForm.phone.trim() })
        });
        setAuthPhone(authForm.phone.trim());
        setNotice("OTP dikirim. Verifikasi nomor WhatsApp Anda.");
        setAuthMode("otp");
      } else if (authMode === "login") {
        await api("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone: authForm.phone }) });
        setAuthPhone(authForm.phone.trim());
        setNotice("Jika nomor terdaftar dan aktif, kode OTP telah dikirim.");
        setAuthMode("otp");
      } else if (authMode === "otp") {
        const data = await api("/auth/otp/verify", {
          method: "POST",
          body: JSON.stringify({ phone: authPhone, code: authForm.code })
        });
        setUser(data.user);
        setAuthMode("");
        setAuthForm((current) => ({ ...current, code: "" }));
        setNotice("Berhasil masuk. Selamat datang kembali!");
      } else if (authMode === "forgot") {
        const data = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: authForm.email }) });
        setNotice(data.message);
        setAuthMode("login");
      } else if (authMode === "reset") {
        const data = await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: resetToken, password: authForm.password })
        });
        setNotice(data.message);
        setAuthMode("login");
        window.history.replaceState({}, "", "/");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const startAuth = (mode) => {
    setError("");
    setNotice("");
    setAuthForm((current) => ({ ...current, password: "", code: "" }));
    setAuthMode(mode);
  };

  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setDashboard(null);
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
      setError("Masuk dengan OTP WhatsApp untuk melanjutkan.");
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
      await api("/events", {
        method: "POST",
        body: JSON.stringify({
          ...eventForm,
          startsAt: eventForm.startsAt ? new Date(eventForm.startsAt).toISOString() : "",
          endsAt: eventForm.endsAt ? new Date(eventForm.endsAt).toISOString() : "",
          ticketPrice: Number(eventForm.ticketPrice),
          votePrice: Number(eventForm.votePrice)
        })
      });
      setEventForm({ name: "", institution: "", description: "", posterUrl: "", startsAt: "", endsAt: "", location: "", ticketPrice: "0", votePrice: "1000" });
      await Promise.all([refreshPublicData(), refreshDashboard()]);
      setNotice("Event berhasil diajukan. Event Admin langsung aktif; pengajuan lain menunggu verifikasi.");
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

  const changePassword = async ({ currentPassword, newPassword }) => {
    await api("/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    setNotice("Kata sandi akun staf berhasil diperbarui.");
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
    <div className="app-shell">
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
        </nav>
        <div className="top-actions">
          <button className="icon-button theme-toggle" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Ganti tema">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {user ? (
            <div className="user-menu">
              <span className="user-avatar"><UserRound size={16} /></span>
              <span className="user-name">{user.name.split(" ")[0]}</span>
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
            {activeTab === "dashboard" && <><DashboardPage
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
            /><DashboardTools products={staffData.products} events={staffData.events} busyId={busyId} eventForm={eventForm} setEventForm={setEventForm} onEventCreate={createEvent} onProductUpdate={updateProduct} onPasswordChange={changePassword} /></>}
          </>
        )}
      </main>

      <Footer onNavigate={openTab} />

      {authMode && <AuthModal
        mode={authMode}
        setMode={startAuth}
        close={() => { setAuthMode(""); setError(""); }}
        form={authForm}
        update={updateAuthField}
        submit={submitAuth}
        busy={authBusy}
        notice={notice}
        error={error}
        phone={authPhone}
        resetToken={resetToken}
        setResetToken={setResetToken}
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
        <div className="event-meta"><span><CalendarDays size={14} />{formatDate(event.startsAt)}</span><span><Users size={14} />{event.participants} peserta</span></div>
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

function DashboardPage({ user, summary, data, section, setSection, busyId, productForm, setProductForm, onProductCreate, onUserStatus, onEventStatus, onRefresh }) {
  const sections = [
    { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
    { id: "users", label: "Akun & verifikasi", icon: Users },
    { id: "events", label: "Manajemen event", icon: CalendarDays },
    { id: "payments", label: "Voting & ticketing", icon: CreditCard },
    { id: "merch", label: "Merchandise", icon: ShoppingBag }
  ];
  return <section className="section-wrap dashboard-page"><div className="dashboard-heading"><div><span className="eyebrow">RUANG KERJA / ADMINISTRASI</span><h1>Selamat datang,<br /><em>{user?.name || "Tim Rekap"}.</em></h1><p>Kelola akun, event, transaksi, dan aktivitas komunitas.</p></div><button className="button button-outline" type="button" onClick={onRefresh}><ArrowRight size={15} /> Muat ulang</button></div><div className="dashboard-layout"><aside className="dashboard-sidebar">{sections.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "is-active" : ""} onClick={() => setSection(id)} type="button"><Icon size={17} />{label}<ArrowRight size={14} /></button>)}<div className="sidebar-note"><ShieldCheck size={16} /><span>Akun staf terlindungi. Tinjau setiap pengajuan sebelum dipublikasikan.</span></div></aside><div className="dashboard-content">
    {!summary ? <div className="dashboard-wait"><span className="loader-orbit" /><span>Memuat data dashboard...</span></div> : section === "overview" ? <><div className="dashboard-welcome"><div><span className="eyebrow">RINGKASAN PLATFORM</span><h2>Aktivitas Rekap Baris</h2></div><span className="live-pill"><i /> DATA TERBARU</span></div><div className="metric-grid"><Metric label="Total akun" value={summary.users} icon={Users} /><Metric label="Menunggu verifikasi" value={summary.pendingUsers} icon={Clock3} tone="yellow" /><Metric label="Event terdaftar" value={summary.events} icon={CalendarDays} /><Metric label="Juri terdaftar" value={summary.judges} icon={Trophy} tone="yellow" /></div><div className="dashboard-panels"><div className="dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">PERLU TINDAKAN</span><h3>Pengajuan terbaru</h3></div><button className="text-link" type="button" onClick={() => setSection("users")}>Lihat akun <ArrowRight size={14} /></button></div>{data.users.filter((item) => item.status === "PENDING").slice(0, 4).map((item) => <div className="mini-row" key={item.id}><span className="mini-avatar"><UserRound size={15} /></span><div><strong>{item.name}</strong><small>{item.role} · {item.email}</small></div><span className="pending-badge">Pending</span></div>)}{!data.users.some((item) => item.status === "PENDING") && <p className="empty-inline">Tidak ada akun yang menunggu verifikasi.</p>}</div><div className="dashboard-panel revenue-panel"><span className="eyebrow">PEMBAYARAN TERVERIFIKASI</span><strong>{rupiah(summary.revenue)}</strong><p>{summary.settledPayments} transaksi berhasil tercatat.</p><div className="revenue-decoration"><CreditCard size={27} /></div></div></div></> : section === "users" ? <><PanelTitle kicker="MANAJEMEN AKUN" title="Verifikasi pengguna" text="Aktifkan akun setelah nomor WhatsApp pengguna terverifikasi." /><div className="staff-table">{data.users.map((item) => <div className="staff-row" key={item.id}><div className="staff-person"><span className="mini-avatar"><UserRound size={15} /></span><div><strong>{item.name}</strong><small>{item.email} · {item.phone}</small></div></div><span className={`state-badge state-${item.status.toLowerCase()}`}>{item.status}</span><span className="role-label">{item.role}</span>{item.status === "PENDING" && !["ADMIN", "TEAM"].includes(item.role) ? <div className="row-actions"><button type="button" className="approve-button" disabled={!item.phoneVerifiedAt || busyId.includes(item.id)} onClick={() => onUserStatus(item.id, "ACTIVE")} title={!item.phoneVerifiedAt ? "Pengguna belum verifikasi OTP" : ""}><Check size={14} /> Terima</button><button type="button" className="reject-button" onClick={() => onUserStatus(item.id, "REJECTED")}><X size={14} /></button></div> : <span className="verified-hint">{item.phoneVerifiedAt ? "WA terverifikasi" : ""}</span>}</div>)}</div></> : section === "events" ? <><PanelTitle kicker="MANAJEMEN EVENT" title="Pusat verifikasi event" text="Terima event agar dapat tampil di halaman publik, voting, dan ticketing." />{data.events.map((event) => <div className="moderation-card" key={event.id}><div className="moderation-icon"><CalendarDays size={18} /></div><div className="moderation-copy"><span className={`state-badge state-${event.status.toLowerCase()}`}>{event.status}</span><h3>{event.name}</h3><p>{event.institution} · {event.organizer.name} · {event._count.registrations} peserta</p></div><div className="row-actions">{event.status === "PENDING" ? <><button className="approve-button" disabled={busyId.includes(event.id)} onClick={() => onEventStatus(event.id, "APPROVED")} type="button"><Check size={14} /> Terima</button><button className="reject-button" onClick={() => onEventStatus(event.id, "REJECTED")} type="button"><X size={14} /> Tolak</button></> : event.status === "APPROVED" ? <button className="reject-button" onClick={() => onEventStatus(event.id, "COMPLETED")} type="button">Tandai selesai</button> : null}</div></div>)}</> : section === "payments" ? <><PanelTitle kicker="REKAP TRANSAKSI" title="Voting & ticketing" text="Transaksi pembayaran yang diterima melalui Midtrans." />{data.payments.map((payment) => <div className="moderation-card payment-row" key={payment.id}><div className="moderation-icon"><CreditCard size={18} /></div><div className="moderation-copy"><span className={`state-badge state-${payment.status.toLowerCase()}`}>{payment.status}</span><h3>{payment.type} · {payment.event?.name || payment.product?.name || "Rekap Baris"}</h3><p>{payment.user.name} · {payment.orderId} · {new Date(payment.createdAt).toLocaleDateString("id-ID")}</p></div><strong>{rupiah(payment.amount)}</strong></div>)}</> : <><PanelTitle kicker="STOK & PRODUK" title="Merchandise resmi" text="Tambahkan produk baru ke toko. Stok diperbarui otomatis setelah transaksi." /><form className="product-form" onSubmit={onProductCreate}><label>Nama produk<input required minLength="2" maxLength="120" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label><label>Harga (IDR)<input required type="number" min="1" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label><label>Stok<input required type="number" min="0" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} /></label><label>URL gambar<input type="url" value={productForm.imageUrl} onChange={(event) => setProductForm({ ...productForm, imageUrl: event.target.value })} /></label><label className="form-wide">Deskripsi<input value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label><button className="button button-primary" disabled={busyId === "product-create"} type="submit">{busyId === "product-create" ? "Menyimpan..." : "Tambahkan produk"} <ArrowRight size={15} /></button></form><p className="dashboard-footnote"><ShieldCheck size={15} /> Produk ditampilkan setelah dibuat. Pengeditan katalog dapat dilakukan dari database/admin API.</p></>}</div></div></section>;
}

function DashboardTools({ products = [], events = [], busyId, eventForm, setEventForm, onEventCreate, onProductUpdate, onPasswordChange }) {
  const [passwordFields, setPasswordFields] = useState({ currentPassword: "", newPassword: "", confirmation: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [openEvent, setOpenEvent] = useState("");
  const [registrations, setRegistrations] = useState([]);
  const [rosterBusy, setRosterBusy] = useState(false);

  const loadRegistrations = async (event) => {
    setRosterBusy(true);
    setPasswordError("");
    try {
      const result = await api(`/admin/events/${event.id}/participants`);
      setOpenEvent(event.id);
      setRegistrations(result.registrations);
    } catch (requestError) {
      setPasswordError(requestError.message);
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
      setPasswordError(requestError.message);
    } finally {
      setRosterBusy(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (passwordFields.newPassword !== passwordFields.confirmation) {
      setPasswordError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }
    setPasswordBusy(true);
    try {
      await onPasswordChange(passwordFields);
      setPasswordMessage("Kata sandi berhasil diubah.");
      setPasswordFields({ currentPassword: "", newPassword: "", confirmation: "" });
    } catch (requestError) {
      setPasswordError(requestError.message);
    } finally {
      setPasswordBusy(false);
    }
  };

  return <section className="section-wrap dashboard-tools">
    <div className="dashboard-tool-card">
      <PanelTitle kicker="KEAMANAN AKUN STAF" title="Ganti kata sandi" text="Perbarui kata sandi akun Admin/Tim Rekap setelah masuk." />
      {passwordError && <div className="form-alert form-alert-error">{passwordError}</div>}
      {passwordMessage && <div className="form-alert">{passwordMessage}</div>}
      <form className="password-change-form" onSubmit={submitPassword}>
        <label>Kata sandi saat ini<input type="password" autoComplete="current-password" minLength="1" required value={passwordFields.currentPassword} onChange={(event) => setPasswordFields({ ...passwordFields, currentPassword: event.target.value })} /></label>
        <label>Kata sandi baru<input type="password" autoComplete="new-password" minLength="12" maxLength="128" required value={passwordFields.newPassword} onChange={(event) => setPasswordFields({ ...passwordFields, newPassword: event.target.value })} /></label>
        <label>Konfirmasi kata sandi<input type="password" autoComplete="new-password" minLength="12" maxLength="128" required value={passwordFields.confirmation} onChange={(event) => setPasswordFields({ ...passwordFields, confirmation: event.target.value })} /></label>
        <button className="button button-outline" disabled={passwordBusy} type="submit">{passwordBusy ? "Menyimpan..." : "Perbarui kata sandi"}</button>
      </form>
    </div>
    <div className="dashboard-tool-card">
      <PanelTitle kicker="PUSAT PUBLIKASI" title="Buat event baru" text="Lengkapi harga, jadwal, lokasi, dan poster. Event buatan Admin langsung aktif; pengajuan Tim menunggu persetujuan." />
      <form className="event-admin-form" onSubmit={onEventCreate}>
        <label>Nama event<input required minLength="3" maxLength="150" value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} /></label>
        <label>Sekolah / institusi<input required minLength="2" maxLength="120" value={eventForm.institution} onChange={(event) => setEventForm({ ...eventForm, institution: event.target.value })} /></label>
        <label>Lokasi<input maxLength="200" value={eventForm.location} onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })} /></label>
        <label>Poster (URL HTTPS)<input type="url" value={eventForm.posterUrl} onChange={(event) => setEventForm({ ...eventForm, posterUrl: event.target.value })} /></label>
        <label>Mulai<input type="datetime-local" value={eventForm.startsAt} onChange={(event) => setEventForm({ ...eventForm, startsAt: event.target.value })} /></label>
        <label>Selesai<input type="datetime-local" value={eventForm.endsAt} onChange={(event) => setEventForm({ ...eventForm, endsAt: event.target.value })} /></label>
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
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title"><button className="modal-close" onClick={close} type="button" aria-label="Tutup"><X size={19} /></button>{loading ? <div className="modal-loading"><span className="loader-orbit" /><p>Memuat detail event...</p></div> : <><div className="modal-cover"><span className="eyebrow">EVENT TERVERIFIKASI</span><span className="modal-cover-mark">RB</span></div><div className="modal-body"><span className="live-pill"><i /> {eventState(event)}</span><h2 id="event-modal-title">{event.name}</h2><p className="modal-institution">{event.institution}{event.location ? ` · ${event.location}` : ""}</p><div className="modal-meta"><span><CalendarDays size={15} />{formatDate(event.startsAt)}</span><span><Users size={15} />{event.participants?.length || event.participants || 0} peserta terverifikasi</span></div><p className="modal-description">{event.description || "Informasi event ini disediakan oleh penyelenggara Rekap Baris."}</p><div className="modal-tabs"><button className={activeMode === "overview" ? "is-active" : ""} type="button" onClick={() => setActiveMode("overview")}>Informasi</button><button className={activeMode === "participants" ? "is-active" : ""} type="button" onClick={() => setActiveMode("participants")}>Peserta & voting</button></div>{activeMode === "participants" ? <div className="participants-panel"><h3>Peserta Pasukan Terpopuler</h3>{event.participants?.length ? event.participants.map((participant, index) => <div className="participant-row" key={participant.id}><span className="participant-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{participant.name}</strong><small>{participant.teamName || "Peserta terverifikasi"}</small></div><span className="participant-votes"><Heart size={13} />{participant.votes} vote</span><button className="vote-button" onClick={() => onVote(participant.id)} disabled={busyId === participant.id} type="button">{busyId === participant.id ? "..." : <><Vote size={14} /> Vote</>}</button></div>) : <EmptyState icon={Vote} title="Peserta belum tersedia" text="Pendaftaran peserta akan muncul setelah diverifikasi." />}<button className="text-link" type="button" onClick={() => onReload()}>Perbarui daftar <ArrowRight size={14} /></button>{user && <div className="participant-register"><span className="eyebrow">DAFTARKAN PESERTA</span><input placeholder={`Nama peserta (default: ${user.name})`} value={participantName} onChange={(event) => setParticipantName(event.target.value)} /><input placeholder="Nama regu / pasukan" value={teamName} onChange={(event) => setTeamName(event.target.value)} /><button className="button button-outline" onClick={() => onRegister(event.id)} disabled={busyId === "participant-register"} type="button">Kirim pendaftaran</button></div>}</div> : <div className="event-purchase-box"><div><span className="eyebrow">TIKET PENONTON</span><strong>{event.ticketPrice ? rupiah(event.ticketPrice) : "Harga segera diumumkan"}</strong></div><label>Jumlah<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label><button className="button button-primary" type="button" onClick={() => event.ticketPrice > 0 ? onBuyTicket() : onMessage("Harga tiket belum tersedia untuk event ini.")}>{busyId === "ticket" ? "Menyiapkan QRIS..." : "Beli tiket dengan QRIS"} <ArrowRight size={15} /></button></div>}<p className="payment-footnote"><ShieldCheck size={14} /> Pembayaran aman via Midtrans QRIS. {user ? "" : <button type="button" onClick={onLogin}>Masuk untuk transaksi</button>}</p></div></>}</section></div>;
}

function AuthModal({ mode, setMode, close, form, update, submit, busy, notice, error, phone, resetToken, setResetToken }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close]);
  const titles = {
    register: ["Mulai baris yang baru.", "Buat akun Rekap Baris."],
    login: ["Senang melihatmu lagi.", "Masuk tanpa kata sandi lewat WhatsApp."],
    otp: ["Periksa WhatsApp-mu.", `Masukkan 6 angka yang dikirim ke ${phone}.`],
    forgot: ["Pulihkan aksesmu.", "Tautan pengaturan ulang dikirim melalui email."],
    reset: ["Atur kata sandi baru.", "Gunakan minimal 12 karakter yang kuat."]
  };
  const [title, subtitle] = titles[mode];
  return <div className="modal-backdrop auth-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading"><button className="modal-close" onClick={close} type="button" aria-label="Tutup"><X size={19} /></button><div className="auth-art"><div className="auth-brand"><img src="/logo.svg" alt="" /><span>rekap<span>baris</span></span></div><div className="auth-decoration">RB</div><div><span className="eyebrow">RUANG UNTUK SEMUA BARIS</span><h2>Yang penting,<br /><em>bergerak bersama.</em></h2><p>Satu platform untuk menyatukan energi di setiap event.</p></div><div className="auth-art-footer"><ShieldCheck size={15} /> Platform event yang lebih dekat</div></div><div className="auth-panel"><div className="auth-heading"><span className="eyebrow">REKAP BARIS / AKUN</span><h2 id="auth-heading">{title}</h2><p>{subtitle}</p></div>{(notice || error) && <div className={`form-alert ${error ? "form-alert-error" : ""}`}>{error || notice}</div>}<form className="auth-form" onSubmit={submit}>
      {mode === "register" && <>
        <label>Nama lengkap<input name="name" autoComplete="name" required minLength="2" maxLength="100" placeholder="Nama sesuai identitas" value={form.name} onChange={update} /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required placeholder="nama@email.com" value={form.email} onChange={update} /></label>
        <label>Nomor WhatsApp<input name="phone" type="tel" autoComplete="tel" required placeholder="62812xxxxxxxx" value={form.phone} onChange={update} /></label>
        <label>Kata sandi akun<input name="password" type="password" autoComplete="new-password" required minLength="12" placeholder="Minimal 12 karakter" value={form.password} onChange={update} /></label>
        <span className="field-caption">Kata sandi dipakai untuk pemulihan akun. Login harian memakai OTP WhatsApp.</span>
        <div className="role-picker"><span>Daftar sebagai</span><div>{roleOptions.map(({ id, label, icon: Icon }) => <button type="button" onClick={() => update({ target: { name: "role", value: id } })} className={form.role === id ? "is-active" : ""} key={id}><Icon size={17} />{label}</button>)}</div></div>
        {form.role === "ORGANIZER" && <><label>Sekolah / institusi<input name="institution" required maxLength="120" placeholder="Nama institusi" value={form.institution} onChange={update} /></label><label>Nama event<input name="eventName" required maxLength="150" placeholder="Kompetisi yang akan diselenggarakan" value={form.eventName} onChange={update} /></label></>}
        <div className="auth-security"><ShieldCheck size={16} /><span>Akun diverifikasi admin setelah OTP WhatsApp berhasil.</span></div>
        <button className="button button-primary auth-submit" disabled={busy} type="submit">{busy ? "Mengirim OTP..." : "Daftar & kirim OTP"} <ArrowRight size={16} /></button>
        <p className="auth-switch">Sudah memiliki akun? <button type="button" onClick={() => setMode("login")}>Masuk</button></p>
      </>}
      {mode === "login" && <>
        <label>Nomor WhatsApp<input name="phone" autoComplete="tel" type="tel" required placeholder="62812xxxxxxxx" value={form.phone} onChange={update} /></label>
        <div className="otp-explain"><div><LockKeyhole size={19} /></div><p>Kami kirim kode sekali pakai ke nomor WhatsApp terdaftar. Kata sandi tidak diperlukan.</p></div>
        <button className="button button-primary auth-submit" disabled={busy} type="submit">{busy ? "Meminta OTP..." : "Kirim kode WhatsApp"} <ArrowRight size={16} /></button>
        <p className="auth-switch"><button type="button" onClick={() => setMode("forgot")}>Lupa sandi?</button><span> · </span><button type="button" onClick={() => setMode("register")}>Buat akun baru</button></p>
      </>}
      {mode === "otp" && <>
        <label>Kode OTP 6 digit<input name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength="6" placeholder="000000" value={form.code} onChange={update} /></label>
        <button className="button button-primary auth-submit" disabled={busy} type="submit">{busy ? "Memverifikasi..." : "Verifikasi & masuk"} <ArrowRight size={16} /></button>
        <p className="auth-switch"><button type="button" onClick={() => { update({ target: { name: "phone", value: phone } }); setMode("login"); }}>Gunakan nomor lain</button></p>
      </>}
      {mode === "forgot" && <>
        <label>Email terdaftar<input name="email" autoComplete="email" type="email" required placeholder="nama@email.com" value={form.email} onChange={update} /></label>
        <div className="otp-explain"><div><Mail size={19} /></div><p>Tautan reset aman berlaku selama 30 menit. Setelah reset, masuk kembali memakai OTP WhatsApp.</p></div>
        <button className="button button-primary auth-submit" disabled={busy} type="submit">{busy ? "Mengirim tautan..." : "Kirim tautan reset"} <ArrowRight size={16} /></button>
        <p className="auth-switch"><button type="button" onClick={() => setMode("login")}>Kembali ke masuk</button></p>
      </>}
      {mode === "reset" && <>
        <label>Token reset<input required value={resetToken} onChange={(event) => setResetToken(event.target.value)} placeholder="Token dari tautan email" /></label>
        <label>Kata sandi baru<input name="password" autoComplete="new-password" type="password" required minLength="12" placeholder="Minimal 12 karakter" value={form.password} onChange={update} /></label>
        <button className="button button-primary auth-submit" disabled={busy} type="submit">{busy ? "Menyimpan..." : "Ubah kata sandi"} <ArrowRight size={16} /></button>
      </>}
    </form></div></section></div>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div><Icon size={22} /></div><h3>{title}</h3><p>{text}</p></div>;
}

function Footer({ onNavigate }) {
  return <footer className="site-footer"><div className="section-wrap footer-main"><div className="footer-brand"><button className="brand" type="button" onClick={() => onNavigate("home")}><img src="/logo.svg" alt="" /><span>rekap<span className="brand-light">baris</span><small>.com</small></span></button><p>Solusi digital untuk energi event yang menyatukan.</p><a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={17} /></a></div><div className="footer-column"><span>JELAJAHI</span>{navigation.slice(1, 5).map(({ id, label }) => <button key={id} onClick={() => onNavigate(id)} type="button">{label}</button>)}</div><div className="footer-column"><span>PLATFORM</span><button onClick={() => onNavigate("about")} type="button">Tentang kami</button><button onClick={() => onNavigate("events")} type="button">Untuk komunitas</button><button onClick={() => onNavigate("about")} type="button">Pusat bantuan</button></div><div className="footer-note"><span className="eyebrow">MOMEN BESAR DIMULAI DI SINI</span><p>Rancang pengalaman event yang bermakna.</p><button className="text-link" onClick={() => onNavigate("events")} type="button">Mulai menjelajah <ArrowRight size={14} /></button></div></div><div className="section-wrap footer-bottom"><span>© {new Date().getFullYear()} Rekap Baris. Dibuat untuk kebersamaan.</span><span>Privasi · Ketentuan · Bantuan</span></div></footer>;
}

export default App;
