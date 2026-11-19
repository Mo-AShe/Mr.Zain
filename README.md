# MR. ZAIN — Egyptian Clothing E-Commerce Platform

A full-stack e-commerce platform for **MR. ZAIN**, an Egyptian clothing brand offering contemporary menswear, womenswear, and traditional-inspired Egyptian cotton collections.

## Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (`frontend/`)
- **Backend:** Python, FastAPI (`backend/`)
- **Database:** PostgreSQL (`database/`)
- **Documentation:** Architecture, API specs, and ERD (`docs/`)

## Project Structure

```text
.
├── README.md
├── .gitignore
├── frontend/               # Pure HTML5, CSS3 & Vanilla JS (Customer Storefront + Admin Portal)
│   ├── index.html
│   ├── pages/              # Customer-facing pages (shop, product, cart, checkout, auth, account)
│   ├── admin/              # Admin dashboard & management pages
│   ├── css/                # Modular stylesheets & design tokens
│   ├── js/                 # Config, API client, utilities, components, page controllers
│   └── assets/             # Brand logo, icons, and static imagery
├── backend/                # Pure Python FastAPI application
│   ├── requirements.txt
│   ├── .env.example
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py         # FastAPI application entrypoint
│   │   ├── core/           # Configuration, database session, security, dependencies
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   ├── api/            # Versioned REST API routes
│   │   └── services/       # Business logic & payment/shipping services
│   └── tests/              # Automated backend tests
├── database/               # PostgreSQL schemas, migrations, and seed data
│   ├── schema.sql
│   ├── migrations/
│   └── seeds/
└── docs/                   # System architecture, API specification, and database ERD
```

## Quick Start (Planned Setup)

### 1. Database (PostgreSQL)
1. Create a PostgreSQL database (e.g., `mr_zain_db`).
2. Apply migrations / baseline schema from `database/schema.sql` and seeds from `database/seeds/`.

### 2. Backend (FastAPI)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend (Static HTML/CSS/JS)
Serve the `frontend/` directory using any static file server (e.g., Live Server, `python -m http.server 5500`, or Nginx) and configure `API_BASE_URL` in `frontend/js/config.js`.
