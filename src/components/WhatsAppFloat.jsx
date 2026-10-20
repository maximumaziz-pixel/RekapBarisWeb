import { useState } from "react";
import { X } from "lucide-react";

const adminPhone = (import.meta.env.VITE_ADMIN_WHATSAPP || "").replace(/\D/g, "");

export default function WhatsAppFloat() {
  const [open, setOpen] = useState(false);
  const chatUrl = adminPhone ? `https://wa.me/${adminPhone}?text=${encodeURIComponent("Halo Admin Rekap Baris, saya ingin bertanya.")}` : "";

  return <aside className="whatsapp-float" aria-label="Hubungi Admin Rekap Baris">
    {open && <section className="whatsapp-popover" aria-live="polite">
      <div className="whatsapp-popover-heading">
        <span className="whatsapp-icon"><WhatsAppIcon /></span>
        <div><strong>Butuh bantuan?</strong><small>Admin Rekap Baris siap membantu.</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Tutup chat"><X size={16} /></button>
      </div>
      {chatUrl
        ? <a className="whatsapp-chat-link" href={chatUrl} target="_blank" rel="noreferrer">Mulai chat WhatsApp</a>
        : <p className="whatsapp-config-hint">Atur VITE_ADMIN_WHATSAPP untuk mengaktifkan chat Admin.</p>}
    </section>}
    <button className={`whatsapp-float-button ${open ? "is-open" : ""}`} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Tutup chat WhatsApp" : "Buka chat WhatsApp"}>
      {open ? <X size={23} /> : <WhatsAppIcon />}
    </button>
  </aside>;
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M16.04 3C8.87 3 3.04 8.82 3.04 15.98c0 2.29.6 4.52 1.75 6.5L3 29l6.69-1.75a13 13 0 0 0 6.35 1.62h.01c7.16 0 13-5.82 13-12.98A12.92 12.92 0 0 0 16.04 3Zm.01 23.66h-.01a10.8 10.8 0 0 1-5.5-1.5l-.4-.24-3.97 1.04 1.06-3.86-.26-.4a10.72 10.72 0 0 1-1.65-5.72c0-5.92 4.82-10.74 10.74-10.74 2.87 0 5.57 1.12 7.6 3.15a10.67 10.67 0 0 1 3.14 7.6c0 5.92-4.82 10.74-10.75 10.74Zm5.9-8.04c-.32-.16-1.9-.94-2.2-1.05-.3-.1-.51-.16-.73.16-.21.32-.83 1.05-1.02 1.26-.19.21-.38.24-.7.08-.32-.16-1.36-.5-2.6-1.6-.96-.86-1.61-1.92-1.8-2.24-.19-.32-.02-.49.14-.65.14-.14.32-.38.48-.56.16-.19.21-.32.32-.54.1-.21.05-.4-.03-.56-.08-.16-.72-1.74-.99-2.38-.26-.62-.52-.54-.72-.55h-.62c-.21 0-.56.08-.86.4-.3.32-1.13 1.1-1.13 2.68s1.15 3.1 1.31 3.32c.16.21 2.26 3.45 5.48 4.84.77.33 1.37.53 1.84.68.77.25 1.47.21 2.02.13.62-.09 1.9-.78 2.17-1.53.27-.76.27-1.4.19-1.53-.08-.14-.29-.22-.61-.38Z" />
  </svg>;
}