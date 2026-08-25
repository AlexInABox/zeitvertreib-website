import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const MAIN_DISCORD_ID = '428870593358594048';
const MAIN_STEAM_ID = '76561198354414854';

const MIN_STEAM64 = 76561197960265728n;
const MAX_STEAM64 = 76561202255233023n;
const DAY_MS = 24 * 60 * 60 * 1000;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedArg = process.argv.find((a) => a.startsWith('--seed='));
const rng = mulberry32(seedArg ? Number(seedArg.split('=')[1]) || 1 : Date.now());
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (p) => rng() < p;

function randomSteamId() {
  return (MIN_STEAM64 + BigInt(randInt(0, Number(MAX_STEAM64 - MIN_STEAM64)))).toString();
}

function findLocalD1() {
  const dir = path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  if (!fs.existsSync(dir)) {
    console.error(`No local D1 state found at ${dir}. Run 'npm run db:init' first.`);
    process.exit(1);
  }
  const file = fs
    .readdirSync(dir)
    .find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (!file) {
    console.error(`No D1 database file found in ${dir}. Run 'npm run db:init' first.`);
    process.exit(1);
  }
  return path.join(dir, file);
}

const FAKERANK_COLORS = [
  'pink', 'red', 'brown', 'silver', 'default', 'light_green', 'crimson', 'cyan',
  'aqua', 'deep_pink', 'tomato', 'yellow', 'magenta', 'blue_green', 'orange',
  'lime', 'green', 'emerald', 'carmine', 'nickel', 'mint', 'army_green', 'pumpkin',
];

const CASE_CATEGORIES = [
  'Beleidigungen', 'Supportflucht', 'Team-Trolling', 'Soundboard', 'Report-Abuse',
  'Camping', 'Rollenflucht', 'Bug-Abusing', 'Diebstahl', 'Teaming',
  'Gefesselte Klassen', 'Ban-Evasion', 'Rundenende', 'Sonstiges',
];

const USERNAMES = [
  'BratwurstBoss', 'KartoffelKiller', 'SCPEnjoyer', 'DBoiDario', 'Kettenraeucherin',
  'Nierenbrecher', 'TuersteherTim', 'LachsackLarry', 'ZugunfallBert', 'KaffeeKrieger',
  'PixelPirat', 'SneakySven', 'WurstWasser', 'ChaosCharlotte', 'MegaMettwurst',
  'Tuetenharry', 'RettungsRoller', 'ZombieZimt', 'KlausKlever', 'SchlachtbankSteve',
];

const DISCORD_NAMES = [
  ['wurstwasser', 'Wurstwasser'], ['klaus.klever', 'Klaus Klever'], ['d_boi', 'D-Boi'],
  ['chaoscharlotte', 'Chaos Charlotte'], ['mettwurst', 'MegaMettwurst'], ['pixelpirat', 'PixelPirat'],
  ['sneaky.sven', 'SneakySven'], ['zombiezimt', 'ZombieZimt'], ['tuertsteher_tim', 'Türsteher Tim'],
  ['kaffeekrieger', 'KaffeeKrieger'],
];

const FAKERANK_TEXTS = [
  'Zertifikter Keksliebhaber', 'Echter Nerd', 'Brot-Priester', 'Kartoffelkönig',
  'Professioneller Bettnässer', 'SCP-096s Bester Freund', 'Chef-Ente', 'Meister des Chaos',
  'Lebende Legende (selbst ernannt)', 'Fachidiot für alles', 'Kaffeekanne des Jahres',
  'Vorsitzender des Nerd-Rats', 'Ehrenmann ohne Ehre', 'Turbo-Bean', 'Lord of Latenz',
];

const CASE_TEMPLATES = {
  Beleidigungen: {
    titles: ['Beleidigung gegenüber {role}', 'Toxische Ausdrucksweise im Voice', 'Beleidigungen nach Rundenende'],
    descriptions: [
      '{name} hat {role} wiederholt als "absoluter {insult}" bezeichnet und sich anschließend über dessen Spielstil lustig gemacht. Nach Ansprache durch das Team reagierte {name} mit Spott und verließ den Server.',
      'Zeuge meldet, dass {name} mehrere Minuten lang durchgehende Beleidigungen gegen {victim} gerichtet hat. Aufklärung erfolgte, Einsicht nicht erkennbar.',
    ],
  },
  Supportflucht: {
    titles: ['Supportflucht nach Verwarnung', 'Support gespammt und verlassen'],
    descriptions: [
      '{name} hat den Support-Kanal geflutet, nachdem der Antrag abgelehnt wurde, und ist dann vom Voice-Support geflüchtet. Historik zeigt drei ähnliche Vorfälle in den letzten Tagen.',
      'Nach einer berechtigten Kritik am eigenen Verhalten hat {name} das Supportgespräch verlassen und sich im OOC lautstark beschwert.',
    ],
  },
  'Team-Trolling': {
    titles: ['Absichtliches Teamkilling als {role}', 'Trolling mit SCP-079-Türen', 'Blockieren von Toren als {role}'],
    descriptions: [
      '{name} hat als {role} mehrfach eigene Teammitglieder in {map} erschossen und dies mit "war doch lustig" begründet. Betroffen waren {count} Spieler.',
      'Als {role} hat {name} absichtlich Türen auf SCP-173 zugeschlossen und Teammitglieder eingesperrt. Mehrere Videoclips liegen vor.',
    ],
  },
  Soundboard: {
    titles: ['Soundboard-Spam über Mikrofon', 'Störende Sounds in Intercom'],
    descriptions: [
      '{name} hat über das Soundboard dauerhaft laute Geräusche abgespielt, trotz mehrfacher Aufforderung im Voice. Betrifft die gesamte Runde in {map}.',
      'Intercom wurde von {name} mehrfach mit dem selben Meme-Sound zugespamt, normale Durchsagen waren nicht möglich.',
    ],
  },
  'Report-Abuse': {
    titles: ['Massenreports gegen unschuldige Spieler', 'Report als Druckmittel'],
    descriptions: [
      '{name} hat innerhalb weniger Minuten {count} Reports gegen dieselbe Person erstellt, offensichtlich aus Rache. Keiner der Reports war haltbar.',
      'Berichte deuten darauf hin, dass {name} Reports nutzt, um Spieler einzuschüchtern ("Ich reporte dich so lange, bis du gebannt wirst").',
    ],
  },
  Camping: {
    titles: ['SCP-Camping am Gate-A-Aufzug', 'Camping im 079-Containment'],
    descriptions: [
      '{name} hat als SCP über mehrere Runden den Aufzug in {map} bewacht, um ausbrechende Klassen sofort zu eliminieren. Spielfluss massiv gestört.',
      'Als Mensch hat {name} stundenlang in einem Raum gecampt statt Ziele zu verfolgen, mehrfach angesprochen, keine Reaktion.',
    ],
  },
  Rollenflucht: {
    titles: ['Rollenflucht als SCP-049', 'Verweigerung der Rolle D-Klasse'],
    descriptions: [
      '{name} hat direkt nach Erhalt der Rolle {role} das Spiel verlassen. In den letzten Tagen bereits zum dritten Mal registriert.',
      '{name} hat als {role} aktiv die Zusammenarbeit mit dem Team verweigert und sich versteckt, bis die Runde endete.',
    ],
  },
  'Bug-Abusing': {
    titles: ['Ausnutzung des Tür-Bugs in {map}', 'Duplizieren von Items via Inventar-Bug'],
    descriptions: [
      '{name} hat einen bekannten Bug genutzt, um durch verschlossene Türen zu gelangen und sich so unberechtigt Zugang zum Alpha-Warhead-Raum zu verschaffen.',
      'Mehrfaches Duplizieren von Medkits über den Inventar-Bug durch {name}, anschließend Verkauf der Items an andere Spieler.',
    ],
  },
  Diebstahl: {
    titles: ['Klauen von Keycards im Lichtkontainment', 'Wegnehmen von Items unter Zwang'],
    descriptions: [
      '{name} hat mehreren Wissenschaftlern die Keycards abgenommen und diese anschließend im Fensterbereich entsorgt.',
      'Unter Androhung von Gewalt hat {name} {victim} sämtliche Items abgenommen und ihn danach trotzdem erschossen.',
    ],
  },
  Teaming: {
    titles: ['Teaming zwischen SCP und Chaos', 'Absprache mit gegnerischem Team'],
    descriptions: [
      '{name} (SCP) und ein Chaos-Spieler haben eine Abmachung getroffen, sich gegenseitig zu schonen. Chatlogs bestätigen die Absprache.',
      'Beobachtet: {name} hat MTF-Personal bewusst laufen lassen und stattdessen eigene "Verbündete" geschont.',
    ],
  },
  'Gefesselte Klassen': {
    titles: ['Verschleppte D-Klasse ohne Zweck', 'Zivilisten gefesselt zurückgelassen'],
    descriptions: [
      '{name} hat {count} D-Klasse-Mitarbeiter gefesselt in einem Raum abgelegt und sie dort verhungern lassen, ohne jeglichen RP-Hintergrund.',
      'Mehrere gefesselte Spieler wurden von {name} in Gefahrenzonen deponiert und dort ihrem Schicksal überlassen.',
    ],
  },
  'Ban-Evasion': {
    titles: ['Ban-Evasion mit Zweitaccount', 'Umgehung eines aktiven Timeouts'],
    descriptions: [
      '{name} ist trotz aktiver Sperre mit einem Zweitaccount zurückgekehrt. Hardware-Übereinstimmung liegt vor, Account wurde ingame bestätigt.',
      'Während eines aktiven Timeouts hat {name} über einen Fremdaccount weitergespielt, erkannt an gleichem Verhaltensmuster und Voice.',
    ],
  },
  Rundenende: {
    titles: ['Kill kurz vor Rundenende', 'Escapen verhindert nach Rundenende-Signal'],
    descriptions: [
      '{name} hat unmittelbar vor dem Rundenende noch gezielt flüchtende Spieler getötet, obwohl die Runde faktisch entschieden war.',
      'Nach dem Endsignal hat {name} mehrere Spieler am Verlassen des Servers gehindert und diese dann getötet.',
    ],
  },
  Sonstiges: {
    titles: ['Unkooperatives Verhalten im Event', 'Störung des Ablaufs bei {map}-Event'],
    descriptions: [
      '{name} hat während eines organisierten Events wiederholt den Ablauf gestört, trotz mehrfacher Ermahnung durch das Organisationsteam.',
      'Sonderfall: {name} hat andere Spieler zu Rulebreaking aufgefordert und diese anschließend gemeldet. Gesamtbild wirkt vorsätzlich.',
    ],
  },
};

const ROLES = ['D-Klasse', 'Wissenschaftler', 'MTF-Epsilon-11', 'Chaos-Insurgency', 'SCP-096', 'SCP-173', 'Facility Guard', 'Nine-Tailed Fox'];
const MAPS = ['Site-02', 'Light Containment Zone', 'Heavy Containment Zone', 'Entrance Zone', 'Surface Zone'];
const INSULTS = ['Banause', 'Gemüse', 'NPC', 'Amateur'];

function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? key);
}

function makeCaseContent(category) {
  const t = CASE_TEMPLATES[category];
  const vars = {
    name: pick(USERNAMES),
    victim: pick(USERNAMES),
    role: pick(ROLES),
    map: pick(MAPS),
    insult: pick(INSULTS),
    count: randInt(2, 6).toString(),
  };
  return {
    title: fillTemplate(pick(t.titles), vars),
    description: fillTemplate(pick(t.descriptions), vars),
  };
}

function caseId() {
  return crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex').substring(0, 10);
}

const db = new Database(findLocalD1());
db.pragma('journal_mode = WAL');

const now = Date.now();
const nowSec = Math.floor(now / 1000);

console.log(`Seeding local D1 at ${db.name}`);

db.pragma('foreign_keys = OFF');
db.transaction(() => {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name)
    .filter((n) => !n.startsWith('_cf') && n !== 'sqlite_sequence');
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'").get()) {
    db.prepare('DELETE FROM sqlite_sequence').run();
  }
})();
db.pragma('foreign_keys = ON');

const insertPlayerdata = db.prepare(`
  INSERT INTO playerdata (
    id, discordId, experience, playtime, roundsplayed, usedmedkits, usedcolas,
    pocketescapes, usedadrenaline, fakerank, snakehighscore, killcount, deathcount,
    fakerank_until, fakerank_color, fakerankadmin_until, redeemed_codes,
    fakerankoverride_until, username, slotSpins, slotWins, slotLosses,
    luckyWheelSpins, luckyWheelWins, luckyWheelLosses, rouletteSpins, rouletteWins,
    rouletteLosses, lootbox_vouchers, first_seen, last_seen
  ) VALUES (
    @id, @discordId, @experience, @playtime, @roundsplayed, @usedmedkits, @usedcolas,
    @pocketescapes, @usedadrenaline, @fakerank, @snakehighscore, @killcount, @deathcount,
    @fakerank_until, @fakerank_color, @fakerankadmin_until, '',
    0, @username, @slotSpins, @slotWins, @slotLosses,
    @luckyWheelSpins, @luckyWheelWins, @luckyWheelLosses, @rouletteSpins, @rouletteWins,
    @rouletteLosses, @lootbox_vouchers, @first_seen, @last_seen
  )
`);

const insertDiscordInfo = db.prepare(`
  INSERT INTO discord_info (discordId, username, display_name, booster_since, donator_since, vip_since, team_since)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertFakerank = db.prepare(
  'INSERT INTO fakeranks (userid, text, normalized_text, color, uploaded_at) VALUES (?, ?, ?, ?, ?)',
);

const insertKill = db.prepare('INSERT INTO kills (attacker, target, timestamp) VALUES (?, ?, ?)');

const insertDonation = db.prepare('INSERT INTO donations (discord_id, amount, donated_at) VALUES (?, ?, ?)');

const insertBirthday = db.prepare('INSERT INTO birthdays (userid, day, month, year) VALUES (?, ?, ?, ?)');

const insertChickenGame = db.prepare(`
  INSERT INTO chicken_cross_games (seed, userid, initial_wager, current_payout, step, state, last_updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertRedemptionCode = db.prepare(
  'INSERT INTO redemption_codes (code, credits, remaining_uses) VALUES (?, ?, ?)',
);

const insertAdventCalendar = db.prepare(
  'INSERT INTO advent_calendar (user_id, day_1, day_2, day_3, day_4, day_5, day_6, day_7, day_15) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
);

const insertNotification = db.prepare(
  'INSERT INTO notifications (user_id, type, title, message, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?)',
);

const insertSpray = db.prepare('INSERT INTO sprays (userid, name, sha256, uploaded_at) VALUES (?, ?, ?, ?)');

const insertCase = db.prepare(`
  INSERT INTO cases (id, title, description, category, created_by_discord_id, created_at, last_updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertCaseUser = db.prepare('INSERT INTO cases_related_users (case_id, steam_id) VALUES (?, ?)');

const insertCaseLink = db.prepare('INSERT INTO case_to_ced_mod_report_links (case_id, report_id) VALUES (?, ?)');

const players = [];
for (let i = 0; i < randInt(20, 30); i++) {
  players.push({
    id: `${randomSteamId()}@steam`,
    discordId: null,
    username: pick(USERNAMES),
  });
}
players[0].id = `${MAIN_STEAM_ID}@steam`;

const linkedCount = Math.floor(players.length * 0.6);
for (let i = 0; i < linkedCount; i++) {
  players[i].discordId = i === 0 ? MAIN_DISCORD_ID : (900000000000000000n + BigInt(randInt(100000000, 999999999))).toString();
}

const teamDiscordIds = [];

db.transaction(() => {
  for (const player of players) {
    const spinsA = randInt(0, 400);
    const winsA = Math.floor(spinsA * (0.3 + rng() * 0.2));
    const spinsW = randInt(0, 300);
    const winsW = Math.floor(spinsW * (0.3 + rng() * 0.2));
    const spinsR = randInt(0, 250);
    const winsR = Math.floor(spinsR * (0.4 + rng() * 0.15));

    insertPlayerdata.run({
      id: player.id,
      discordId: player.discordId,
      experience: player.discordId === MAIN_DISCORD_ID ? 20000 : randInt(0, 45000),
      playtime: randInt(0, 400000),
      roundsplayed: randInt(0, 3000),
      usedmedkits: randInt(0, 800),
      usedcolas: randInt(0, 1200),
      pocketescapes: randInt(0, 90),
      usedadrenaline: randInt(0, 200),
      fakerank: chance(0.35) ? pick(FAKERANK_TEXTS) : null,
      snakehighscore: randInt(0, 180),
      killcount: randInt(0, 5000),
      deathcount: randInt(0, 5000),
      fakerank_until: chance(0.35) ? Math.floor((now + randInt(1, 40) * DAY_MS) / 1000) : 0,
      fakerank_color: pick(FAKERANK_COLORS),
      fakerankadmin_until: player.discordId === MAIN_DISCORD_ID ? 2840140800 : 0,
      username: player.username,
      slotSpins: spinsA,
      slotWins: winsA,
      slotLosses: spinsA - winsA,
      luckyWheelSpins: spinsW,
      luckyWheelWins: winsW,
      luckyWheelLosses: spinsW - winsW,
      rouletteSpins: spinsR,
      rouletteWins: winsR,
      rouletteLosses: spinsR - winsR,
      lootbox_vouchers: randInt(0, 5),
      first_seen: now - randInt(30, 700) * DAY_MS,
      last_seen: now - randInt(0, 14) * DAY_MS,
    });

    if (player.discordId) {
      const [username, displayName] =
        player.discordId === MAIN_DISCORD_ID ? ['unknown', 'unknown'] : pick(DISCORD_NAMES);
      const isTeamMember = player.discordId === MAIN_DISCORD_ID || chance(0.25);
      const sinceSec = isTeamMember ? 2840140800 : 0;
      if (isTeamMember && player.discordId !== MAIN_DISCORD_ID) teamDiscordIds.push(player.discordId);
      insertDiscordInfo.run(
        player.discordId,
        username,
        displayName,
        chance(0.3) ? 2840140800 : 0,
        chance(0.4) ? Math.floor((now - randInt(10, 300) * DAY_MS) / 1000) : 0,
        chance(0.25) ? Math.floor((now - randInt(10, 200) * DAY_MS) / 1000) : 0,
        sinceSec,
      );
    }

    if (chance(0.45)) {
      const rankText = pick(FAKERANK_TEXTS);
      insertFakerank.run(player.id, rankText, rankText.toLowerCase(), pick(FAKERANK_COLORS), now - randInt(0, 60) * DAY_MS);
    }

    if (chance(0.3)) {
      insertBirthday.run(player.id, randInt(1, 28), randInt(1, 12), chance(0.7) ? randInt(1975, 2010) : null);
    }
  }

  for (let i = 0; i < 50; i++) {
    insertKill.run(pick(players).id, pick(players).id, nowSec - randInt(0, 30 * 24 * 3600));
  }

  for (let i = 0; i < 10; i++) {
    insertDonation.run(pick(players.filter((p) => p.discordId)).discordId ?? MAIN_DISCORD_ID, (randInt(1, 60) + 0.99).toFixed(2), now - randInt(0, 90) * DAY_MS);
  }

  for (let i = 0; i < 6; i++) {
    const wager = pick([50, 100, 250, 500]);
    const step = randInt(1, 7);
    const state = pick(['ACTIVE', 'CASHED_OUT', 'LOST']);
    insertChickenGame.run(
      randInt(100000, 999999999),
      pick(players).id,
      wager,
      state === 'LOST' ? 0 : wager * step,
      step,
      state,
      now - randInt(0, 7) * DAY_MS,
    );
  }

  for (const code of [['ZEIT2026', 500, 100], ['KEKSE', 50, 999], ['NERDPOWER', 1337, 10], ['WILLKOMMEN', 100, 500], ['GEBURTSTAG', 250, 50]]) {
    insertRedemptionCode.run(...code);
  }

  insertAdventCalendar.run(MAIN_DISCORD_ID, 1, 1, 1, 1, 1, 1, 0, 0);
  for (const player of players) {
    if (player.discordId && player.discordId !== MAIN_DISCORD_ID && chance(0.4)) {
      insertAdventCalendar.run(
        player.discordId,
        chance(0.8) ? 1 : 0, chance(0.7) ? 1 : 0, chance(0.6) ? 1 : 0, chance(0.5) ? 1 : 0,
        chance(0.4) ? 1 : 0, chance(0.3) ? 1 : 0, chance(0.2) ? 1 : 0, 0,
      );
    }
  }

  const notificationTemplates = [
    ['fakerank_billing', 'Fakerank läuft bald ab', 'Dein Fakerank läuft in wenigen Tagen ab. Verlängere ihn jetzt, um deinen Rang zu behalten!'],
    ['fakerank_deleted', 'Fakerank entfernt', 'Dein Fakerank wurde von einem Moderator entfernt. Grund: Verstoß gegen die Namensrichtlinien.'],
    ['spray_deleted', 'Spray entfernt', 'Dein Spray wurde von einem Moderator entfernt. Grund: Unangemessener Inhalt.'],
    ['session_completed', 'Sitzung abgeschlossen', 'Du hast genug XP für einen Level-Up gesammelt. Schau auf deinem Profil vorbei!'],
  ];
  for (const player of players) {
    if (!player.discordId || !chance(0.5)) continue;
    const [type, title, message] = pick(notificationTemplates);
    insertNotification.run(
      player.id,
      type,
      title,
      message,
      now - randInt(0, 21) * DAY_MS,
      chance(0.6) ? now - randInt(0, 5) * DAY_MS : null,
    );
  }

  for (let i = 0; i < 5; i++) {
    insertSpray.run(pick(players).id, pick(['MeinKunstwerk', 'Katze.png', 'Trollface', 'Blumen']), crypto.randomBytes(32).toString('hex'), now - randInt(0, 120) * DAY_MS);
  }

  const caseCount = randInt(10, 16);
  for (let i = 0; i < caseCount; i++) {
    const category = pick(CASE_CATEGORIES);
    const { title, description } = makeCaseContent(category);
    const creator = pick(teamDiscordIds.length > 0 && chance(0.7) ? teamDiscordIds : [MAIN_DISCORD_ID]);
    const createdAt = now - randInt(0, 60) * DAY_MS;
    const lastUpdatedAt = Math.min(now, createdAt + randInt(0, 10) * DAY_MS);
    const id = caseId();

    insertCase.run(id, title, description, category, creator, createdAt, lastUpdatedAt);

    const relatedUsers = [...players].sort(() => rng() - 0.5).slice(0, randInt(1, 4)).map((p) => p.id);
    if (chance(0.2)) relatedUsers.push(`${randomSteamId()}@steam`);
    for (const steamId of relatedUsers) {
      insertCaseUser.run(id, steamId);
    }

    if (chance(0.4)) {
      insertCaseLink.run(id, randInt(1000, 99999));
    }
  }
})();

const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
console.log('Seed complete:');
console.log(`  playerdata:              ${count('playerdata')}`);
console.log(`  discord_info:            ${count('discord_info')}`);
console.log(`  fakeranks:               ${count('fakeranks')}`);
console.log(`  kills:                   ${count('kills')}`);
console.log(`  donations:               ${count('donations')}`);
console.log(`  birthdays:               ${count('birthdays')}`);
console.log(`  chicken_cross_games:     ${count('chicken_cross_games')}`);
console.log(`  redemption_codes:        ${count('redemption_codes')}`);
console.log(`  advent_calendar:         ${count('advent_calendar')}`);
console.log(`  notifications:           ${count('notifications')}`);
console.log(`  sprays:                  ${count('sprays')}`);
console.log(`  cases:                   ${count('cases')}`);
console.log(`  cases_related_users:     ${count('cases_related_users')}`);
console.log(`  case_cedmod_links:       ${count('case_to_ced_mod_report_links')}`);

db.close();
