import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'docuarch',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});
const SECRET = process.env.JWT_SECRET || 'change-me';

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  });

// Checks the login token. Pass roles to limit who can use a route.
const auth = (...roles) => (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'Please log in' });
  }
  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have access to this' });
  }
  next();
};

const signIn = (u) => {
  const user = { id: u.id, name: u.name, role: u.role };
  return { token: jwt.sign(user, SECRET, { expiresIn: '8h' }), user };
};

/* ---------- Accounts ---------- */

app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body;
  const [[u]] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  if (!u || !bcrypt.compareSync(password || '', u.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  res.json(signIn(u));
}));

// Self-registration always creates a requesting user
app.post('/api/register', wrap(async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || (password || '').length < 6) {
    return res.status(400).json({ error: 'Enter a name, a username and a password of 6+ characters' });
  }
  try {
    await pool.query(
      'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, "requester")',
      [name, username, bcrypt.hashSync(password, 10)]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'That username is taken' });
    throw e;
  }
}));

app.get('/api/users', auth('admin'), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, username, role, created_at FROM users ORDER BY id');
  res.json(rows);
}));

app.post('/api/users', auth('admin'), wrap(async (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || (password || '').length < 6 || !['admin', 'staff', 'requester'].includes(role)) {
    return res.status(400).json({ error: 'Fill in every field. Password needs 6+ characters' });
  }
  try {
    await pool.query(
      'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, username, bcrypt.hashSync(password, 10), role]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'That username is taken' });
    throw e;
  }
}));

/* ---------- Documents ---------- */

app.get('/api/types', auth(), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM document_types ORDER BY id');
  res.json(rows);
}));

app.get('/api/documents', auth(), wrap(async (req, res) => {
  const { q, type, from, to } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(d.doc_number LIKE ? OR d.title LIKE ? OR d.sender LIKE ? OR d.recipient LIKE ?)');
    params.push(...Array(4).fill(`%${q}%`));
  }
  if (type) { where.push('d.type_id = ?'); params.push(type); }
  if (from) { where.push('d.doc_date >= ?'); params.push(from); }
  if (to) { where.push('d.doc_date <= ?'); params.push(to); }
  const [rows] = await pool.query(
    `SELECT d.*, t.name AS type_name, t.prefix
     FROM documents d JOIN document_types t ON t.id = d.type_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY d.doc_date DESC, d.id DESC LIMIT 200`,
    params
  );
  res.json(rows);
}));

// Archive a document. The number comes from the counter for that type and year.
app.post('/api/documents', auth('admin', 'staff'), wrap(async (req, res) => {
  const { type_id, title, sender, recipient, doc_date, notes } = req.body;
  if (!type_id || !title || !doc_date) {
    return res.status(400).json({ error: 'Type, title and date are required' });
  }
  const [[type]] = await pool.query('SELECT * FROM document_types WHERE id = ?', [type_id]);
  if (!type) return res.status(400).json({ error: 'Only Letter, Clearance Form and Report are accepted' });

  const year = Number(String(doc_date).slice(0, 4));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO doc_counters (type_id, doc_year, last_no) VALUES (?, ?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)`,
      [type.id, year]
    );
    const [[{ n }]] = await conn.query('SELECT LAST_INSERT_ID() AS n');
    const number = `${type.prefix}-${year}-${String(n).padStart(4, '0')}`;
    const [r] = await conn.query(
      `INSERT INTO documents (type_id, doc_number, title, sender, recipient, doc_date, notes, archived_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [type.id, number, title, sender || null, recipient || null, doc_date, notes || null, req.user.id]
    );
    await conn.query(
      'INSERT INTO archive_history (document_id, user_id, action) VALUES (?, ?, "archived")',
      [r.insertId, req.user.id]
    );
    await conn.commit();
    res.status(201).json({ id: r.insertId, doc_number: number });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// Opening a document counts as retrieving it, so it is logged in the history
app.get('/api/documents/:id', auth(), wrap(async (req, res) => {
  const [[doc]] = await pool.query(
    `SELECT d.*, t.name AS type_name, t.prefix, u.name AS archived_by_name
     FROM documents d
     JOIN document_types t ON t.id = d.type_id
     JOIN users u ON u.id = d.archived_by
     WHERE d.id = ?`,
    [req.params.id]
  );
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  await pool.query(
    'INSERT INTO archive_history (document_id, user_id, action) VALUES (?, ?, "retrieved")',
    [doc.id, req.user.id]
  );
  const [history] = await pool.query(
    `SELECT h.action, h.created_at, u.name AS user_name
     FROM archive_history h JOIN users u ON u.id = h.user_id
     WHERE h.document_id = ? ORDER BY h.id DESC`,
    [doc.id]
  );
  res.json({ ...doc, history });
}));

// Type, date and number stay fixed so the numbering series is never disturbed
app.put('/api/documents/:id', auth('admin', 'staff'), wrap(async (req, res) => {
  const { title, sender, recipient, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const [r] = await pool.query(
    'UPDATE documents SET title = ?, sender = ?, recipient = ?, notes = ? WHERE id = ?',
    [title, sender || null, recipient || null, notes || null, req.params.id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Document not found' });
  await pool.query(
    'INSERT INTO archive_history (document_id, user_id, action) VALUES (?, ?, "updated")',
    [req.params.id, req.user.id]
  );
  res.json({ ok: true });
}));

/* ---------- Dashboard and reports ---------- */

app.get('/api/reports', auth(), wrap(async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let on = '';
  if (from) { on += ' AND d.doc_date >= ?'; params.push(from); }
  if (to) { on += ' AND d.doc_date <= ?'; params.push(to); }
  const [byType] = await pool.query(
    `SELECT t.id, t.name, t.prefix, COUNT(d.id) AS total
     FROM document_types t LEFT JOIN documents d ON d.type_id = t.id${on}
     GROUP BY t.id ORDER BY t.id`,
    params
  );
  const [recent] = await pool.query(
    `SELECT h.action, h.created_at, u.name AS user_name, d.doc_number, d.title
     FROM archive_history h
     JOIN users u ON u.id = h.user_id
     JOIN documents d ON d.id = h.document_id
     ORDER BY h.id DESC LIMIT 8`
  );
  res.json({ byType, recent });
}));

/* ---------- Start ---------- */

async function ensureAdmin() {
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (c === 0) {
    await pool.query(
      'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, "admin")',
      ['Administrator', 'admin', bcrypt.hashSync('admin123', 10)]
    );
    console.log('Created first account -> username: admin  password: admin123 (change this)');
  }
}

const port = process.env.PORT || 5000;
ensureAdmin()
  .then(() => app.listen(port, () => console.log(`DOCUARCH API running on http://localhost:${port}`)))
  .catch((e) => {
    console.error('Could not start. Check your MySQL settings in backend/.env and that schema.sql was imported.\n', e.message);
    process.exit(1);
  });
