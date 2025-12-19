UPDATE playerdata
SET fakerankadmin_until = 2840140800;

UPDATE playerdata
SET experience = 2840140800;

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
  team_since
)
VALUES (
  '428870593358594048',
  'unknown',
  'unknown',
  2840140800,
  0,
  2840140800
)
ON CONFLICT(discordId) DO UPDATE SET
  username = excluded.username,
  display_name = excluded.display_name,
  booster_since = excluded.booster_since,
  donator_since = excluded.donator_since,
  team_since = excluded.team_since;
