# MR. ZAIN — System Architecture

## Overview
MR. ZAIN follows a strict three-tier separation:

1. **Frontend (`frontend/`)**: Static HTML5, CSS3, and Vanilla JavaScript ES modules.
   - Customer storefront (`index.html`, `pages/`)
   - Admin management portal (`admin/`)
   - Communicates exclusively with the FastAPI REST API via `frontend/js/api.js`.

2. **Backend (`backend/`)**: Python FastAPI application.
   - `app/api/`: HTTP routes & request validation
   - `app/services/`: Business logic (inventory, Egyptian governorate shipping, COD/Paymob/Fawry)
   - `app/models/` & `app/schemas/`: SQLAlchemy ORM & Pydantic models

3. **Database (`database/`)**: PostgreSQL relational database, Alembic migrations, and SQL seed scripts.
