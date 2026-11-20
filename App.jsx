import { useEffect, useState } from 'react';
import { api, session } from './api.js';

const ROLE_LABEL = { admin: 'Administrator', staff: 'Office Personnel', requester: 'Requesting User' };
const today = () => new Date().toISOString().slice(0, 10);
const query = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v)).toString();

function DocNumber({ prefix, children }) {
  return <span className={`num ${prefix}`}>{children}</span>;
}

/* ---------- Login and registration ---------- */

function Login({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', username: '', password: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      if (mode === 'register') await api('/register', { method: 'POST', body: f });
      const r = await api('/login', { method: 'POST', body: { username: f.username, password: f.password } });
      session.save(r.token, r.user);
      onAuth(r.user);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div className="login">
      <h1>DOCUARCH</h1>
      <p className="muted">Document Archiving System for Letters, Clearance Forms, and Reports</p>
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Log in' : 'Create an account'}</h2>
        {mode === 'register' && (
          <label>Full name<input value={f.name} onChange={set('name')} required /></label>
        )}
        <label>Username<input value={f.username} onChange={set('username')} required /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} required /></label>
        <button className="btn">{mode === 'login' ? 'Log in' : 'Create account'}</button>
        {err && <p className="error" role="alert">{err}</p>}
        <p>
          <button type="button" className="link" onClick={() => { setErr(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'Need to request documents? Create an account' : 'Back to log in'}
          </button>
        </p>
      </form>
    </div>
  );
}

/* ---------- Dashboard and reports ---------- */

function Dashboard() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/reports?' + query(range)).then(setData).catch(() => setData({ byType: [], recent: [] }));
  }, [range]);

  const grand = data ? data.byType.reduce((s, t) => s + t.total, 0) : 0;

  return (
    <>
      <div className="head">
        <h1>Dashboard</h1>
        <button className="btn ghost" onClick={() => window.print()}>Print report</button>
      </div>
      <div className="filters">
        <label className="muted">From <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="muted">To <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      </div>
      {!data ? <p className="muted">Loading…</p> : (
        <>
          <div className="totals">
            {data.byType.map((t) => (
              <div key={t.id} className={`total ${t.prefix}`}>
                <strong>{t.total}</strong>{t.name}s archived
              </div>
            ))}
          </div>
          <p className="muted">{grand} document{grand === 1 ? '' : 's'} in this date range.</p>
          <div className="card no-print">
            <h2>Recent activity</h2>
            {data.recent.length === 0 ? <p className="muted">No activity yet. Archive your first document.</p> : (
              <ul className="log">
                {data.recent.map((r, i) => (
                  <li key={i}>
                    {r.user_name} {r.action} <b>{r.doc_number}</b> {r.title}
                    <div className="muted">{r.created_at}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}

/* ---------- Archive: form, detail, list ---------- */

function DocForm({ types, doc, onClose, onSaved }) {
  const editing = !!doc;
  const [f, setF] = useState({
    type_id: doc?.type_id || types[0]?.id || '',
    doc_date: doc?.doc_date || today(),
    title: doc?.title || '',
    sender: doc?.sender || '',
    recipient: doc?.recipient || '',
    notes: doc?.notes || '',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      if (editing) await api('/documents/' + doc.id, { method: 'PUT', body: f });
      else await api('/documents', { method: 'POST', body: f });
      onSaved();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="row">
          <h2>{editing ? `Edit ${doc.doc_number}` : 'Archive a document'}</h2>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </div>
        <label>Document type
          <select value={f.type_id} onChange={set('type_id')} disabled={editing}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>Document date
          <input type="date" value={f.doc_date} onChange={set('doc_date')} disabled={editing} required />
        </label>
        <p className="muted">
          {editing ? 'Type, date and number cannot be changed.' : 'The document number is assigned automatically for the type you pick.'}
        </p>
        <label>Title<input value={f.title} onChange={set('title')} required /></label>
        <label>Sender<input value={f.sender} onChange={set('sender')} /></label>
        <label>Recipient<input value={f.recipient} onChange={set('recipient')} /></label>
        <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
        <div className="actions">
          <button className="btn">{editing ? 'Save changes' : 'Archive document'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
        {err && <p className="error" role="alert">{err}</p>}
      </form>
    </div>
  );
}

function Detail({ id, canEdit, onClose, onEdit }) {
  const [doc, setDoc] = useState(null);
  useEffect(() => { api('/documents/' + id).then(setDoc); }, [id]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        {!doc ? <p className="muted">Loading…</p> : (
          <>
            <div className="row">
              <DocNumber prefix={doc.prefix}>{doc.doc_number}</DocNumber>
              <button className="link" onClick={onClose}>Close</button>
            </div>
            <h2>{doc.title}</h2>
            <dl>
              <dt>Type</dt><dd>{doc.type_name}</dd>
              <dt>Date</dt><dd>{doc.doc_date}</dd>
              <dt>Sender</dt><dd>{doc.sender || '—'}</dd>
              <dt>Recipient</dt><dd>{doc.recipient || '—'}</dd>
              <dt>Notes</dt><dd>{doc.notes || '—'}</dd>
              <dt>Archived by</dt><dd>{doc.archived_by_name}</dd>
            </dl>
            {canEdit && <button className="btn" onClick={() => onEdit(doc)}>Edit details</button>}
            <h3 style={{ marginTop: 24 }}>Archive history</h3>
            <ul className="log">
              {doc.history.map((h, i) => (
                <li key={i}>{h.user_name} {h.action}<div className="muted">{h.created_at}</div></li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Archive({ user }) {
  const canEdit = user.role === 'admin' || user.role === 'staff';
  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({ q: '', type: '', from: '', to: '' });
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null); // null = closed, {} = new, doc = edit
  const [tick, setTick] = useState(0);

  useEffect(() => { api('/types').then(setTypes); }, []);
  useEffect(() => {
    const t = setTimeout(() => api('/documents?' + query(filters)).then(setDocs), 200);
    return () => clearTimeout(t);
  }, [filters, tick]);

  const setF = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <div className="head">
        <h1>Archive</h1>
        {canEdit && types.length > 0 && <button className="btn" onClick={() => setForm({})}>Archive a document</button>}
      </div>
      <div className="filters">
        <input type="search" placeholder="Search number, title, sender, recipient" value={filters.q} onChange={setF('q')} aria-label="Search documents" />
        <select value={filters.type} onChange={setF('type')} aria-label="Document type">
          <option value="">All types</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={setF('from')} aria-label="From date" />
        <input type="date" value={filters.to} onChange={setF('to')} aria-label="To date" />
      </div>
      <div className="tablewrap">
        {docs.length === 0 ? (
          <div className="empty">No documents match. Try a different search or clear the filters.</div>
        ) : (
          <table>
            <thead><tr><th>Number</th><th>Type</th><th>Title</th><th>Sender</th><th>Date</th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="click" onClick={() => setOpenId(d.id)}>
                  <td><DocNumber prefix={d.prefix}>{d.doc_number}</DocNumber></td>
                  <td>{d.type_name}</td>
                  <td>{d.title}</td>
                  <td>{d.sender || '—'}</td>
                  <td>{d.doc_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openId && !form && (
        <Detail id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} onEdit={(d) => setForm(d)} />
      )}
      {form && (
        <DocForm
          types={types}
          doc={form.id ? form : null}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); setOpenId(null); setTick(tick + 1); }}
        />
      )}
    </>
  );
}

/* ---------- Users (administrator only) ---------- */

function Users() {
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ name: '', username: '', password: '', role: 'staff' });
  const [err, setErr] = useState('');
  const load = () => api('/users').then(setUsers);
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function add(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/users', { method: 'POST', body: f });
      setF({ name: '', username: '', password: '', role: 'staff' });
      load();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <>
      <h1 style={{ marginBottom: 16 }}>Users</h1>
      <form className="card" onSubmit={add} style={{ marginBottom: 20 }}>
        <h2>Add a user</h2>
        <label>Full name<input value={f.name} onChange={set('name')} required /></label>
        <label>Username<input value={f.username} onChange={set('username')} required /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} required /></label>
        <label>Role
          <select value={f.role} onChange={set('role')}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="btn">Add user</button>
        {err && <p className="error" role="alert">{err}</p>}
      </form>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}><td>{u.name}</td><td>{u.username}</td><td>{ROLE_LABEL[u.role]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- App shell ---------- */

export default function App() {
  const [user, setUser] = useState(session.user);
  const [page, setPage] = useState('dashboard');

  if (!user) return <Login onAuth={setUser} />;

  const pages = [['dashboard', 'Dashboard'], ['archive', 'Archive']];
  if (user.role === 'admin') pages.push(['users', 'Users']);

  return (
    <>
      <header className="topbar">
        <span className="brand">DOCUARCH</span>
        <nav>
          {pages.map(([k, label]) => (
            <button key={k} className={page === k ? 'on' : ''} onClick={() => setPage(k)}>{label}</button>
          ))}
        </nav>
        <span className="who">
          {user.name} ({ROLE_LABEL[user.role]})
          <button className="link" onClick={() => { session.clear(); setUser(null); }}>Log out</button>
        </span>
      </header>
      <main>
        {page === 'dashboard' && <Dashboard />}
        {page === 'archive' && <Archive user={user} />}
        {page === 'users' && user.role === 'admin' && <Users />}
      </main>
    </>
  );
}
