import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function AuthForm({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    try {
      const data = await api(`/api/auth/${mode}`, { method: "POST", body: f });
      onAuth(data.token, data.user);
    } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h2>{mode === "login" ? "Sign in" : "Create account-holder profile"}</h2>
      {mode === "register" && <><label>Name<input value={f.name} onChange={set("name")} required /></label></>}
      <label>Email<input type="email" value={f.email} onChange={set("email")} required /></label>
      <label>Password (min 10 chars)<input type="password" value={f.password} onChange={set("password")} required /></label>
      {err && <p className="err">{err}</p>}
      <button type="submit">{mode === "login" ? "Sign in" : "Register"}</button>
      <button type="button" className="alt" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Need an account?" : "Have an account?"}
      </button>
    </form>
  );
}

function Holder({ token }) {
  const [accounts, setAccounts] = useState([]);
  const [type, setType] = useState("CHECKING");
  const [err, setErr] = useState("");
  const load = useCallback(() => api("/api/accounts", { token }).then((d) => setAccounts(d.accounts)).catch((e) => setErr(e.message)), [token]);
  useEffect(() => { load(); }, [load]);
  const apply = async () => {
    setErr("");
    try { await api("/api/accounts", { method: "POST", body: { type }, token }); load(); } catch (e) { setErr(e.message); }
  };
  return (
    <>
      <div className="card">
        <h3>Open an account (onboarding)</h3>
        <select value={type} onChange={(e) => setType(e.target.value)}><option>CHECKING</option><option>SAVINGS</option></select>
        <button onClick={apply}>Apply</button>
        {err && <p className="err">{err}</p>}
      </div>
      <div className="card">
        <h3>My accounts</h3>
        <table><thead><tr><th>Number</th><th>Type</th><th>Status</th><th>Balance</th></tr></thead>
          <tbody>{accounts.map((a) => <tr key={a.id}><td>{a.number}</td><td>{a.type}</td><td>{a.status}</td><td>{a.balance}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}

function Admin({ token }) {
  const [tab, setTab] = useState("accounts");
  const [data, setData] = useState({ accounts: [], users: [], logs: [] });
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const [a, u, l] = await Promise.all([
        api("/api/admin/accounts", { token }), api("/api/admin/users", { token }), api("/api/admin/audit", { token }),
      ]);
      setData({ accounts: a.accounts, users: u.users, logs: l.logs });
    } catch (e) { setErr(e.message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  const act = (path, method = "POST", body) => api(path, { method, body, token }).then(load).catch((e) => setErr(e.message));
  return (
    <div className="card">
      <div className="tabs">
        {["accounts", "users", "audit"].map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {err && <p className="err">{err}</p>}
      {tab === "accounts" && (
        <table><thead><tr><th>Owner</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>
          {data.accounts.map((a) => (
            <tr key={a.id}><td>{a.owner.email}</td><td>{a.type}</td><td>{a.status}</td>
              <td>{a.status === "PENDING" && <><button onClick={() => act(`/api/admin/accounts/${a.id}/approve`)}>Approve</button><button className="danger" onClick={() => act(`/api/admin/accounts/${a.id}/reject`)}>Reject</button></>}</td></tr>
          ))}</tbody></table>
      )}
      {tab === "users" && (
        <table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
          {data.users.map((u) => (
            <tr key={u.id}><td>{u.email}</td><td>{u.role}</td><td>{u.status}</td>
              <td><button className="alt" onClick={() => act(`/api/admin/users/${u.id}/status`, "PATCH", { status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}>{u.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button></td></tr>
          ))}</tbody></table>
      )}
      {tab === "audit" && (
        <table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>
          {data.logs.map((l) => <tr key={l.id}><td>{new Date(l.createdAt).toLocaleString()}</td><td>{l.actor?.email || "—"}</td><td>{l.action}</td><td>{l.target || ""}</td></tr>)}
        </tbody></table>
      )}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("bv_token"));
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!token) return setUser(null);
    api("/api/auth/me", { token }).then((d) => setUser(d.user)).catch(() => logout());
  }, [token]);
  const onAuth = (t, u) => { sessionStorage.setItem("bv_token", t); setToken(t); setUser(u); };
  const logout = () => { sessionStorage.removeItem("bv_token"); setToken(null); setUser(null); };
  return (
    <div className="wrap">
      <header><h1>BalanceVault <small>(demo · synthetic data)</small></h1>
        {user && <div>{user.email} · {user.role} <button className="alt" onClick={logout}>Log out</button></div>}</header>
      {!user ? <AuthForm onAuth={onAuth} /> : user.role === "ADMIN" ? <Admin token={token} /> : <Holder token={token} />}
    </div>
  );
}
