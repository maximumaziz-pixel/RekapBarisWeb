import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, Check,
  ChevronDown, Clock3, Compass, CreditCard, Fingerprint, Heart,
  Instagram, LayoutDashboard, LockKeyhole, Moon, Search,
  LogOut, ShieldCheck, ShoppingBag, Sun, Ticket, Trash2, Trophy, UserRound, Users, Vote,
  X, Zap
} from "lucide-react";
import GoogleAuthModal from "./components/AuthModal.jsx";
import WhatsAppFloat from "./components/WhatsAppFloat.jsx";
import ScoringModule from "./components/ScoringModule.jsx";

const navigation = [
  { id: "home", label: "Home", icon: Compass },
  { id: "events", label: "Event", icon: CalendarDays },
  { id: "voting", label: "E-Voting", icon: Vote },
  { id: "tickets", label: "E-Ticketing", icon: Ticket },
  { id: "merch", label: "Merch", icon: ShoppingBag },
  { id: "about", label: "Tentang", icon: Fingerprint }
];
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options
    });
  } catch (cause) {
    const error = new Error("API tidak dapat dijangkau. Pastikan server RekapBaris berjalan dan alamat proxy Vite mengarah ke backend.");
    error.cause = cause;
    throw error;
  }
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

function registrationStatusLabel(status) {
  return ({
    APPROVED: "Terdaftar",
    PENDING: "Menunggu persetujuan",
    REJECTED: "Ditolak",
    ACTIVE: "Aktif"
  })[status] || status || "Status belum tersedia";
}

function formatDate(value) {
  if (!value) return "Jadwal segera diumumkan";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateInputToIso(value, isEndDate = false) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (isEndDate) date.setHours(23, 59, 59, 999);
  return date.toISOString();
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
  const [paymentReturnId, setPaymentReturnId] = useState("");
  const [paymentResult, setPaymentResult] = useState(null);
  const [paymentResultError, setPaymentResultError] = useState("");
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Semua event");
  const [sortBy, setSortBy] = useState("Default");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [participantName, setParticipantName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pendingEventRegistration, setPendingEventRegistration] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("rb-pending-event-registration") || "null"); }
    catch { return null; }
  });
  const pendingRegistrationInFlight = useRef(false);
  const [busyId, setBusyId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [staffData, setStaffData] = useState({ users: [], events: [], payments: [] });
  const [staffSection, setStaffSection] = useState("overview");
  const [memberDashboard, setMemberDashboard] = useState(null);
  const [productForm, setProductForm] = useState({ name: "", description: "", imageUrl: "", price: "", stock: "", variants: "" });
  const [productImageFile, setProductImageFile] = useState(null);
  const emptyEventForm = { name: "", institution: "", description: "", posterUrl: "", posterFile: null, startsAt: "", endsAt: "", schedules: [{ startsAt: "", endsAt: "" }], location: "", ticketPrice: "0", votePrice: "1000" };
  const [eventForm, setEventForm] = useState(emptyEventForm);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("rb-theme", theme);
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") !== "account") return;
    setActiveTab("dashboard");
    params.delete("view");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (pendingEventRegistration) sessionStorage.setItem("rb-pending-event-registration", JSON.stringify(pendingEventRegistration));
    else sessionStorage.removeItem("rb-pending-event-registration");
  }, [pendingEventRegistration]);

  // Read the transaction reference before auth/reset handlers clean up the return URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedPaymentId = params.get("paymentId");
    if (!returnedPaymentId) return;
    setPaymentReturnId(returnedPaymentId);
    params.delete("paymentId");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

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

  useEffect(() => {
    if (!paymentReturnId || !user) return;
    let cancelled = false;
    const checkPayment = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          const result = await api(`/payments/${encodeURIComponent(paymentReturnId)}`);
          if (cancelled) return;
          setPaymentResult(result.payment);
          setPaymentResultError("");
          if (result.payment.status !== "PENDING") return;
        } catch (requestError) {
          if (!cancelled) setPaymentResultError(requestError.message);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        if (cancelled) return;
      }
    };
    checkPayment();
    return () => { cancelled = true; };
  }, [paymentReturnId, user]);

  // Complete an event join after password signup, login, or a Google OAuth redirect.
  useEffect(() => {
    if (user?.role !== "PARTICIPANT" || !pendingEventRegistration || pendingRegistrationInFlight.current) return;
    pendingRegistrationInFlight.current = true;
    setBusyId("participant-register");
    api(`/events/${pendingEventRegistration.eventId}/register`, {
      method: "POST",
      body: JSON.stringify({
        participantName: pendingEventRegistration.participantName || user.name,
        teamName: pendingEventRegistration.teamName || ""
      })
    }).then(async () => {
      setPendingEventRegistration(null);
      setSelectedEvent(null);
      setActiveTab("dashboard");
      setNotice("Akun berhasil dibuat dan pendaftaran event dikirim untuk verifikasi.");
      try {
        setMemberDashboard(await api("/dashboard"));
      } catch (requestError) {
        setError(requestError.message);
      }
    }).catch((requestError) => {
      setPendingEventRegistration(null);
      setError(requestError.message);
    }).finally(() => {
      pendingRegistrationInFlight.current = false;
      setBusyId((current) => current === "participant-register" ? "" : current);
    });
  }, [user, pendingEventRegistration]);

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
      ? result.status === "active" ? "Akun peserta berhasil dibuat. Anda sudah masuk." : result.message
      : mode === "login" ? "Berhasil masuk. Selamat datang!" : result.message);
    if (mode === "reset-password") setResetToken("");
    if (result.user) {
      setUser(result.user);
      setActiveTab("dashboard");
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

  const openEvent = async (event, initialMode = "overview") => {
    setSelectedEvent({ ...event, participants: null, initialMode });
    setBusyId("event-detail");
    try {
      const data = await api(`/events/${event.id}`);
      setSelectedEvent({ ...data.event, initialMode });
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
      setPendingEventRegistration({ eventId, participantName, teamName });
      setSelectedEvent(null);
      startAuth("register");
      return;
    }
    setBusyId("participant-register");
    try {
      await api(`/events/${eventId}/register`, {
        method: "POST",
        body: JSON.stringify({ participantName: participantName || user.name, teamName })
      });
      setNotice("Pendaftaran peserta dikirim untuk verifikasi.");
      api("/dashboard").then(setMemberDashboard).catch(() => {});
      setParticipantName("");
      setTeamName("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const deleteAccount = async (account) => {
    if (!["PARTICIPANT", "ORGANIZER"].includes(account.role)) return;
    if (!window.confirm(`Hapus akun ${account.role === "ORGANIZER" ? "penyelenggara" : "peserta"} “${account.name}”? Tindakan ini tidak dapat dibatalkan.`)) return;
    setBusyId(account.id);
    try {
      await api(`/admin/users/${encodeURIComponent(account.id)}`, { method: "DELETE" });
      await refreshDashboard();
      setNotice("Akun berhasil dihapus.");
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
      let imageUrl = productForm.imageUrl;
      if (productImageFile) {
        if (! ["image/jpeg", "image/png", "image/webp"].includes(productImageFile.type)) throw new Error("Foto produk harus JPEG, PNG, atau WebP.");
        const uploaded = await api("/admin/products/image", { method: "POST", headers: { "Content-Type": productImageFile.type }, body: productImageFile });
        imageUrl = uploaded.imageUrl;
      }
      await api("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          ...productForm,
          imageUrl,
          price: Number(productForm.price),
          stock: Number(productForm.stock),
          variants: productForm.variants.split(",").filter(Boolean).map((item) => { const [size, stock] = item.split(":"); return { size: size.trim(), stock: Number(stock) }; })
        })
      });
      setProductForm({ name: "", description: "", imageUrl: "", price: "", stock: "", variants: "" });
      setProductImageFile(null);
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
          startsAt: dateInputToIso(eventForm.schedules[0]?.startsAt),
          endsAt: dateInputToIso(eventForm.schedules.at(-1)?.endsAt, true),
          schedules: eventForm.schedules.filter((date) => date.startsAt).map((date) => ({ startsAt: dateInputToIso(date.startsAt), endsAt: dateInputToIso(date.endsAt, true) })),
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

  const updateProductVariant = async (id, stock) => {
    setBusyId(`variant-${id}`);
    try {
      await api(`/admin/product-variants/${id}`, { method: "PATCH", body: JSON.stringify({ stock }) });
      await Promise.all([refreshPublicData(), refreshDashboard()]);
      setNotice("Stok varian merchandise berhasil diperbarui.");
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
            {activeTab === "home" && <HomePage events={events} loading={loading} onSelect={openEvent} onRegister={() => startAuth("register")} onLogin={() => startAuth("login")} onExplore={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} onBrowse={() => openTab("events")} />}
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
                onSelect={(event) => openEvent(event, activeTab === "voting" ? "participants" : "overview")}
              />
            )}
            {activeTab === "merch" && (
              <MerchPage products={products} loading={loading} user={user} busyId={busyId} onBuy={(product, quantity, variantId) => pay("merch", { productId: product.id, quantity, ...(variantId ? { variantId } : {}) }, product.id)} />
            )}
            {activeTab === "about" && <AboutPage onJoin={() => startAuth("register")} />}
            {activeTab === "dashboard" && user && ["ADMIN", "TEAM"].includes(user.role) && <DashboardPage
              user={user}
              summary={dashboard}
              data={staffData}
              section={staffSection}
              setSection={setStaffSection}
              busyId={busyId}
              productForm={productForm}
              setProductForm={setProductForm}
              setProductImageFile={setProductImageFile}
              eventForm={eventForm}
              setEventForm={setEventForm}
              products={staffData.products}
              onEventCreate={createEvent}
              onProductCreate={createProduct}
              onProductUpdate={updateProduct}
              onVariantUpdate={updateProductVariant}
              onUserStatus={(id, status) => changeStatus(`/admin/users/${id}/status`, status)}
              onUserDelete={deleteAccount}
              onEventStatus={(id, status) => changeStatus(`/admin/events/${id}/status`, status)}
              onRefresh={refreshDashboard}
            />}
            {activeTab === "dashboard" && user && !["ADMIN", "TEAM"].includes(user.role) && <MemberDashboard user={user} data={memberDashboard} eventForm={eventForm} setEventForm={setEventForm} onEventCreate={createEvent} busyId={busyId} onExploreEvents={() => openTab("events")} onRefresh={async () => setMemberDashboard(await api("/dashboard"))} onLogout={logout} />}
          </>
        )}
      </main>

      <Footer onNavigate={openTab} />

      <WhatsAppFloat />

      {paymentReturnId && <PaymentResultModal
        payment={paymentResult}
        error={paymentResultError}
        close={() => { setPaymentReturnId(""); setPaymentResult(null); setPaymentResultError(""); }}
        onSignIn={() => startAuth("login")}
        onRetry={() => {
          setPaymentResultError("");
          if (user) api(`/payments/${encodeURIComponent(paymentReturnId)}`).then((result) => setPaymentResult(result.payment)).catch((requestError) => setPaymentResultError(requestError.message));
        }}
      />}

      {authMode && <GoogleAuthModal
        mode={authMode}
        setMode={startAuth}
        close={() => { setAuthMode(""); setError(""); }}
        error={error}
        resetToken={resetToken}
        eventRegistration={Boolean(pendingEventRegistration)}
        joinedEventName={events.find((event) => event.id === pendingEventRegistration?.eventId)?.name || ""}
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
        onBuyTicket={(details) => pay("ticket", { eventId: selectedEvent.id, quantity, ...details }, "ticket")}
        onVote={(registrationId, voteQuantity) => pay("vote", { eventId: selectedEvent.id, registrationId, quantity: voteQuantity }, registrationId)}
        onLogin={() => startAuth("login")}
        onReload={() => openEvent(selectedEvent, selectedEvent.initialMode)}
        onMessage={(message) => setError(message)}
      />}
    </div>
  );
}

function PageLoader() {
  return <div className="page-loader" role="status"><span className="loader-orbit" /><p>Menyiapkan pengalaman Anda...</p></div>;
}

function HomePage({ events, loading, onSelect, onRegister, onLogin, onExplore, onBrowse }) {
  return (
    <>
      <section className="section-wrap home-events" aria-labelledby="home-events-title">
        <div className="section-heading"><span className="eyebrow">EVENT TERSEDIA</span><h2 id="home-events-title">Jelajahi Event</h2><p>Pilih event untuk melihat detail, mendaftar sebagai peserta, membeli tiket, atau memberi dukungan.</p></div>
        {loading ? <CardSkeletons /> : events.length
          ? <div className="event-grid">{events.map((event, index) => <EventCard key={event.id} event={event} index={index} onClick={() => onSelect(event)} action="Lihat detail" />)}</div>
          : <EmptyState icon={CalendarDays} title="Belum ada event dipublikasikan" text="Event akan muncul di sini setelah disetujui dan dipublikasikan." />}
      </section>
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
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState("");
  return (
    <section className="section-wrap directory-page">
      <div className="page-kicker"><span className="eyebrow">REKAP BARIS / OFFICIAL MERCH</span><span className="live-pill"><i /> TOKO RESMI</span></div>
      <div className="directory-heading"><div><h1>Semangatnya,<br /><em>bisa dibawa pulang.</em></h1><p>Merchandise pilihan untuk merayakan kebersamaan dan mendukung gerakan baris.</p></div><div className="directory-total"><ShoppingBag size={29} /><span>Koleksi resmi</span></div></div>
      {loading ? <CardSkeletons /> : products.length ? (
        <div className="product-grid">{products.map((product) => { const available = product.variants?.length ? product.variants.some((variant) => variant.stock > 0) : product.stock > 0; return <article className="product-card" key={product.id}><div className="product-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" /> : <div className="product-placeholder"><span>RB</span><small>OFFICIAL<br />MERCHANDISE</small></div>}<span className="stock-label">{available ? "Tersedia" : "Habis"}</span></div><div className="product-details"><span className="eyebrow">REKAP BARIS GOODS</span><h3>{product.name}</h3><p>{product.description || "Koleksi resmi Rekap Baris."}</p><div className="product-purchase"><strong>{rupiah(product.price)}</strong><button className="button button-primary" type="button" disabled={!available || busyId === product.id} onClick={() => { setSelectedProduct(product); setVariantId(product.variants?.find((variant) => variant.stock > 0)?.id || ""); setQuantity(1); }}>{user ? "Beli sekarang" : "Masuk untuk beli"}</button></div></div></article>; })}</div>
      ) : <EmptyState icon={ShoppingBag} title="Koleksi sedang disiapkan" text="Produk resmi Rekap Baris akan hadir di sini." />}
      {selectedProduct && <div className="vote-checkout-backdrop"><section className="vote-checkout" role="dialog" aria-modal="true" aria-labelledby="merch-checkout-title"><button className="modal-close" type="button" aria-label="Tutup" onClick={() => setSelectedProduct(null)}><X size={18} /></button>{selectedProduct.imageUrl && <img className="merch-checkout-image" src={selectedProduct.imageUrl} alt={selectedProduct.name} />}<span className="eyebrow">PEMBELIAN MERCHANDISE</span><h3 id="merch-checkout-title">{selectedProduct.name}</h3><p>{selectedProduct.description}</p>{selectedProduct.variants?.length > 0 && <label>Ukuran<select value={variantId} onChange={(event) => { setVariantId(event.target.value); setQuantity(1); }}><option value="">Pilih ukuran</option>{selectedProduct.variants.map((variant) => <option key={variant.id} value={variant.id} disabled={!variant.stock}>{variant.size}{variant.stock ? ` · stok ${variant.stock}` : " · habis"}</option>)}</select></label>}<label>Jumlah<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>{Array.from({ length: Math.min(10, selectedProduct.variants?.length ? selectedProduct.variants.find((variant) => variant.id === variantId)?.stock || 0 : selectedProduct.stock) }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><div className="vote-total"><span>{rupiah(selectedProduct.price)} / item</span><strong>{rupiah(selectedProduct.price * quantity)}</strong></div><button className="button button-primary" type="button" disabled={busyId === selectedProduct.id || Boolean(selectedProduct.variants?.length && !variantId)} onClick={() => onBuy(selectedProduct, quantity, variantId)}>{busyId === selectedProduct.id ? "Menyiapkan QRIS..." : user ? "Bayar via QRIS" : "Masuk untuk membeli"}</button><small>Stok diperiksa kembali oleh server sebelum transaksi dibuat.</small></section></div>}
    </section>
  );
}

function AboutPage({ onJoin }) {
  return <section className="section-wrap about-page"><div className="about-cover"><span className="eyebrow">RUANG UNTUK SEMUA BARIS</span><h1>Teknologi yang<br /><em>menyatukan gerakan.</em></h1><p>Rekap Baris adalah platform digital untuk membuat pengelolaan event, kompetisi, dukungan komunitas, dan ticketing lebih sederhana.</p><button className="button button-primary button-large" onClick={onJoin} type="button">Bertumbuh bersama <ArrowRight size={16} /></button><div className="about-orbit">RB</div></div><div className="about-values"><div><span>01 / KONEKSI</span><h3>Satu ruang untuk seluruh ekosistem event.</h3><p>Penyelenggara, peserta, juri, dan penonton dapat terhubung lewat pengalaman yang konsisten.</p></div><div><span>02 / TRANSPARANSI</span><h3>Proses yang jelas, data yang tertata.</h3><p>Moderasi event dan akun menjaga ruang publik tetap terpercaya dan nyaman digunakan.</p></div><div><span>03 / KEBERSAMAAN</span><h3>Semangat komunitas tetap menjadi pusatnya.</h3><p>Teknologi hadir untuk mendukung momen kebersamaan, bukan menggantikannya.</p></div></div></section>;
}

function MemberDashboard({ user, data, eventForm, setEventForm, onEventCreate, busyId, onExploreEvents, onRefresh, onLogout }) {
  const [participantTab, setParticipantTab] = useState("events");
  const roleNames = {
    PARTICIPANT: "Dashboard Peserta",
    ORGANIZER: "Dashboard Penyelenggara"
  };
  if (!data) return <section className="section-wrap dashboard-page"><div className="dashboard-wait"><span className="loader-orbit" /><span>Memuat dashboard...</span></div></section>;
  if (user.role === "PARTICIPANT") return <ParticipantDashboard user={user} data={data} onExploreEvents={onExploreEvents} onLogout={onLogout} />;

  return <section className="section-wrap dashboard-page">
    <div className="dashboard-heading">
      <div><span className="eyebrow">DASHBOARD / {user.role}</span><h1>{roleNames[user.role]}</h1><p>Selamat datang, {user.name}. Status akun: {user.status}.</p></div>
    </div>
    {user.role === "PARTICIPANT" && <nav className="member-dashboard-tabs" aria-label="Menu dashboard peserta">
      <button className={participantTab === "events" ? "is-active" : ""} type="button" onClick={() => setParticipantTab("events")}>List Event</button>
      <button className={participantTab === "payments" ? "is-active" : ""} type="button" onClick={() => setParticipantTab("payments")}>Transaksi</button>
    </nav>}
    <div className="member-dashboard">
      <article className="dashboard-panel">
        <span className="eyebrow">PROFIL AKUN</span>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
        {user.phone && <p>{user.phone}</p>}
        {user.institution && <p>Asal satuan: {user.institution}</p>}
      </article>
      {user.role === "PARTICIPANT" && <>
        {participantTab === "events" && <>
          <article className="dashboard-panel member-event-list">
          <div className="panel-heading"><div><span className="eyebrow">EVENT YANG DIIKUTI</span><h3>{data.registrations.length} pendaftaran</h3></div><button className="button button-outline button-small" type="button" onClick={onExploreEvents}>Cari event</button></div>
          {data.registrations.map((item) => <div className="member-event-row" key={item.id}>
            {item.event.posterUrl
              ? <img src={item.event.posterUrl} alt={`Poster ${item.event.name}`} loading="lazy" />
              : <div className="member-event-poster-fallback" aria-hidden="true"><CalendarDays size={20} /></div>}
            <div className="member-event-copy"><strong>{item.event.name}</strong><small>{item.event.institution || "Penyelenggara"} · {formatDate(item.event.startsAt)}</small><small>{item.teamName && item.teamName !== item.participantName ? `${item.participantName} · ${item.teamName}` : item.teamName || item.participantName}</small>{item.event.announcement && <div className="participant-announcement"><strong>{item.event.announcement.title}</strong><p>{item.event.announcement.message}</p></div>}</div>
            <span className={`state-badge state-${item.status.toLowerCase()}`}>{item.status}</span>
          </div>)}
          {!data.registrations.length && <EmptyState icon={CalendarDays} title="Belum mengikuti event" text="Event yang Anda ikuti akan muncul di menu ini." />}
          </article>
        </>}
        {participantTab === "payments" && <article className="dashboard-panel">
          <span className="eyebrow">PEMBAYARAN</span>
          <h2>{data.payments.length} transaksi terbaru</h2>
          {data.payments.map((payment) => <div className="member-dashboard-row" key={payment.id}><strong>{payment.itemName || payment.event?.name || payment.product?.name || payment.type}</strong><span>{payment.status}</span><small>{rupiah(payment.amount)} · {new Date(payment.createdAt).toLocaleDateString("id-ID")}{payment.schedule ? ` · ${formatDate(payment.schedule.startsAt)}` : ""}</small>{payment.adminContactPhone && <small>Pesanan lunas · Hubungi admin: {payment.adminContactPhone}</small>}{payment.tickets?.map((ticket) => <small className="ticket-code" key={ticket.id}>Tiket {ticket.code} · {formatDate(ticket.schedule.startsAt)} · {ticket.status}</small>)}</div>)}
          {!data.payments.length && <p className="empty-inline">Belum ada transaksi.</p>}
        </article>}
      </>}
      {user.role === "ORGANIZER" && <article className="dashboard-panel">
        <span className="eyebrow">EVENT SAYA</span>
        <h2>{data.events.length} event</h2>
        {data.events.map((event) => <OrganizerEventRow key={event.id} event={event} onSaved={onRefresh} />)}
        {!data.events.length && <p className="empty-inline">Belum ada event di akun ini. Hubungi Tim Rekap untuk mengajukan event.</p>}
      </article>}
      {user.role === "ORGANIZER" && <OrganizerEventForm eventForm={eventForm} setEventForm={setEventForm} onEventCreate={onEventCreate} busyId={busyId} />}
    </div>
  </section>;
}

function ParticipantDashboard({ user, data, onExploreEvents, onLogout }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [selectedRegistrationId, setSelectedRegistrationId] = useState("");
  const registrations = Array.isArray(data.registrations) ? data.registrations : [];
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const selectedRegistration = registrations.find((item) => item.id === selectedRegistrationId);
  const approvedCount = registrations.filter((item) => item.status === "APPROVED").length;
  const scoredCount = registrations.filter((item) => item.assessment?.participant?.complete).length;
  const tabItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "events", label: "Event yang diikuti", icon: CalendarDays },
    { id: "history", label: "Riwayat nilai", icon: Trophy },
    { id: "payments", label: "Pesanan saya", icon: CreditCard },
    { id: "profile", label: "Profil", icon: UserRound }
  ];
  const showHistory = (registrationId) => {
    setSelectedRegistrationId(registrationId);
    setActiveSection("history");
  };
  return <section className="section-wrap dashboard-page participant-portal">
    <aside className="participant-sidebar" aria-label="Menu akun peserta">
      <div className="participant-brand"><span>RB</span><strong>Rekap Baris</strong></div>
      <nav>{tabItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeSection === id ? "is-active" : ""} onClick={() => setActiveSection(id)}><Icon size={17} />{label}</button>)}</nav>
      <div className="participant-sidebar-footer"><div className="participant-sidebar-profile"><UserRound size={16} /><span>{user.name}</span></div><button type="button" onClick={onLogout}><LogOut size={16} />Keluar</button></div>
    </aside>
    <div className="participant-portal-main">
      {activeSection === "dashboard" && <>
        <div className="participant-welcome">
          <div><span className="participant-date"><CalendarDays size={14} />{new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</span>
            <h1>Halo, {String(user.name || "Peserta").split(/\s+/)[0]}!</h1>
            <p>Selamat datang kembali. Pantau event dan perkembangan nilai tim Anda di sini.</p></div>
          <div className="participant-welcome-mark" aria-hidden="true"><Trophy size={54} /></div>
        </div>
        <div className="participant-summary-grid">
          <article><span>Event diikuti</span><strong>{registrations.length}</strong><CalendarDays size={20} /></article>
          <article><span>Pendaftaran disetujui</span><strong>{approvedCount}</strong><BadgeCheck size={20} /></article>
          <article><span>Riwayat nilai tersedia</span><strong>{scoredCount}</strong><Trophy size={20} /></article>
        </div>
        <section className="participant-content-card">
          <div className="participant-section-heading"><div><span className="eyebrow">Event yang diikuti</span><h2>Perjalanan lomba Anda</h2><p>Pilih event untuk melihat rincian pendaftaran dan riwayat penilaian.</p></div><button className="button button-outline button-small" type="button" onClick={onExploreEvents}>Cari event <ArrowRight size={14} /></button></div>
          <ParticipantEventList registrations={registrations} onHistory={showHistory} />
        </section>
      </>}
      {activeSection === "events" && <section className="participant-content-card">
        <div className="participant-section-heading"><div><span className="eyebrow">Pendaftaran</span><h2>Event yang diikuti</h2><p>Status pendaftaran dan informasi resmi dari penyelenggara.</p></div><button className="button button-outline button-small" type="button" onClick={onExploreEvents}>Cari event <ArrowRight size={14} /></button></div>
        <ParticipantEventList registrations={registrations} onHistory={showHistory} />
      </section>}
      {activeSection === "history" && <section className="participant-content-card">
        <div className="participant-section-heading"><div><span className="eyebrow">Assessment history</span><h2>Riwayat penilaian</h2><p>Rincian nilai diambil dari format penilaian yang diterapkan pada event.</p></div></div>
        {!selectedRegistration ? <ParticipantEventList registrations={registrations} onHistory={showHistory} historyOnly /> : <>
          <button className="text-link participant-back-link" type="button" onClick={() => setSelectedRegistrationId("")}>← Semua event</button>
          <ParticipantAssessment registration={selectedRegistration} />
        </>}
      </section>}
      {activeSection === "payments" && <section className="participant-content-card">
        <div className="participant-section-heading"><div><span className="eyebrow">Transaksi</span><h2>Pesanan saya</h2><p>Riwayat pembayaran, tiket, dan pesanan merchandise.</p></div></div>
        {payments.map((payment) => <div className="participant-payment-row" key={payment.id}>
          <span className="participant-payment-icon"><CreditCard size={18} /></span>
          <div><strong>{payment.itemName || payment.event?.name || payment.product?.name || payment.type}</strong><small>{rupiah(payment.amount)} · {new Date(payment.createdAt).toLocaleDateString("id-ID")}{payment.schedule ? ` · ${formatDate(payment.schedule.startsAt)}` : ""}</small>{payment.adminContactPhone && <small>Pesanan lunas · Hubungi admin: {payment.adminContactPhone}</small>}{payment.tickets?.map((ticket) => <small className="ticket-code" key={ticket.id}>Tiket {ticket.code} · {formatDate(ticket.schedule?.startsAt)} · {ticket.status}</small>)}</div>
          <span className={`state-badge state-${String(payment.status).toLowerCase()}`}>{payment.status}</span>
        </div>)}
        {!payments.length && <EmptyState icon={CreditCard} title="Belum ada transaksi" text="Pesanan dan pembayaran Anda akan muncul di sini." />}
      </section>}
      {activeSection === "profile" && <section className="participant-content-card participant-profile-page">
        <div className="participant-section-heading"><div><span className="eyebrow">Akun</span><h2>Profil peserta</h2><p>Informasi akun yang digunakan untuk pendaftaran event.</p></div></div>
        <div className="participant-profile-details"><div className="participant-profile-avatar"><UserRound size={30} /></div><div><h3>{user.name}</h3><span className={`state-badge state-${String(user.status).toLowerCase()}`}>{registrationStatusLabel(user.status)}</span></div></div>
        <dl><div><dt>Email</dt><dd>{user.email || "—"}</dd></div><div><dt>Nomor telepon</dt><dd>{user.phone || "—"}</dd></div><div><dt>Asal satuan</dt><dd>{user.institution || "Belum diisi"}</dd></div></dl>
      </section>}
    </div>
  </section>;
}

function ParticipantEventList({ registrations, onHistory, historyOnly = false }) {
  if (!registrations.length) return <EmptyState icon={CalendarDays} title="Belum mengikuti event" text="Event yang Anda ikuti akan muncul di menu ini." />;
  return <div className="participant-event-grid">{registrations.map((item) => <article className="participant-event-card" key={item.id}>
    {item.event?.posterUrl ? <img src={item.event.posterUrl} alt={`Poster ${item.event.name}`} loading="lazy" /> : <div className="participant-event-placeholder"><Trophy size={27} /></div>}
    <div className="participant-event-card-body">
      <span className={`state-badge state-${String(item.status).toLowerCase()}`}>{registrationStatusLabel(item.status)}</span>
      <h3>{item.event?.name || "Event"}</h3>
      <p>{item.event?.institution || "Penyelenggara"} · {formatDate(item.event?.startsAt)}</p>
      <small>{item.teamName && item.teamName !== item.participantName ? `${item.participantName} · ${item.teamName}` : item.teamName || item.participantName}</small>
      {item.event?.announcement && <div className="participant-announcement"><strong>{item.event.announcement.title}</strong><p>{item.event.announcement.message}</p></div>}
      <div className="participant-event-actions"><button className="button button-outline button-small" type="button" onClick={() => onHistory(item.id)}>{historyOnly ? "Lihat riwayat nilai" : "Lihat detail"} <ArrowRight size={14} /></button>{item.assessment?.tier && <small>{item.assessment.tier.name}</small>}</div>
    </div>
  </article>)}</div>;
}

function ParticipantAssessment({ registration }) {
  const assessment = registration.assessment;
  if (assessment?.error) return <div className="form-alert form-alert-error" role="alert">{assessment.error}</div>;
  if (!assessment) return <EmptyState icon={Trophy} title="Riwayat nilai belum tersedia" text={registration.status === "APPROVED" ? "Penilaian event ini belum dikonfigurasi atau belum tersedia." : "Riwayat nilai akan tersedia setelah pendaftaran disetujui."} />;
  const configuration = assessment.configuration || {};
  const participant = assessment.participant || {};
  const scoreEntries = Array.isArray(participant.scores) ? participant.scores : [];
  const configuredCategories = Array.isArray(configuration.categories)
    ? configuration.categories.filter((category) => category && typeof category === "object" && typeof category.id === "string")
    : [];
  const categories = configuredCategories.length ? configuredCategories : [...new Map(scoreEntries.map((score) => [
    score.categoryId,
    { id: score.categoryId, name: score.categoryName || "Kategori" }
  ])).values()];
  const judges = Array.isArray(configuration.judges)
    ? configuration.judges.filter((judge) => judge && typeof judge === "object")
    : [];
  const penalties = Array.isArray(participant.penalties) ? participant.penalties : [];
  const overall = assessment.overall;
  const rankings = Array.isArray(assessment.rankings) ? assessment.rankings : [];
  const categoryScore = (categoryId) => (Array.isArray(participant.categoryTotals) ? participant.categoryTotals.find((item) => item.id === categoryId) : null);
  const categoryRows = categories.map((category) => ({
    ...category,
    criteria: scoreEntries.filter((criterion) => criterion.categoryId === category.id),
    judges: judges.filter((judge) => (Array.isArray(judge.categoryIds) ? judge.categoryIds : []).includes(category.id))
  }));
  categoryRows.forEach((category) => {
    if (!category.judges.length) category.judges = [...new Map(category.criteria.flatMap((criterion) => criterion.judgeScores || [])
      .filter((score) => score.label)
      .map((score) => [score.label, { id: score.label, label: score.label }])).values()];
  });
  const dantonCategories = categoryRows.filter((category) => category.rankingGroup === "danton" || /danton/i.test(`${category.name} ${category.id}`));
  const dantonTotal = dantonCategories.reduce((sum, category) => sum + (categoryScore(category.id)?.total || 0), 0);
  const formatScore = (value) => value === null || value === undefined ? "—" : String(Math.round(Number(value) || 0));
  const rankingCards = rankings.filter((ranking) => ranking.id === "overall" || ranking.id === "danton");
  return <div className="participant-assessment">
    <div className="participant-assessment-heading"><div><h3>{registration.event?.name || "Event"}</h3><p>{registration.teamName || registration.participantName} · {assessment.tier?.name || "Tingkat 1"}</p></div><span className={`participant-score-state${participant.complete ? " is-complete" : ""}`}>{participant.complete ? "Nilai lengkap" : "Menunggu nilai"}</span></div>
    <div className="participant-result-summary">
      {rankingCards.map((ranking) => <article key={ranking.id}><span>{ranking.id === "overall" ? "Peringkat keseluruhan" : "Peringkat Danton"}</span><strong>{ranking.participant?.rank ? `#${ranking.participant.rank}` : "—"}</strong><small>{ranking.participant?.rankingTotal === null || ranking.participant?.rankingTotal === undefined ? "Belum lengkap" : `${formatScore(ranking.participant.rankingTotal)} poin`}</small>{ranking.comparisonLabel && <small>Pembanding: {ranking.comparisonLabel} · {formatScore(ranking.participant?.comparisonValue)}</small>}</article>)}
      <article><span>Waktu tampil</span><strong>{participant.performanceTime || "—"}</strong><small>{configuration.settings?.maxPerformanceTime ? `Batas ${configuration.settings.maxPerformanceTime}` : "Tidak ada batas waktu"}</small></article>
      <article><span>Total penalti</span><strong>{formatScore(participant.penaltyTotal || 0)}</strong><small>{penalties.length ? penalties.map((penalty) => `${penalty.name} × ${penalty.quantity}`).join(" · ") : "Tidak ada penalti"}</small></article>
      <article><span>Nilai akhir</span><strong>{overall?.total === null || overall?.total === undefined ? "—" : formatScore(overall.total)}</strong><small>Nilai tertimbang setelah penalti</small></article>
    </div>
    {dantonCategories.length > 0 && <div className="participant-danton-total"><Trophy size={18} /><span>Total kategori Danton PBB + Danton Variasi dan Formasi</span><strong>{formatScore(dantonTotal)}</strong></div>}
    {!categoryRows.length ? <EmptyState icon={Trophy} title="Format penilaian belum tersedia" text="Penyelenggara belum menerapkan format penilaian pada tingkatan ini." /> : <div className="participant-score-categories">
      {categoryRows.map((category) => <article className="participant-score-category" key={category.id}>
        <div className="participant-score-category-heading"><h4>{category.name}</h4><strong>{formatScore(categoryScore(category.id)?.total)}</strong></div>
        {!category.criteria.length ? <p className="empty-inline">Belum ada rincian nilai pada kategori ini.</p> : <div className="participant-score-table-wrap"><table className="participant-score-table">
          <thead><tr><th>Kriteria</th>{category.judges.map((judge) => <th key={judge.id}>{judge.label || judge.name}</th>)}<th>Total</th></tr></thead>
          <tbody>{category.criteria.map((criterion) => <tr key={criterion.criterionId}><td>{criterion.name}</td>{category.judges.map((judge) => <td key={judge.id}>{formatScore(criterion.judgeScores?.find((score) => score.label === (judge.label || judge.name))?.value)}</td>)}<td>{formatScore(criterion.total)}</td></tr>)}</tbody>
        </table></div>}
      </article>)}
    </div>}
  </div>;
}

function localDateValue(value) {
  return dateInputValue(value);
}

function OrganizerEventRow({ event, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: event.name,
    description: event.description,
    location: event.location,
    posterUrl: event.posterUrl,
    schedules: event.schedules?.length ? event.schedules.map((date) => ({ startsAt: localDateValue(date.startsAt), endsAt: localDateValue(date.endsAt) })) : event.startsAt ? [{ startsAt: localDateValue(event.startsAt), endsAt: localDateValue(event.endsAt) }] : [{ startsAt: "", endsAt: "" }]
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const schedules = form.schedules.filter((date) => date.startsAt).map((date) => ({ startsAt: dateInputToIso(date.startsAt), endsAt: dateInputToIso(date.endsAt, true) }));
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
      {form.posterUrl && <img className="event-poster-preview" src={form.posterUrl} alt={`Poster ${form.name}`} />}
      <label className="form-wide">Poster event<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm({ ...form, posterFile: e.target.files?.[0] || null })} /><small>Unggah JPEG, PNG, atau WebP; maksimal 5 MB.</small></label>
      <label>Deskripsi<textarea maxLength="3000" rows="3" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div className="event-date-list">{form.schedules.map((date, index) => <div className="event-date-row" key={index}><label>Tanggal mulai<input type="date" value={date.startsAt} onChange={(e) => setForm({ ...form, schedules: form.schedules.map((item, i) => i === index ? { ...item, startsAt: e.target.value } : item) })} /></label><label>Tanggal selesai<input type="date" value={date.endsAt} onChange={(e) => setForm({ ...form, schedules: form.schedules.map((item, i) => i === index ? { ...item, endsAt: e.target.value } : item) })} /></label>{form.schedules.length > 1 && <button type="button" className="reject-button" aria-label={`Hapus tanggal ${index + 1}`} onClick={() => setForm({ ...form, schedules: form.schedules.filter((_, i) => i !== index) })}><X size={15} /></button>}</div>)}<button className="text-link" type="button" onClick={() => setForm({ ...form, schedules: [...form.schedules, { startsAt: "", endsAt: "" }] })}><CalendarDays size={14} /> Tambah tanggal</button></div>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan perubahan"}</button>
    </form>}
  </div>;
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
      <label className="form-wide">Poster event<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEventForm({ ...eventForm, posterFile: event.target.files?.[0] || null })} /><small>Unggah JPEG, PNG, atau WebP; maksimal 5 MB.</small></label>
      <div className="event-date-list">{eventForm.schedules.map((date, index) => <div className="event-date-row" key={index}><label>Tanggal mulai<input type="date" value={date.startsAt} onChange={(event) => updateDate(index, "startsAt", event.target.value)} /></label><label>Tanggal selesai<input type="date" value={date.endsAt} onChange={(event) => updateDate(index, "endsAt", event.target.value)} /></label>{eventForm.schedules.length > 1 && <button type="button" className="reject-button" aria-label={`Hapus tanggal ${index + 1}`} onClick={() => setEventForm({ ...eventForm, schedules: eventForm.schedules.filter((_, i) => i !== index) })}><X size={15} /></button>}</div>)}<button className="text-link" type="button" onClick={() => setEventForm({ ...eventForm, schedules: [...eventForm.schedules, { startsAt: "", endsAt: "" }] })}><CalendarDays size={14} /> Tambah tanggal</button></div>
      <label className="event-description-field">Deskripsi<textarea maxLength="3000" rows="3" value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} /></label>
      <button className="button button-primary" type="submit" disabled={busyId === "event-create"}>{busyId === "event-create" ? "Menyimpan..." : "Ajukan event"}<ArrowRight size={15} /></button>
    </form>
  </article>;
}

function DashboardPage({ user, summary, data, section, setSection, busyId, productForm, setProductForm, setProductImageFile, eventForm, setEventForm, products = [], onEventCreate, onProductCreate, onProductUpdate, onVariantUpdate, onUserStatus, onUserDelete, onEventStatus, onRefresh }) {
  const [rosterEventId, setRosterEventId] = useState("");
  const [rosterRows, setRosterRows] = useState([]);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const loadRoster = async () => {
    if (!rosterEventId) return;
    setRosterBusy(true);
    setRosterError("");
    try {
      const result = await api(`/admin/events/${rosterEventId}/participants`);
      setRosterRows(result.registrations || []);
    } catch (loadError) {
      setRosterError(loadError.message);
    } finally {
      setRosterBusy(false);
    }
  };
  const reviewRegistration = async (registrationId, status) => {
    setRosterBusy(true);
    setRosterError("");
    try {
      await api(`/admin/registrations/${registrationId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      const result = await api(`/admin/events/${rosterEventId}/participants`);
      setRosterRows(result.registrations || []);
    } catch (requestError) {
      setRosterError(requestError.message);
    } finally {
      setRosterBusy(false);
    }
  };
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
        {sections.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "is-active" : ""} onClick={() => setSection(id)} type="button" aria-label={label} title={label}><Icon size={19} aria-hidden="true" /><span className="visually-hidden">{label}</span></button>)}
      </aside>
      <div className="dashboard-content">
        {!summary ? <div className="dashboard-wait"><span className="loader-orbit" /><span>Memuat data dashboard...</span></div> : section === "overview" ? <>
          <div className="dashboard-welcome"><div><span className="eyebrow">RINGKASAN PLATFORM</span><h2>Aktivitas Rekap Baris</h2></div><span className="live-pill"><i /> DATA TERBARU</span></div>
          <div className="metric-grid"><Metric label="Total akun" value={summary.users} icon={Users} /><Metric label="Menunggu verifikasi" value={summary.pendingUsers} icon={Clock3} tone="yellow" /><Metric label="Event terdaftar" value={summary.events} icon={CalendarDays} /></div>
          <div className="dashboard-panels">
            <div className="dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">PERLU TINDAKAN</span><h3>Pengajuan terbaru</h3></div><button className="text-link" type="button" onClick={() => setSection("users")}>Lihat akun <ArrowRight size={14} /></button></div>
              {data.users.filter((item) => item.status === "PENDING").slice(0, 4).map((item) => <div className="mini-row" key={item.id}><span className="mini-avatar"><UserRound size={15} /></span><div><strong>{item.name}</strong><small>{item.role} · {item.email}</small></div><span className="pending-badge">Pending</span></div>)}
              {!data.users.some((item) => item.status === "PENDING") && <p className="empty-inline">Tidak ada akun yang menunggu verifikasi.</p>}
            </div>
            <div className="dashboard-panel revenue-panel"><span className="eyebrow">PEMBAYARAN TERVERIFIKASI</span><strong>{rupiah(summary.revenue)}</strong><p>{summary.settledPayments} transaksi berhasil tercatat.</p><div className="revenue-decoration"><CreditCard size={27} /></div></div>
          </div>
        </> : section === "scoring" ? <ScoringModule events={data.events} /> : section === "users" ? <>
          <PanelTitle kicker="MANAJEMEN AKUN" title="Akun pengguna" text="Tinjau data dan persetujuan pendaftaran peserta serta penyelenggara." />
          <div className="staff-table">{data.users.map((item) => <div className="staff-row" key={item.id}>
            <div className="staff-person"><span className="mini-avatar"><UserRound size={15} /></span><div><strong>{item.name}</strong><small>{[item.email, item.phone, item.institution, item.eventName].filter(Boolean).join(" · ")}</small></div></div>
            <span className={`state-badge state-${item.status.toLowerCase()}`}>{item.status}</span><span className="role-label">{item.role}</span>
            {item.status === "PENDING" && !["ADMIN", "TEAM"].includes(item.role)
              ? <div className="row-actions"><button type="button" className="approve-button" disabled={busyId.includes(item.id)} onClick={() => onUserStatus(item.id, "ACTIVE")}><Check size={14} /> Terima</button><button type="button" className="reject-button" onClick={() => onUserStatus(item.id, "REJECTED")}><X size={14} /></button><button type="button" className="reject-button" disabled={busyId === item.id} title="Hapus akun" aria-label={`Hapus akun ${item.name}`} onClick={() => onUserDelete(item)}><Trash2 size={14} /></button></div>
              : <div className="row-actions"><span className="verified-hint">{item.googleId ? "Google terhubung" : ""}</span>{["PARTICIPANT", "ORGANIZER"].includes(item.role) && <button type="button" className="reject-button" disabled={busyId === item.id} title="Hapus akun" aria-label={`Hapus akun ${item.name}`} onClick={() => onUserDelete(item)}><Trash2 size={14} /></button>}</div>}
          </div>)}</div>
        </> : section === "events" ? <>
          <PanelTitle kicker="MANAJEMEN EVENT" title="Pusat verifikasi event" text="Buat event baru, tinjau pengajuan, dan kelola pendaftaran peserta." />
          <div className="dashboard-panel"><span className="eyebrow">PUSAT PUBLIKASI</span><h3>Buat event baru</h3><form className="event-admin-form" onSubmit={onEventCreate}>
            <label>Nama event<input required minLength="3" maxLength="150" value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} /></label>
            <label>Sekolah / institusi<input required minLength="2" maxLength="120" value={eventForm.institution} onChange={(event) => setEventForm({ ...eventForm, institution: event.target.value })} /></label>
            <label>Lokasi<input maxLength="200" value={eventForm.location} onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })} /></label>
            <label className="form-wide">Poster event<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEventForm({ ...eventForm, posterFile: event.target.files?.[0] || null })} /><small>Unggah JPEG, PNG, atau WebP; maksimal 5 MB.</small></label>
            <div className="event-date-list">{eventForm.schedules.map((date, index) => <div className="event-date-row" key={index}><label>Tanggal mulai<input type="date" value={date.startsAt} onChange={(event) => setEventForm({ ...eventForm, schedules: eventForm.schedules.map((item, i) => i === index ? { ...item, startsAt: event.target.value } : item) })} /></label><label>Tanggal selesai<input type="date" value={date.endsAt} onChange={(event) => setEventForm({ ...eventForm, schedules: eventForm.schedules.map((item, i) => i === index ? { ...item, endsAt: event.target.value } : item) })} /></label>{eventForm.schedules.length > 1 && <button type="button" className="reject-button" aria-label={`Hapus tanggal ${index + 1}`} onClick={() => setEventForm({ ...eventForm, schedules: eventForm.schedules.filter((_, i) => i !== index) })}><X size={15} /></button>}</div>)}<button className="text-link" type="button" onClick={() => setEventForm({ ...eventForm, schedules: [...eventForm.schedules, { startsAt: "", endsAt: "" }] })}><CalendarDays size={14} /> Tambah tanggal</button></div>
            <label>Harga tiket (IDR)<input type="number" min="0" max="100000000" value={eventForm.ticketPrice} onChange={(event) => setEventForm({ ...eventForm, ticketPrice: event.target.value })} /></label>
            <label>Harga vote (IDR)<input type="number" min="1000" max="10000000" value={eventForm.votePrice} onChange={(event) => setEventForm({ ...eventForm, votePrice: event.target.value })} /></label>
            <label className="event-description-field">Deskripsi<textarea maxLength="3000" rows="3" value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} /></label>
            <button className="button button-primary" disabled={busyId === "event-create"} type="submit">{busyId === "event-create" ? "Menyimpan..." : "Publikasikan event"} <ArrowRight size={15} /></button>
          </form></div>
          {data.events.map((event) => <div className="moderation-card" key={event.id}><div className="moderation-icon"><CalendarDays size={18} /></div><div className="moderation-copy"><span className={`state-badge state-${event.status.toLowerCase()}`}>{event.status}</span><h3>{event.name}</h3><p>{event.institution} · {event.organizer.name} · {event._count.registrations} peserta</p></div><div className="row-actions">
            {event.status === "PENDING" ? <><button className="approve-button" disabled={busyId.includes(event.id)} onClick={() => onEventStatus(event.id, "APPROVED")} type="button"><Check size={14} /> Terima</button><button className="reject-button" onClick={() => onEventStatus(event.id, "REJECTED")} type="button"><X size={14} /> Tolak</button></> : event.status === "APPROVED" ? <button className="reject-button" onClick={() => onEventStatus(event.id, "COMPLETED")} type="button">Tandai selesai</button> : null}
          </div></div>)}
          <div className="dashboard-panel scoring-panel"><div className="panel-heading"><div><span className="eyebrow">DATABASE PESERTA</span><h3>Peserta berdasarkan event</h3></div></div><div className="scoring-inline-form"><label>Event<select value={rosterEventId} onChange={(event) => { setRosterEventId(event.target.value); setRosterRows([]); setRosterError(""); }}><option value="">Pilih event</option>{data.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label><button type="button" className="button button-outline" disabled={!rosterEventId || rosterBusy} onClick={loadRoster}>{rosterBusy ? "Memuat..." : "Tampilkan peserta"}</button></div>{rosterError && <div className="form-alert form-alert-error" role="alert">{rosterError}</div>}{rosterRows.length ? <div className="staff-table">{rosterRows.map((row, index) => <div className="staff-row" key={row.id}><div className="staff-person"><span className="participant-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{row.participantName}</strong><small>{[row.teamName, row.user?.email, new Date(row.createdAt).toLocaleDateString("id-ID")].filter(Boolean).join(" · ")}</small></div></div><span className={`state-badge state-${row.status.toLowerCase()}`}>{row.status}</span>{row.status === "PENDING" && <div className="row-actions"><button type="button" className="approve-button" disabled={rosterBusy} onClick={() => reviewRegistration(row.id, "APPROVED")}><Check size={13} /> Terima</button><button type="button" className="reject-button" disabled={rosterBusy} onClick={() => reviewRegistration(row.id, "REJECTED")}><X size={13} /> Tolak</button></div>}</div>)}</div> : rosterEventId && !rosterBusy && !rosterError ? <p className="empty-inline">Belum ada peserta pada event ini atau daftar belum dimuat.</p> : null}</div>
        </> : section === "payments" ? <>
          <PanelTitle kicker="REKAP TRANSAKSI" title="Voting & ticketing" text="Transaksi pembayaran yang diterima melalui Midtrans." />
          {data.payments.map((payment) => <div className="moderation-card payment-row" key={payment.id}><div className="moderation-icon"><CreditCard size={18} /></div><div className="moderation-copy"><span className={`state-badge state-${payment.status.toLowerCase()}`}>{payment.status}</span><h3>{payment.type} · {payment.event?.name || payment.product?.name || "Rekap Baris"}</h3><p>{payment.user.name} · {payment.orderId} · {new Date(payment.createdAt).toLocaleDateString("id-ID")}</p></div><strong>{rupiah(payment.amount)}</strong></div>)}
        </> : <>
          <PanelTitle kicker="STOK & PRODUK" title="Merchandise resmi" text="Tambahkan produk baru ke toko. Stok diperbarui otomatis setelah transaksi." />
          <form className="product-form" onSubmit={onProductCreate}>
            <label>Nama produk<input required minLength="2" maxLength="120" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
            <label>Harga (IDR)<input required type="number" min="1" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label>
            <label>Stok<input required type="number" min="0" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} /></label>
            <label className="form-wide">Ukuran dan stok varian<input value={productForm.variants} onChange={(event) => setProductForm({ ...productForm, variants: event.target.value })} placeholder="S:10, M:8, L:5" /><small>Opsional. Format ukuran:stok dipisahkan koma.</small></label>
            <label>Foto produk<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProductImageFile(event.target.files?.[0] || null)} /><small>JPEG, PNG, atau WebP; maksimal 5 MB.</small></label>
            <label className="form-wide">Deskripsi<input value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
            <button className="button button-primary" disabled={busyId === "product-create"} type="submit">Tambahkan produk <ArrowRight size={15} /></button>
          </form>
          <div className="dashboard-panel scoring-panel"><div className="panel-heading"><div><span className="eyebrow">KONTROL STOK</span><h3>Inventaris merchandise</h3></div></div>{!products.length ? <p className="empty-inline">Belum ada produk merchandise.</p> : products.map((product) => <InventoryRow key={product.id} product={product} busy={busyId === `product-${product.id}`} onSave={(changes) => onProductUpdate(product.id, changes)} onVariantUpdate={onVariantUpdate} busyId={busyId} />)}</div>
          <p className="dashboard-footnote"><ShieldCheck size={15} /> Produk ditampilkan setelah dibuat. Pengeditan katalog dapat dilakukan dari database/admin API.</p>
        </>}
      </div>
    </div>
  </section>;
}

function Metric({ label, value, icon: Icon, tone = "" }) {
  return <div className={`metric-card ${tone ? `metric-${tone}` : ""}`}><div className="metric-top"><span>{label}</span><Icon size={17} /></div><strong>{value.toLocaleString("id-ID")}</strong><span className="metric-caption">Seluruh periode</span></div>;
}

function PanelTitle({ kicker, title, text }) {
  return <div className="panel-title"><span className="eyebrow">{kicker}</span><h2>{title}</h2><p>{text}</p></div>;
}

function EventModal({ event, loading, user, participantName, setParticipantName, teamName, setTeamName, quantity, setQuantity, busyId, close, onRegister, onBuyTicket, onVote, onLogin, onReload, onMessage }) {
  const [activeMode, setActiveMode] = useState(event.initialMode || "overview");
  const [voteTarget, setVoteTarget] = useState(null);
  const [voteQuantity, setVoteQuantity] = useState(1);
  const [scheduleId, setScheduleId] = useState(event.schedules?.[0]?.id || "");
  const [buyerName, setBuyerName] = useState(user?.name || "");
  const [buyerPhone, setBuyerPhone] = useState(user?.phone || "");
  useEffect(() => {
    setActiveMode(event.initialMode || "overview");
    setScheduleId(event.schedules?.[0]?.id || "");
    setBuyerName(user?.name || "");
    setBuyerPhone(user?.phone || "");
  }, [event.id, event.schedules, user?.name, user?.phone]);
  useEffect(() => {
    const closeOnEscape = (keyEvent) => { if (keyEvent.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close]);
  return <div className="modal-backdrop" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) close(); }}>
    <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
      <button className="modal-close" onClick={close} type="button" aria-label="Tutup"><X size={19} /></button>
      {loading ? <div className="modal-loading"><span className="loader-orbit" /><p>Memuat detail event...</p></div> : <>
        <div className="modal-cover">{event.posterUrl && <img src={event.posterUrl} alt={`Poster ${event.name}`} />}<span className="eyebrow">EVENT TERVERIFIKASI</span><span className="modal-cover-mark">RB</span></div>
        <div className="modal-body">
          <span className="live-pill"><i /> {eventState(event)}</span>
          <h2 id="event-modal-title">{event.name}</h2>
          <p className="modal-institution">{event.institution}{event.location ? ` · ${event.location}` : ""}</p>
          <div className="modal-meta"><span><CalendarDays size={15} />{event.schedules?.length ? event.schedules.map((date) => formatDate(date.startsAt)).join(" / ") : formatDate(event.startsAt)}</span><span><Users size={15} />{event.participants?.length || event.participants || 0} peserta terverifikasi</span></div>
          <p className="modal-description">{event.description || "Informasi event ini disediakan oleh penyelenggara Rekap Baris."}</p>
          <div className="modal-tabs"><button className={activeMode === "overview" ? "is-active" : ""} type="button" onClick={() => setActiveMode("overview")}>Informasi & tiket</button><button className={activeMode === "participants" ? "is-active" : ""} type="button" onClick={() => setActiveMode("participants")}>Peserta & voting</button></div>
          {activeMode === "participants" ? <div className="participants-panel">
            <h3>Peserta event</h3>
            {event.participants?.length ? event.participants.map((participant, index) => <div className="participant-row" key={participant.id}><span className="participant-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{participant.name}</strong><small>{participant.teamName || "Peserta terverifikasi"}</small></div><span className="participant-votes"><Heart size={13} />{participant.votes} vote</span><button className="vote-button" onClick={() => { setVoteTarget(participant); setVoteQuantity(1); }} disabled={busyId === participant.id} type="button"><Vote size={14} /> Beri Vote</button></div>) : <EmptyState icon={Vote} title="Peserta belum tersedia" text="Pendaftaran peserta akan muncul setelah diverifikasi." />}
            <button className="text-link" type="button" onClick={onReload}>Perbarui daftar <ArrowRight size={14} /></button>
          </div> : <div className="event-purchase-box ticket-purchase-box">
            <div><span className="eyebrow">TIKET PENONTON</span><strong>{event.ticketPrice > 0 ? `${rupiah(event.ticketPrice)} / tiket` : "Harga segera diumumkan"}</strong></div>
            <label>Tanggal tiket<select required value={scheduleId} onChange={(inputEvent) => setScheduleId(inputEvent.target.value)}><option value="">Pilih satu tanggal</option>{event.schedules?.map((date) => <option key={date.id} value={date.id}>{formatDate(date.startsAt)}{date.endsAt ? ` · sampai ${formatDate(date.endsAt)}` : ""}</option>)}</select></label>
            <label>Jumlah<select value={quantity} onChange={(inputEvent) => setQuantity(Number(inputEvent.target.value))}>{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            {user && <><label>Nama pembeli<input required minLength="2" maxLength="120" value={buyerName} onChange={(inputEvent) => setBuyerName(inputEvent.target.value)} /></label><label>Nomor HP<input required type="tel" minLength="8" maxLength="30" value={buyerPhone} onChange={(inputEvent) => setBuyerPhone(inputEvent.target.value)} /></label></>}
            <strong className="ticket-total">Total sementara: {rupiah((event.ticketPrice || 0) * quantity)}</strong>
            <button className="button button-primary" type="button" disabled={busyId === "ticket" || !scheduleId || !event.schedules?.length} onClick={() => !user ? onLogin() : event.ticketPrice > 0 ? onBuyTicket({ scheduleId, buyerName, buyerPhone }) : onMessage("Harga tiket belum tersedia untuk event ini.")}>{busyId === "ticket" ? "Menyiapkan QRIS..." : user ? "Bayar tiket via QRIS" : "Masuk untuk membeli tiket"} <ArrowRight size={15} /></button>
          </div>}
          <div className="participant-register">
            <span className="eyebrow">PENDAFTARAN PESERTA</span>
            {user && <><input placeholder={`Nama peserta (default: ${user.name})`} value={participantName} onChange={(inputEvent) => setParticipantName(inputEvent.target.value)} /><input placeholder="Nama regu / pasukan" value={teamName} onChange={(inputEvent) => setTeamName(inputEvent.target.value)} /></>}
            <button className="button button-outline" onClick={() => onRegister(event.id)} disabled={busyId === "participant-register"} type="button">{user ? "Daftar sebagai peserta" : "Daftar sebagai peserta"}</button>
          </div>
          <p className="payment-footnote"><ShieldCheck size={14} /> Pembayaran aman via Midtrans QRIS. {!user && <button type="button" onClick={onLogin}>Sudah punya akun? Masuk</button>}</p>
          {voteTarget && <div className="vote-checkout-backdrop"><section className="vote-checkout" role="dialog" aria-modal="true" aria-labelledby="vote-checkout-title"><button className="modal-close" type="button" aria-label="Tutup" onClick={() => setVoteTarget(null)}><X size={18} /></button><span className="eyebrow">PEMBAYARAN VOTE</span><h3 id="vote-checkout-title">{event.name}</h3><p>Vote untuk <strong>{voteTarget.name}</strong></p><label>Jumlah vote<select value={voteQuantity} onChange={(inputEvent) => setVoteQuantity(Number(inputEvent.target.value))}>{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><div className="vote-total"><span>{rupiah(event.votePrice || 0)} / vote</span><strong>{rupiah((event.votePrice || 0) * voteQuantity)}</strong></div><button className="button button-primary" type="button" disabled={!user || busyId === voteTarget.id || !(event.votePrice > 0)} onClick={() => onVote(voteTarget.id, voteQuantity)}>{busyId === voteTarget.id ? "Menyiapkan QRIS..." : "Bayar via QRIS"} <ArrowRight size={15} /></button>{!user && <button className="text-link" type="button" onClick={onLogin}>Masuk untuk melanjutkan</button>}{!(event.votePrice > 0) && <small>Harga vote belum diatur untuk event ini.</small>}</section></div>}
        </div>
      </>}
    </section>
  </div>;
}

function PaymentResultModal({ payment, error, close, onRetry, onSignIn }) {
  const statusLabels = {
    PENDING: "Menunggu konfirmasi pembayaran",
    SETTLED: "Pembayaran berhasil",
    FAILED: "Pembayaran gagal",
    EXPIRED: "Pembayaran kedaluwarsa",
    CANCELLED: "Pembayaran dibatalkan",
    REFUNDED: "Pembayaran dikembalikan"
  };
  const status = payment?.status || "PENDING";
  const isSettled = status === "SETTLED";
  return <div className="modal-backdrop payment-result-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="vote-checkout payment-result-modal" role="dialog" aria-modal="true" aria-labelledby="payment-result-title">
      <button className="modal-close" type="button" aria-label="Tutup" onClick={close}><X size={18} /></button>
      <span className="eyebrow">STATUS TRANSAKSI QRIS</span>
      <h3 id="payment-result-title">{error ? "Status belum dapat dimuat" : statusLabels[status] || "Status pembayaran"}</h3>
      {error
        ? <div className="form-alert form-alert-error" role="alert">{error}</div>
        : !payment
          ? <p>Memeriksa transaksi Anda...</p>
          : <>
            <p>{payment.itemName || payment.type}</p>
            <div className="vote-total"><span>{payment.quantity} {payment.type === "VOTE" ? "vote" : payment.type === "TICKET" ? "tiket" : "barang"} · {payment.orderId}</span><strong>{rupiah(payment.amount)}</strong></div>
            {status === "PENDING" && <small>Pembayaran sudah diterima gateway dan menunggu notifikasi. Jendela ini akan memperbarui status secara otomatis.</small>}
            {isSettled && payment.type === "VOTE" && <div className="form-alert" role="status">{payment.quantity} vote telah dibayar dan akan tercatat pada peserta pilihan Anda.</div>}
            {isSettled && payment.type === "TICKET" && <>
              <div className="form-alert" role="status">{payment.tickets?.length || payment.quantity} tiket berhasil diterbitkan.</div>
              {payment.tickets?.map((ticket) => <div className="member-dashboard-row" key={ticket.code}><strong>{ticket.code}</strong><span>{ticket.status}</span><small>{formatDate(ticket.schedule.startsAt)}</small></div>)}
            </>}
            {isSettled && payment.type === "MERCH" && <div className="form-alert" role="status">Pesanan berhasil dibayar. {payment.adminContactPhone ? <>Hubungi admin untuk konfirmasi pengiriman: <strong>{payment.adminContactPhone}</strong></> : "Hubungi admin melalui WhatsApp untuk konfirmasi pengiriman."}</div>}
            {!isSettled && status !== "PENDING" && <p>Transaksi tidak berhasil. Anda dapat memulai pembayaran baru dari katalog atau halaman event.</p>}
          </>}
      {!payment || error || status === "PENDING" ? <button className="button button-outline" type="button" onClick={onRetry}>Periksa status lagi</button> : null}
      {!payment && <button className="text-link" type="button" onClick={onSignIn}>Masuk untuk melihat transaksi</button>}
      <button className="button button-primary" type="button" onClick={close}>{isSettled ? "Selesai" : "Tutup"}</button>
    </section>
  </div>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div><Icon size={22} /></div><h3>{title}</h3><p>{text}</p></div>;
}

function Footer({ onNavigate }) {
  return <footer className="site-footer"><div className="section-wrap footer-main"><div className="footer-brand"><button className="brand" type="button" onClick={() => onNavigate("home")}><img src="/logo.svg" alt="" /><span>rekap<span className="brand-light">baris</span><small>.com</small></span></button><p>Solusi digital untuk energi event yang menyatukan.</p><a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={17} /></a></div><div className="footer-column"><span>JELAJAHI</span>{navigation.slice(1, 5).map(({ id, label }) => <button key={id} onClick={() => onNavigate(id)} type="button">{label}</button>)}</div><div className="footer-column"><span>PLATFORM</span><button onClick={() => onNavigate("about")} type="button">Tentang kami</button><button onClick={() => onNavigate("events")} type="button">Untuk komunitas</button><button onClick={() => onNavigate("about")} type="button">Pusat bantuan</button></div><div className="footer-note"><span className="eyebrow">MOMEN BESAR DIMULAI DI SINI</span><p>Rancang pengalaman event yang bermakna.</p><button className="text-link" onClick={() => onNavigate("events")} type="button">Mulai menjelajah <ArrowRight size={14} /></button></div></div><div className="section-wrap footer-bottom"><span>© {new Date().getFullYear()} Rekap Baris. Dibuat untuk kebersamaan.</span><span>Privasi · Ketentuan · Bantuan</span></div></footer>;
}

export default App;
