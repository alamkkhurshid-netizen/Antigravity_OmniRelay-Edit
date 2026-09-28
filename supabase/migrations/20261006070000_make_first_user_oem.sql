-- Migration to make the first user a platform operator so they can access the OEM panel

INSERT INTO private.platform_operators (user_id, role, active)
SELECT id, 'oem_admin', true
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;
