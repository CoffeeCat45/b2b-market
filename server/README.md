# Backend Setup

1. Install PostgreSQL locally.
2. Create database `b2b_market`.
3. Copy `.env.example` to `.env` and set your credentials.
4. Run SQL from `server/sql/schema.sql`.
5. Run SQL from `server/sql/seed.sql`.
6. Start backend with `npm.cmd run server`.

API endpoints:

- `GET /api/health`
- `GET /api/orders`
- `GET /api/companies`
- `GET /api/suppliers`
