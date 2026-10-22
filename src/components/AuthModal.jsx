import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Flag, ShieldCheck, UserRound, X } from "lucide-react";

const roles = [
  { id: "PARTICIPANT", label: "Peserta", icon: UserRound },
  { id: "ORGANIZER", label: "Penyelenggara", icon: Flag },
];

export default function AuthModal({ mode, setMode, close, error, resetToken, onCredentialAuth }) {
  const [role, setRole] = useState("PARTICIPANT");
  const [institution, setInstitution] = useState("");
  const [eventName, setEventName] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close]);

  const continueWithGoogle = () => {
    setFormError("");
    window.location.assign("/api/auth/google");
  };

  const submitWithPassword = async (event) => {
    event.preventDefault();
    setFormError("");
    if (["register", "reset-password"].includes(mode) &&
        !/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,128}$/.test(password)) {
      setFormError("Password minimal 8 karakter dan harus mengandung huruf, angka, serta simbol.");
      return;
    }
    if (mode === "reset-password" && password !== confirmPassword) {
      setFormError("Konfirmasi password tidak sama.");
      return;
    }
    setSubmitting(true);
    try {
      const credentials = mode === "forgot-password"
        ? { phone: phone.trim() }
        : mode === "reset-password"
          ? { token: resetToken, password }
          : {
            ...(mode === "register" ? {
          name: name.trim(),
          role,
          phone: phone.trim(),
          ...(institution.trim() ? { institution: institution.trim() } : {}),
          ...(eventName.trim() ? { eventName: eventName.trim() } : {})
        } : {}),
        [mode === "login" ? "identifier" : "email"]: email.trim(),
        password
          };
      await onCredentialAuth(mode, credentials);
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setFormError("");
    setPassword("");
    setConfirmPassword("");
    setMode(mode === "register" ? "login" : "register");
  };

  const title = mode === "register" ? "Mulai baris yang baru."
    : mode === "forgot-password" ? "Lupa password?"
      : mode === "reset-password" ? "Buat password baru."
        : "Senang melihatmu lagi.";
  const passwordFieldLabel = mode === "reset-password" ? "Password baru" : "Password";
  const passwordHelp = "Minimal 8 karakter, dengan huruf, angka, dan simbol.";

  return <div className="modal-backdrop auth-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) close();
  }}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading">
      <button className="modal-close" onClick={close} type="button" aria-label="Tutup"><X size={19} /></button>
      <div className="auth-art">
        <div className="auth-brand"><img src="/logo.svg" alt="" /><span>rekap<span>baris</span></span></div>
        <img className="auth-watermark" src="/logo.svg" alt="" aria-hidden="true" />
        <div className="auth-art-copy"><span className="eyebrow">RUANG UNTUK SEMUA BARIS</span><h2>Yang penting,<br /><em>bergerak bersama.</em></h2><p>Satu platform untuk menyatukan energi di setiap event.</p></div>
        <div className="auth-art-footer"><ShieldCheck size={15} /> Login aman dengan email atau Google</div>
      </div>
      <div className="auth-panel">
        <div className="auth-heading">
          <span className="eyebrow">REKAP BARIS / AKUN</span>
          <h2 id="auth-heading">{title}</h2>
          <p>{mode === "register" ? "Lengkapi data sesuai peran, atau buat akun peserta melalui Google."
            : mode === "forgot-password" ? "Masukkan nomor WhatsApp yang terdaftar di akun Anda."
              : mode === "reset-password" ? "Tautan reset berlaku selama 60 menit."
                : "Masuk dengan email, nomor HP, atau username Admin/Tim Rekap."}</p>
        </div>
        {(formError || error) && <div className="form-alert form-alert-error" role="alert">{formError || error}</div>}
        <form className="auth-form" onSubmit={submitWithPassword}>
          {mode === "register" && <>
            <div className="role-picker">
              <span>Daftar sebagai</span>
              <div>{roles.map(({ id, label, icon: Icon }) => <button type="button" onClick={() => setRole(id)} className={role === id ? "is-active" : ""} key={id}><Icon size={17} />{label}</button>)}</div>
            </div>
            <label className="auth-field">Nama lengkap<input autoComplete="name" maxLength="120" minLength="2" onChange={(event) => setName(event.target.value)} required value={name} /></label>
            <label className="auth-field">Nomor HP<input autoComplete="tel" maxLength="30" onChange={(event) => setPhone(event.target.value)} pattern="[+0-9 ()-]{8,30}" required title="Gunakan 8–15 digit nomor telepon." type="tel" value={phone} /></label>
            <small className="field-caption">Gunakan nomor WhatsApp aktif; format internasional disarankan, contoh +62812...</small>
            {role !== "JUDGE" && <label className="auth-field">Asal satuan<input autoComplete="organization" maxLength="120" onChange={(event) => setInstitution(event.target.value)} required value={institution} /></label>}
            {role === "ORGANIZER" && <label className="auth-field">Nama event<input maxLength="150" onChange={(event) => setEventName(event.target.value)} required value={eventName} /></label>}
          </>}
          {(mode === "login" || mode === "register") && <label className="auth-field">
            {mode === "login" ? "Email, nomor HP, atau username staf" : "Email"}
            <input autoComplete={mode === "login" ? "username" : "email"} maxLength="254" onChange={(event) => setEmail(event.target.value)} required type={mode === "login" ? "text" : "email"} value={email} />
          </label>}
          {mode === "forgot-password" && <label className="auth-field">Nomor WhatsApp terdaftar
            <input autoComplete="tel" maxLength="30" onChange={(event) => setPhone(event.target.value)} pattern="[+0-9 ()-]{8,30}" required title="Gunakan nomor HP terdaftar, idealnya dengan kode negara (contoh +62812...)." type="tel" value={phone} />
          </label>}
          {(mode === "login" || mode === "register" || mode === "reset-password") && <>
            <label className="auth-field">{passwordFieldLabel}
              <span className="password-input-wrap"><input autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength="128" minLength={mode === "login" ? undefined : "8"} onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} /><button className="password-visibility" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </label>
            {(mode === "register" || mode === "reset-password") && <small className="field-caption">{passwordHelp}</small>}
            {mode === "reset-password" && <label className="auth-field">Konfirmasi password<span className="password-input-wrap"><input autoComplete="new-password" maxLength="128" onChange={(event) => setConfirmPassword(event.target.value)} required type={showConfirmPassword ? "text" : "password"} value={confirmPassword} /><button className="password-visibility" type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Sembunyikan konfirmasi password" : "Tampilkan konfirmasi password"} aria-pressed={showConfirmPassword}>{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
          </>}
          <button className="button button-primary auth-submit" disabled={submitting} type="submit">
            {submitting ? "Memproses..." : mode === "register" ? "Daftar" : mode === "forgot-password" ? "Kirim link via WhatsApp" : mode === "reset-password" ? "Simpan password" : "Masuk"}<ArrowRight size={16} />
          </button>
          {(mode === "login" || mode === "register") && <>
            {mode === "login" && <>
            {mode === "login" && <p className="auth-switch"><button type="button" onClick={() => { setFormError(""); setMode("forgot-password"); }}>Lupa password?</button></p>}
            <div className="auth-divider"><span>atau</span></div>
            </>}
            {mode === "register" && <div className="auth-divider"><span>atau</span></div>}
            <button className="button button-primary auth-submit google-submit" disabled={submitting} onClick={continueWithGoogle} type="button">
              <span className="google-mark" aria-hidden="true">G</span>{mode === "register" ? "Daftar dengan Google sebagai peserta" : "Masuk dengan Google"}<ArrowRight size={16} />
            </button>
          </>}
          {mode === "register" && <p className="auth-consent">Akun baru menunggu persetujuan Admin/Tim Rekap.</p>}
          {mode !== "reset-password" && <p className="auth-switch">
            {mode === "register" ? "Sudah punya akun?" : mode === "login" ? "Belum punya akun?" : "Ingat password?"}{" "}
            <button type="button" onClick={() => mode === "register" ? switchMode() : setMode("login")}>{mode === "register" ? "Masuk" : "Kembali ke masuk"}</button>
          </p>}
        </form>
      </div>
    </section>
  </div>;
}
