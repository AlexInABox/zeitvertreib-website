UPDATE playerdata
SET experience = 20000;

UPDATE advent_calendar
SET
  day_1 = 1,
  day_2 = 1,
  day_3 = 1,
  day_4 = 1,
  day_5 = 1,
  day_6 = 1,
  day_15 = 0;


INSERT INTO discord_info (
  discordId,
  username,
  display_name,
  booster_since,
  donator_since,
  vip_since,
  team_since
)
VALUES (
  '428870593358594048',
  'unknown',
  'unknown',
  2840140800,
  2840140800,
  2840140800,
  2840140800
)
ON CONFLICT(discordId) DO UPDATE SET
  username = excluded.username,
  display_name = excluded.display_name,
  booster_since = excluded.booster_since,
  donator_since = excluded.donator_since,
  vip_since = excluded.vip_since,
  team_since = excluded.team_since;


/*
INSERT INTO spray_bans (
  userid,
  banned_at,
  reason,
  banned_by_discord_id
)
VALUES (
  '76561198354414854@steam',
  2840140800,
  'Wiederholtes hochladen unangemessener Sprays.',
  '428870593358594048'
)
ON CONFLICT(userid) DO UPDATE SET
  banned_at = excluded.banned_at,
  reason = excluded.reason,
  banned_by_discord_id = excluded.banned_by_discord_id;
*/