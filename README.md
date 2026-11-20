# DOCUARCH: Document Archiving System

Final Project for ITPC 103

A web-based system built with ReactJS, Node.js, and MySQL that helps schools and offices archive, organize, and retrieve Letters, Clearance Forms, and Reports. Each document type has its own document numbering series, so the same number under different types is treated as a separate record.

## Group Members

- Aliandro M. Asilan
- Al-hussein Capinpin
- Cherry Anne C. Hangalay
- Mariz M. Perez
- Prinziela Tiblani

**Section:** BSIT 2B  
**Adviser:** John Fredrick Lim

## Features

- Account and login with role-based access (Administrator, Office Personnel, Requesting Users)
- Archive and manage Letters, Clearance Forms, and Reports
- Automatic document numbers per type (`LTR-2026-0001`, `CLR-2026-0001`, `RPT-2026-0001`)
- Search and filter by document number, type, title, sender, and date
- Archive history of who archived, updated, or retrieved each document
- Dashboard and reports per document type

## Document Numbering

A document is identified by its **document type and document number together**, so the same number can exist under different types without clashing.

| Document type  | Prefix | Sample number   |
| -------------- | ------ | --------------- |
| Letter         | LTR    | LTR-2026-0001   |
| Clearance Form | CLR    | CLR-2026-0001   |
| Report         | RPT    | RPT-2026-0001   |

## Requirements

- Node.js 18 or newer and npm
- MySQL 8 or MariaDB (for example, through XAMPP)

## Setup

1. Start MySQL (for example, through XAMPP).
2. Create the database and tables once (change `root` if your MySQL user is different):

```bash
mysql -u root -p < server/schema.sql
```

3. Copy `server/.env.example` to `server/.env` and set your MySQL username and password.
4. Install and start the server:

```bash
cd server
npm install
npm run dev
```

5. In a second terminal, install and start the website:

```bash
cd client
npm install
npm run dev
```

6. Open http://localhost:5173 and log in with the first account:
   - Username: `admin`
   - Password: `admin123`

   Change this password after your first login by adding a new administrator in **Users**.

## Scope

- Limited to three (3) document types: Letters, Clearance Forms, and Reports
- Does not physically store or deliver paper documents
- Requires an internet or network connection

## Platform and Tools

- **Platform:** Web development
- **Front end:** ReactJS
- **Back end:** Node.js and Express
- **Database:** MySQL
