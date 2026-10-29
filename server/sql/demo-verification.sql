-- Только UPDATE для существующей демо-БД: показать статусы проверки на тестовых компаниях.
-- ВНИМАНИЕ: запускать только на демо/тестовой базе. Не применять к боевым данным.
-- Затрагивает только компании cmp-13, cmp-14, cmp-15 с синтетическими ИНН из seed.sql.

-- Ожидает решения администратора.
UPDATE companies
SET inn = '7700000009',
    legal_name = 'ООО «Тестовая компания Плюс»',
    ogrn = '1157700000017',
    legal_address = 'г. Москва, ул. Тестовая, д. 1',
    verification_status = 'pending',
    verification_reason = '',
    verification_requested_at = NOW() - INTERVAL '1 day',
    verification_reviewed_at = NULL,
    verification_reviewed_by = NULL
WHERE id = 'cmp-13';

-- Отклонена: причина видна только владельцу и администратору.
UPDATE companies
SET inn = '7800000002',
    legal_name = 'ООО «Тестовая компания Вектор»',
    ogrn = '1157700000028',
    legal_address = 'г. Казань, ул. Тестовая, д. 2',
    verification_status = 'rejected',
    verification_reason = 'ИНН не совпадает с данными ЕГРЮЛ.',
    verification_requested_at = NOW() - INTERVAL '3 days',
    verification_reviewed_at = NOW() - INTERVAL '2 days',
    verification_reviewed_by = 'usr-admin'
WHERE id = 'cmp-14';

-- ИП с синтетическим 12-значным ИНН: автопроверка недоступна, только ручной режим.
UPDATE companies
SET inn = '500100732259',
    legal_name = '',
    ogrn = '315500100000012',
    legal_address = 'г. Самара, ул. Тестовая, д. 3',
    verification_status = 'none',
    verification_reason = '',
    verification_requested_at = NULL,
    verification_reviewed_at = NULL,
    verification_reviewed_by = NULL
WHERE id = 'cmp-15';
