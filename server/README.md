# Backend Setup

1. Install PostgreSQL locally.
2. Create database `b2b_market`.
3. Copy `.env.example` to `.env` and set your credentials.
   You can optionally tune password hashing cost with `BCRYPT_SALT_ROUNDS` (default `10`).
4. Run SQL from `server/sql/schema.sql`.
5. Run SQL from `server/sql/seed.sql`.
6. Optionally run `server/sql/demo-legal-entities.sql` to add five approved demo profiles of real legal entities.
7. Start backend with `npm.cmd run server`.

API endpoints:

- `GET /api/health`
- `GET /api/orders`
- `GET /api/companies`
- `GET /api/suppliers`
- `GET /api/companies/:id/verification` (owner or admin)
- `POST /api/companies/:id/verification/request` (owner)
- `GET /api/admin/verifications?status=pending|all` (admin)
- `POST /api/admin/companies/:id/verification` (admin)
- `POST /api/dadata/party` (authenticated)

## Verification and DaData

- `DADATA_API_KEY` is optional and must stay on the server. Without it the API returns `{ available: false, reason: "not_configured" }`, and manual INN input keeps working.
- Only the INN is sent to DaData. Sanitized responses are cached in memory (found 24 h, not found 1 h, max 500 entries). The API never returns managers, founders, contacts, employees or financial data.
- 12-digit INNs (sole traders) are not sent to DaData: the API answers `{ available: false, reason: "individual" }` and the UI suggests manual input. Do not store real names or addresses of individuals: use synthetic test data only (152-ФЗ).
- Request rate limits: verification requests 5/hour per user, DaData lookups 10/minute per user.
- Rejection reasons are visible only to the company owner and platform admins.

## Demo data

- `seed.sql` contains fictional companies. The `cmp-13`…`cmp-15` records are explicitly marked test data with synthetic INNs; `cmp-1`…`cmp-12` have no INN and no verification.
- `demo-legal-entities.sql` adds public profiles of real legal entities with real INN/OGRN from open sources. These profiles are demonstration-only, are not affiliated with the platform and have no reviews or ratings.
- `demo-verification.sql` only updates the test companies `cmp-13`…`cmp-15` to demonstrate verification statuses. Never run it against production data.



