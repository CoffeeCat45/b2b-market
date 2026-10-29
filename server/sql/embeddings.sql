-- Векторы для локального нейропоиска. Содержимое таблицы публичное: это только
-- числовые представления открытых карточек, без контактов и персональных данных.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.content_embeddings (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'company')),
  entity_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  embedding extensions.vector NOT NULL,
  source_hash TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id, model)
);

ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;

-- Политики не нужны: API работает через прямое подключение к БД и обходит RLS,
-- а Data API для этой таблицы закрыт.
CREATE INDEX IF NOT EXISTS content_embeddings_lookup_idx
  ON public.content_embeddings (entity_type, model, updated_at DESC);
