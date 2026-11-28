import { useId, useState } from "react";
import { supabase } from "../lib/supabase";

// Email + password sign-in (and Create account). Used in the navbar (pop-up and phone menu) and on the Team page.
export default function SignInForm({ onDone, className = "" }: { onDone?: () => void; className?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function auth(kind: "in" | "up") {
    if (!supabase || busy) return;
    if (!email.trim() || pass.length < 6) { setMsg("Enter an email and a password of 6+ characters."); return; }
    setBusy(true);
    const creds = { email: email.trim(), password: pass };
    const { data, error } = kind === "up" ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    if (kind === "up" && !data.session) { setMsg("Account created. Check your email to confirm, then sign in."); return; }
    setPass(""); setMsg(""); onDone?.();
  }

  return (
    <form className={`tn-signin ${className}`} onSubmit={(e) => { e.preventDefault(); void auth("in"); }}>
      <label className="tn-sr" htmlFor={`${id}-email`}>Email</label>
      <input id={`${id}-email`} type="email" inputMode="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" />
      <label className="tn-sr" htmlFor={`${id}-pass`}>Password</label>
      <input id={`${id}-pass`} type="password" placeholder="Password (6+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
      <div className="tn-signin-acts">
        <button type="submit" className="pri" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" disabled={busy} onClick={() => void auth("up")}>Create account</button>
      </div>
      {msg && <p className="tn-msg" role="alert">{msg}</p>}
    </form>
  );
}
