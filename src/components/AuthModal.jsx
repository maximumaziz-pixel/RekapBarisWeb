import { useEffect, useState } from "react";
import { ArrowRight, Flag, ShieldCheck, Trophy, UserRound, X } from "lucide-react";

const roles = [
  { id: "PARTICIPANT", label: "Peserta", icon: UserRound },
  { id: "ORGANIZER", label: "Penyelenggara", icon: Flag },
  { id: "JUDGE", label: "Juri", icon: Trophy }
];

export default function AuthModal({ mode, setMode, close, error }) {
  const [role, setRole] = useState("PARTICIPANT");
  const [institution, setInstitution] = useState("");
  const [eventName, setEventName] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close]);

  const continueWithGoogle = (event) => {
    event.preventDefault();
    const query = new URLSearchParams(mode === "register" ? { role } : {});
    if (mode === "register" && role === "ORGANIZER") {
      if (!institution.trim() || !eventName.trim()) return;
      query.set("institution", institution.trim());
      query.set("eventName", eventName.trim());
    }
    window.location.assign(`/api/auth/google?${query}`);
  };

  return <div className="modal-backdrop auth-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) close();
  }}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading">
      <button className="modal-close" onClick={close} type="button" aria-label="Tutup"><X size={19} /></button>
      <div className="auth-art">
        <div className="auth-brand"><img src="/logo.svg" alt="" /><span>rekap<span>baris</span></span></div>
        <img className="auth-watermark" src="/logo.svg" alt="" aria-hidden="true" />
        <div className="auth-art-copy"><span className="eyebrow">RUANG UNTUK SEMUA BARIS</span><h2>Yang penting,<br /><em>bergerak bersama.</em></h2><p>Satu platform untuk menyatukan energi di setiap event.</p></div>
        <div className="auth-art-footer"><ShieldCheck size={15} /> Login aman dengan Google</div>
      </div>
      <div className="auth-panel">
        <div className="auth-heading">
          <span className="eyebrow">REKAP BARIS / AKUN</span>
          <h2 id="auth-heading">{mode === "register" ? "Mulai baris yang baru." : "Senang melihatmu lagi."}</h2>
          <p>{mode === "register" ? "Buat akun atau masuk menggunakan akun Google." : "Masuk atau daftar dengan satu akun Google."}</p>
        </div>
        {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}
        <form className="auth-form" onSubmit={continueWithGoogle}>
          {mode === "register" && <>
            <div className="role-picker">
              <span>Daftar sebagai</span>
              <div>{roles.map(({ id, label, icon: Icon }) => <button type="button" onClick={() => setRole(id)} className={role === id ? "is-active" : ""} key={id}><Icon size={17} />{label}</button>)}</div>
            </div>
            {role === "ORGANIZER" && <div className="organizer-fields">
              <label>Sekolah / institusi<input required maxLength="120" value={institution} onChange={(event) => setInstitution(event.target.value)} /></label>
              <label>Nama event<input required maxLength="150" value={eventName} onChange={(event) => setEventName(event.target.value)} /></label>
            </div>}
          </>}
          <button className="button button-primary auth-submit google-submit" type="submit">
            <span className="google-mark" aria-hidden="true">G</span>Lanjutkan dengan Google<ArrowRight size={16} />
          </button>
          <p className="auth-consent">Email Google terverifikasi digunakan untuk akun. Pendaftaran baru menunggu persetujuan Admin/Tim Rekap.</p>
          <p className="auth-switch">
            {mode === "register" ? "Sudah memiliki akun?" : "Belum memiliki akun?"}{" "}
            <button type="button" onClick={() => setMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "Masuk" : "Daftar"}</button>
          </p>
        </form>
      </div>
    </section>
  </div>;
}