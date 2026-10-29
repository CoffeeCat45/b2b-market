CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  avatar_position_x INTEGER NOT NULL DEFAULT 50,
  avatar_position_y INTEGER NOT NULL DEFAULT 50,
  avatar_scale INTEGER NOT NULL DEFAULT 100,
  rating NUMERIC(2, 1) NOT NULL,
  description TEXT NOT NULL,
  about TEXT NOT NULL,
  specializations JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
  inn TEXT NOT NULL DEFAULT '',
  legal_name TEXT NOT NULL DEFAULT '',
  ogrn TEXT NOT NULL DEFAULT '',
  legal_address TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'none',
  verification_reason TEXT NOT NULL DEFAULT '',
  verification_requested_at TIMESTAMPTZ,
  verification_reviewed_at TIMESTAMPTZ,
  verification_reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS avatar_position_x INTEGER NOT NULL DEFAULT 50;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS avatar_position_y INTEGER NOT NULL DEFAULT 50;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS avatar_scale INTEGER NOT NULL DEFAULT 100;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS inn TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS legal_name TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ogrn TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS legal_address TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS verification_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS verification_reviewed_by TEXT;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'company')),
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT,
  company_id TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  city_major TEXT NOT NULL,
  location_detail TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  budget_from INTEGER NOT NULL,
  budget_to INTEGER NOT NULL,
  budget_label TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  terms TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  industry TEXT NOT NULL,
  rating NUMERIC(2, 1) NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS order_views (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, user_id)
);

CREATE TABLE IF NOT EXISTS contract_requests (
  id TEXT PRIMARY KEY,
  from_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  to_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  company_a_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_b_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  offered_details TEXT NOT NULL DEFAULT '',
  agreement_details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS offered_details TEXT NOT NULL DEFAULT '';

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS agreement_details TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;


CREATE TABLE IF NOT EXISTS chat_reads (
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, company_id)
);

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'negotiation';

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS pending_status TEXT;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS pending_status_requested_by_company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS chat_archives (
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, company_id)
);

ALTER TABLE chats
  ALTER COLUMN lifecycle_status SET DEFAULT 'negotiation';

UPDATE chats
SET lifecycle_status = 'negotiation'
WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS orders_company_id_idx ON orders (company_id);
CREATE INDEX IF NOT EXISTS orders_sort_order_idx ON orders (sort_order, id);
CREATE INDEX IF NOT EXISTS chats_company_a_id_idx ON chats (company_a_id);
CREATE INDEX IF NOT EXISTS chats_company_b_id_idx ON chats (company_b_id);
CREATE INDEX IF NOT EXISTS chats_order_id_idx ON chats (order_id);
CREATE INDEX IF NOT EXISTS chat_messages_chat_created_idx ON chat_messages (chat_id, created_at, id);
CREATE INDEX IF NOT EXISTS users_company_id_idx ON users (company_id);

DO $$
BEGIN
  ALTER TABLE companies
    ADD CONSTRAINT companies_verification_status_check
    CHECK (verification_status IN ('none', 'pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS companies_inn_unique_idx ON companies (inn) WHERE inn <> '';
CREATE INDEX IF NOT EXISTS companies_verification_status_idx ON companies (verification_status, verification_requested_at DESC);
