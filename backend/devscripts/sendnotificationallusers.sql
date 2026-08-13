INSERT INTO notifications (user_id, type, title, message, created_at, read_at)
SELECT DISTINCT
  s.userid,
  'announcement',
  'Testbenachrichtigung',
  'Dies ist eine Testbenachrichtigung an alle angemeldeten Nutzer.',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  NULL
FROM sessions s
WHERE s.expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000;
