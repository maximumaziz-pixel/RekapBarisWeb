const events = [
  {
    title: "Festival Baris Nusantara 2026",
    category: "Festival",
    description: "Panggung kolaborasi pasukan baris-berbaris dari berbagai daerah. Saksikan penampilan terbaik dan dukung pasukan favoritmu.",
    venue: "GOR Amongrogo, Yogyakarta",
    startsAt: "2026-11-21T08:00:00+07:00",
    status: "available",
    price: 35000,
    popularity: 248
  },
  {
    title: "Lomba Ketangkasan Baris-Berbaris",
    category: "Kompetisi",
    description: "Ajang ketangkasan, disiplin, dan kekompakan pelajar tingkat nasional.",
    venue: "Stadion Pakansari, Bogor",
    startsAt: "2026-12-06T07:30:00+07:00",
    status: "available",
    price: 25000,
    popularity: 187
  },
  {
    title: "Parade Kreasi Pelajar",
    category: "Parade",
    description: "Parade kreasi penuh semangat dari sekolah dan komunitas pilihan.",
    venue: "Lapangan Gasibu, Bandung",
    startsAt: "2026-09-20T09:00:00+07:00",
    status: "completed",
    price: 20000,
    popularity: 402
  }
];

const products = [
  { name: "Kaos RekapBaris", description: "Kaos harian dengan semangat baris-berbaris.", price: 125000 },
  { name: "Tote Bag Disiplin", description: "Tas serbaguna untuk menemani aktivitas event.", price: 65000 },
  { name: "Topi RekapBaris", description: "Aksesori edisi RekapBaris untuk setiap momen.", price: 85000 }
];

const $ = (selector) => document.querySelector(selector);
const rupiah = (amount) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(amount);
const formatDate = (value, options = { dateStyle: "medium" }) =>
  new Intl.DateTimeFormat("id-ID", options).format(new Date(value));

function renderEvents() {
  const grid = $("#event-grid");
  const query = $("#event-search").value.trim().toLocaleLowerCase("id");
  const status = $("#event-status").value;
  const sort = $("#event-sort").value;
  const visibleEvents = events
    .filter((event) => status === "all" || event.status === status)
    .filter((event) => `${event.title} ${event.category} ${event.venue}`.toLocaleLowerCase("id").includes(query))
    .sort((a, b) => {
      if (sort === "newest") return new Date(b.startsAt) - new Date(a.startsAt);
      if (sort === "popular") return b.popularity - a.popularity;
      if (sort === "nearest") {
        const aDate = new Date(a.startsAt).getTime();
        const bDate = new Date(b.startsAt).getTime();
        const now = Date.now();
        const aUpcoming = aDate >= now;
        const bUpcoming = bDate >= now;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        return aUpcoming ? aDate - bDate : bDate - aDate;
      }
      return 0;
    });

  grid.innerHTML = visibleEvents.length
    ? visibleEvents.map((event) => `
      <article class="event-card">
        <div class="event-image event-image-${event.category.toLowerCase()}">
          <span class="event-tag">${event.category}</span>
          <span class="event-status ${event.status}">${event.status === "completed" ? "SELESAI" : "CONTOH"}</span>
          <span class="event-date">${formatDate(event.startsAt, { dateStyle: "long" }).toLocaleUpperCase("id")}</span>
        </div>
        <div class="event-body">
          <span class="event-category">${event.category}</span>
          <h3>${event.title}</h3>
          <div class="event-meta">⌖ ${event.venue}</div>
          <p class="event-description">${event.description}</p>
          <div class="event-action">
            <span class="event-price">Contoh harga tiket<br><strong>${rupiah(event.price)}</strong></span>
            <a class="text-button" href="mailto:halo@rekapbaris.com?subject=${encodeURIComponent(`Informasi ${event.title}`)}">Tanya info ↗</a>
          </div>
        </div>
      </article>`).join("")
    : '<div class="empty-card">Tidak ada event yang sesuai dengan pencarian.</div>';

  $("#event-count").textContent = `${visibleEvents.length} contoh event`;
}

function renderProducts() {
  $("#merch-grid").innerHTML = products.map((product, index) => `
    <article class="merch-card">
      <div class="merch-image merch-image-${index + 1}" aria-hidden="true"><span>RB</span></div>
      <div class="merch-card-content">
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="merch-buy-row">
          <strong>${rupiah(product.price)}</strong>
          <a class="button button-primary" href="mailto:halo@rekapbaris.com?subject=${encodeURIComponent(`Informasi ${product.name}`)}">Tanya info ↗</a>
        </div>
      </div>
    </article>`).join("");
}

const themeToggle = $("#theme-toggle");
const themeIcon = $("#theme-icon");
const mobileMenu = $("#mobile-menu");
const mobileNav = $("#mobile-nav");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

function setTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeIcon.textContent = isDark ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", isDark ? "Gunakan tema terang" : "Gunakan tema gelap");
  themeToggle.title = isDark ? "Gunakan tema terang" : "Gunakan tema gelap";
}

setTheme(prefersDark);
themeToggle.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  setTheme(isDark);
});

mobileMenu.addEventListener("click", () => {
  const isOpen = mobileNav.classList.toggle("open");
  mobileMenu.setAttribute("aria-expanded", String(isOpen));
  mobileMenu.setAttribute("aria-label", isOpen ? "Tutup menu" : "Buka menu");
});
mobileNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    mobileNav.classList.remove("open");
    mobileMenu.setAttribute("aria-expanded", "false");
    mobileMenu.setAttribute("aria-label", "Buka menu");
  }
});
$("#event-search").addEventListener("input", renderEvents);
$("#event-status").addEventListener("change", renderEvents);
$("#event-sort").addEventListener("change", renderEvents);

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    document.querySelectorAll(".desktop-nav .nav-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.nav === entry.target.id);
    });
  });
}, { rootMargin: "-25% 0px -65% 0px" });

document.querySelectorAll(".section-anchor[id]").forEach((section) => sectionObserver.observe(section));
renderEvents();
renderProducts();
