import { AttachmentBuilder } from 'discord.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';

const now = () => Date.now();
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const money = (amount) => `$${Math.floor(Number(amount) || 0).toLocaleString()}`;

const ADVENTURE_COOLDOWN = 8 * 60 * 1000;
const FIGHT_COOLDOWN = 12 * 60 * 1000;
const BOSS_ATTACK_COOLDOWN = 20 * 60 * 1000;
const FISH_COOLDOWN = 10 * 60 * 1000;
const MINE_COOLDOWN = 12 * 60 * 1000;

const FISH_CATALOG = [
  { id: 'minnow', name: 'Minnow', emoji: '🐟', rarity: 'Common', base: 70, min: 40, max: 130, weight: 38 },
  { id: 'salmon', name: 'Salmon', emoji: '🐟', rarity: 'Common', base: 120, min: 75, max: 210, weight: 28 },
  { id: 'tuna', name: 'Tuna', emoji: '🐟', rarity: 'Uncommon', base: 260, min: 160, max: 450, weight: 18 },
  { id: 'lobster', name: 'Lobster', emoji: '🦞', rarity: 'Rare', base: 520, min: 320, max: 900, weight: 9 },
  { id: 'shark', name: 'Shark', emoji: '🦈', rarity: 'Epic', base: 1400, min: 900, max: 2600, weight: 5 },
  { id: 'golden_whale', name: 'Golden Whale', emoji: '🐋', rarity: 'Legendary', base: 5200, min: 3200, max: 9500, weight: 2 },
];

const ORE_CATALOG = [
  { id: 'stone', name: 'Stone', emoji: '🪨', rarity: 'Common', base: 60, min: 30, max: 110, weight: 34 },
  { id: 'coal', name: 'Coal', emoji: '⚫', rarity: 'Common', base: 120, min: 70, max: 210, weight: 27 },
  { id: 'iron', name: 'Iron Ore', emoji: '⛓️', rarity: 'Uncommon', base: 260, min: 170, max: 480, weight: 18 },
  { id: 'gold', name: 'Gold Ore', emoji: '🟨', rarity: 'Rare', base: 680, min: 430, max: 1200, weight: 10 },
  { id: 'diamond', name: 'Diamond', emoji: '💎', rarity: 'Epic', base: 1800, min: 1100, max: 3200, weight: 7 },
  { id: 'ancient_core', name: 'Ancient Core', emoji: '🔮', rarity: 'Legendary', base: 6500, min: 4100, max: 12000, weight: 2 },
];

const MONSTERS = [
  { name: 'Slime Ruins', emoji: '🟢', hp: 60, attack: 8, reward: [250, 500], xp: 40 },
  { name: 'Cave Goblin', emoji: '👺', hp: 90, attack: 13, reward: [420, 850], xp: 65 },
  { name: 'Crystal Wolf', emoji: '🐺', hp: 130, attack: 18, reward: [700, 1300], xp: 95 },
  { name: 'Shadow Knight', emoji: '🛡️', hp: 190, attack: 25, reward: [1200, 2200], xp: 140 },
  { name: 'Ancient Dragon', emoji: '🐉', hp: 320, attack: 36, reward: [2500, 5200], xp: 260 },
];

const BOSS_POOL = [
  { name: 'Abyssal Leviathan', emoji: '🐲', maxHp: 45000, reward: 9000, xp: 450 },
  { name: 'Titan Mecha Core', emoji: '🤖', maxHp: 52000, reward: 11000, xp: 500 },
  { name: 'Eclipse Hydra', emoji: '🐍', maxHp: 60000, reward: 13000, xp: 560 },
];

const CASINO_LIMITS = { minBet: 100, maxBet: 250000 };

function userKey(guildId, userId) { return `gamepack:${guildId}:user:${userId}`; }
function fishKey(guildId, userId) { return `gamepack:${guildId}:fish:${userId}`; }
function mineKey(guildId, userId) { return `gamepack:${guildId}:mine:${userId}`; }
function bossKey(guildId) { return `gamepack:${guildId}:worldboss`; }

function defaultGameUser() {
  return {
    level: 1,
    xp: 0,
    hp: 120,
    maxHp: 120,
    energy: 100,
    floor: 1,
    wins: 0,
    losses: 0,
    bossDamage: 0,
    lastAdventure: 0,
    lastFight: 0,
    lastBossAttack: 0,
    inventory: { potion: 2, revive: 0, iron_sword: 0, shield: 0 },
  };
}

function defaultFishUser() {
  return {
    rodLevel: 1,
    bait: 10,
    lastCast: 0,
    inventory: {},
    stats: { caught: 0, sold: 0, earned: 0, legendary: 0 },
  };
}

function defaultMineUser() {
  return {
    pickaxeLevel: 1,
    durability: 100,
    lastDig: 0,
    inventory: {},
    stats: { mined: 0, sold: 0, earned: 0, legendary: 0 },
  };
}

function normalizeGameUser(data = {}) {
  const base = defaultGameUser();
  const out = { ...base, ...(data || {}) };
  out.inventory = { ...base.inventory, ...(data?.inventory || {}) };
  out.level = Math.max(1, Math.floor(Number(out.level) || 1));
  out.xp = Math.max(0, Math.floor(Number(out.xp) || 0));
  out.maxHp = Math.max(120, Math.floor(Number(out.maxHp) || 120));
  out.hp = clamp(out.hp, 0, out.maxHp);
  out.energy = clamp(out.energy, 0, 100);
  return out;
}

function normalizeFishUser(data = {}) {
  const base = defaultFishUser();
  const out = { ...base, ...(data || {}) };
  out.inventory = { ...(data?.inventory || {}) };
  out.stats = { ...base.stats, ...(data?.stats || {}) };
  out.rodLevel = clamp(out.rodLevel, 1, 10);
  out.bait = Math.max(0, Math.floor(Number(out.bait) || 0));
  return out;
}

function normalizeMineUser(data = {}) {
  const base = defaultMineUser();
  const out = { ...base, ...(data || {}) };
  out.inventory = { ...(data?.inventory || {}) };
  out.stats = { ...base.stats, ...(data?.stats || {}) };
  out.pickaxeLevel = clamp(out.pickaxeLevel, 1, 10);
  out.durability = clamp(out.durability, 0, 100);
  return out;
}

function xpNeeded(level) { return Math.floor(120 + level * level * 80); }

function addXp(user, xp) {
  user.xp += Math.max(0, Math.floor(xp));
  let leveled = 0;
  while (user.xp >= xpNeeded(user.level)) {
    user.xp -= xpNeeded(user.level);
    user.level += 1;
    user.maxHp += 12;
    user.hp = user.maxHp;
    leveled += 1;
  }
  return leveled;
}

async function getDb(client, key, fallback) {
  if (!client?.db?.get) return fallback;
  return client.db.get(key, fallback);
}

async function setDb(client, key, value) {
  if (!client?.db?.set) return false;
  await client.db.set(key, value);
  return true;
}

async function listDb(client, prefix) {
  if (!client?.db?.list) return [];
  const rows = await client.db.list(prefix);
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === 'object') return Object.entries(rows).map(([key, value]) => ({ key, value }));
  return [];
}

async function getGameUser(client, guildId, userId) {
  return normalizeGameUser(await getDb(client, userKey(guildId, userId), defaultGameUser()));
}
async function saveGameUser(client, guildId, userId, data) { return setDb(client, userKey(guildId, userId), normalizeGameUser(data)); }
async function getFishUser(client, guildId, userId) { return normalizeFishUser(await getDb(client, fishKey(guildId, userId), defaultFishUser())); }
async function saveFishUser(client, guildId, userId, data) { return setDb(client, fishKey(guildId, userId), normalizeFishUser(data)); }
async function getMineUser(client, guildId, userId) { return normalizeMineUser(await getDb(client, mineKey(guildId, userId), defaultMineUser())); }
async function saveMineUser(client, guildId, userId, data) { return setDb(client, mineKey(guildId, userId), normalizeMineUser(data)); }

async function addWallet(client, guildId, userId, amount) {
  const eco = await getEconomyData(client, guildId, userId);
  eco.wallet = Math.max(0, Math.floor((eco.wallet || 0) + Number(amount || 0)));
  await setEconomyData(client, guildId, userId, eco);
  return eco;
}

async function chargeWallet(client, guildId, userId, amount) {
  const value = Math.floor(Number(amount || 0));
  const eco = await getEconomyData(client, guildId, userId);
  if ((eco.wallet || 0) < value) {
    return { success: false, message: `Cash kamu kurang. Butuh **${money(value)}**, saldo kamu **${money(eco.wallet || 0)}**.` };
  }
  eco.wallet = Math.max(0, (eco.wallet || 0) - value);
  await setEconomyData(client, guildId, userId, eco);
  return { success: true, economy: eco };
}

function formatDuration(ms) {
  if (ms <= 0) return 'sekarang';
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}j ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}d`;
  return `${s}d`;
}

function cooldown(last, cd) {
  const remaining = Math.max(0, last + cd - now());
  return { ready: remaining <= 0, remaining, text: formatDuration(remaining) };
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[0];
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function marketPrice(item, namespace = 'market') {
  const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  const hash = hashString(`${namespace}:${item.id}:${bucket}`);
  const movement = ((hash % 61) - 30) / 100; // -30% to +30%
  return Math.max(item.min, Math.min(item.max, Math.round(item.base * (1 + movement))));
}

function inventoryText(catalog, inventory = {}) {
  const lines = catalog
    .filter(item => Number(inventory[item.id] || 0) > 0)
    .map(item => `${item.emoji} **${item.name}** x${Number(inventory[item.id] || 0).toLocaleString()} • server price ${money(marketPrice(item, item.id))}`);
  return lines.length ? lines.join('\n') : 'Inventory masih kosong.';
}

function sellInventoryValue(catalog, inventory = {}) {
  let total = 0;
  const sold = [];
  for (const item of catalog) {
    const amount = Math.max(0, Math.floor(Number(inventory[item.id] || 0)));
    if (amount <= 0) continue;
    const price = marketPrice(item, item.id);
    total += amount * price;
    sold.push({ item, amount, price });
  }
  return { total, sold };
}

function sanitizeSvgText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function svgAttachment(svg, name) {
  return new AttachmentBuilder(Buffer.from(svg, 'utf8'), { name });
}

export function buildGameSvg({ title = 'Game', subtitle = '', emoji = '🎮', colorA = '#5865F2', colorB = '#111827', stat = '', footer = '' } = {}) {
  const safeTitle = sanitizeSvgText(title);
  const safeSubtitle = sanitizeSvgText(subtitle);
  const safeEmoji = sanitizeSvgText(emoji);
  const safeStat = sanitizeSvgText(stat);
  const safeFooter = sanitizeSvgText(footer);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="430" viewBox="0 0 900 430">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${colorA}"/>
      <stop offset="100%" stop-color="${colorB}"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#000" flood-opacity="0.35"/></filter>
  </defs>
  <rect width="900" height="430" rx="34" fill="url(#bg)"/>
  <circle cx="120" cy="90" r="70" fill="#ffffff" opacity="0.13"><animate attributeName="r" values="58;82;58" dur="3.2s" repeatCount="indefinite"/></circle>
  <circle cx="780" cy="350" r="95" fill="#ffffff" opacity="0.10"><animate attributeName="r" values="82;112;82" dur="4s" repeatCount="indefinite"/></circle>
  <g filter="url(#shadow)">
    <rect x="70" y="58" width="760" height="314" rx="30" fill="#0f172a" opacity="0.55"/>
  </g>
  <g transform="translate(450 160)">
    <animateTransform attributeName="transform" type="translate" values="450 160;450 138;450 160;450 174;450 160" dur="2.4s" repeatCount="indefinite"/>
    <text text-anchor="middle" y="50" font-size="118">${safeEmoji}</text>
  </g>
  <text x="450" y="90" text-anchor="middle" fill="#fff" font-size="42" font-family="Arial, sans-serif" font-weight="800">${safeTitle}</text>
  <text x="450" y="128" text-anchor="middle" fill="#e5e7eb" font-size="22" font-family="Arial, sans-serif">${safeSubtitle}</text>
  <text x="450" y="308" text-anchor="middle" fill="#ffffff" font-size="26" font-family="Arial, sans-serif" font-weight="700">${safeStat}</text>
  <text x="450" y="350" text-anchor="middle" fill="#dbeafe" font-size="17" font-family="Arial, sans-serif">${safeFooter}</text>
</svg>`;
}

function buildAttachment(payload, name = 'game-visual.svg') {
  return svgAttachment(buildGameSvg(payload), name);
}

function formatLevelLine(user) {
  return `Level **${user.level}** • XP **${user.xp.toLocaleString()} / ${xpNeeded(user.level).toLocaleString()}** • HP **${Math.round(user.hp)}/${user.maxHp}** • Energy **${Math.round(user.energy)}%**`;
}

export class GamePackService {
  static money = money;
  static formatDuration = formatDuration;
  static fishCatalog = FISH_CATALOG;
  static oreCatalog = ORE_CATALOG;

  static async adventureProfile(client, guildId, userId) {
    const user = await getGameUser(client, guildId, userId);
    return {
      success: true,
      user,
      line: formatLevelLine(user),
      visual: buildAttachment({
        title: 'Adventure RPG',
        subtitle: `Floor ${user.floor} • ${user.wins} wins • ${user.losses} losses`,
        emoji: '🧭',
        colorA: '#7C3AED',
        stat: `HP ${Math.round(user.hp)}/${user.maxHp} • Energy ${Math.round(user.energy)}%`,
        footer: `Potion x${user.inventory.potion || 0} • Revive x${user.inventory.revive || 0}`,
      }, 'adventure-profile.svg'),
    };
  }

  static async adventureExplore(client, guildId, userId) {
    const user = await getGameUser(client, guildId, userId);
    const cd = cooldown(user.lastAdventure || 0, ADVENTURE_COOLDOWN);
    if (!cd.ready) return { success: false, message: `Kamu masih istirahat. Coba lagi dalam **${cd.text}**.` };
    if (user.energy < 15) return { success: false, message: 'Energy kamu kurang. Gunakan `/game adventure heal` untuk memulihkan diri.' };

    user.energy = clamp(user.energy - randomInt(10, 18), 0, 100);
    user.lastAdventure = now();

    const roll = Math.random();
    let description = '';
    let reward = 0;
    let xp = 0;
    let itemText = '';

    if (roll < 0.12) {
      user.inventory.potion = (user.inventory.potion || 0) + 1;
      xp = randomInt(25, 55);
      itemText = '🧪 Potion x1';
      description = 'Kamu menemukan peti kecil berisi potion.';
    } else if (roll < 0.2) {
      user.inventory.revive = (user.inventory.revive || 0) + 1;
      xp = randomInt(35, 70);
      itemText = '💫 Revive x1';
      description = 'Kamu menemukan relic langka yang bisa membangkitkanmu.';
    } else if (roll < 0.62) {
      reward = randomInt(250, 800) + (user.floor * 25);
      xp = randomInt(35, 90);
      description = 'Kamu menemukan treasure chest di ruangan tersembunyi.';
      await addWallet(client, guildId, userId, reward);
    } else if (roll < 0.86) {
      xp = randomInt(70, 140);
      user.floor += Math.random() < 0.28 ? 1 : 0;
      description = 'Kamu berhasil melewati rintangan dungeon dan menemukan jalur baru.';
    } else {
      const damage = randomInt(8, 28);
      user.hp = clamp(user.hp - damage, 0, user.maxHp);
      xp = randomInt(20, 50);
      description = `Kamu terkena trap dan kehilangan **${damage} HP**.`;
    }

    const leveled = addXp(user, xp);
    await saveGameUser(client, guildId, userId, user);
    return { success: true, user, reward, xp, leveled, description, itemText, visual: buildAttachment({ title: 'Dungeon Explore', subtitle: description, emoji: reward ? '💰' : itemText ? '🎁' : '🧭', colorA: '#0EA5E9', stat: reward ? `Reward ${money(reward)}` : `XP +${xp}`, footer: formatLevelLine(user) }, 'adventure-explore.svg') };
  }

  static async adventureFight(client, guildId, userId) {
    const user = await getGameUser(client, guildId, userId);
    const cd = cooldown(user.lastFight || 0, FIGHT_COOLDOWN);
    if (!cd.ready) return { success: false, message: `Kamu masih memulihkan diri dari battle. Coba lagi dalam **${cd.text}**.` };
    if (user.hp <= 0) return { success: false, message: 'HP kamu 0. Gunakan `/game adventure heal` dulu.' };
    if (user.energy < 20) return { success: false, message: 'Energy kamu kurang untuk bertarung. Gunakan `/game adventure heal`.' };

    const monster = MONSTERS[Math.min(MONSTERS.length - 1, Math.floor((user.floor - 1) / 3) + randomInt(0, 1))] || MONSTERS[0];
    const playerPower = randomInt(35, 75) + (user.level * 10) + (user.inventory.iron_sword ? 18 : 0);
    const monsterPower = randomInt(25, 70) + (monster.attack * 2) + (user.floor * 4);
    const win = playerPower >= monsterPower;
    user.lastFight = now();
    user.energy = clamp(user.energy - randomInt(16, 26), 0, 100);

    let reward = 0;
    let xp = 0;
    let damage = 0;
    if (win) {
      reward = randomInt(monster.reward[0], monster.reward[1]) + (user.floor * 40);
      xp = randomInt(Math.floor(monster.xp * 0.8), Math.floor(monster.xp * 1.25));
      user.wins += 1;
      if (Math.random() < 0.18) user.floor += 1;
      await addWallet(client, guildId, userId, reward);
    } else {
      damage = randomInt(monster.attack, monster.attack + 35);
      if (user.inventory.shield) damage = Math.floor(damage * 0.8);
      user.hp = clamp(user.hp - damage, 0, user.maxHp);
      xp = randomInt(20, 55);
      user.losses += 1;
    }
    const leveled = addXp(user, xp);
    await saveGameUser(client, guildId, userId, user);
    return { success: true, user, monster, win, reward, xp, damage, leveled, visual: buildAttachment({ title: win ? 'Victory!' : 'Defeated!', subtitle: `${monster.emoji} ${monster.name}`, emoji: win ? '⚔️' : '💥', colorA: win ? '#22C55E' : '#EF4444', stat: win ? `+${money(reward)} • XP +${xp}` : `Damage ${damage} • XP +${xp}`, footer: formatLevelLine(user) }, 'adventure-fight.svg') };
  }

  static async adventureHeal(client, guildId, userId) {
    const user = await getGameUser(client, guildId, userId);
    let message = '';
    if ((user.inventory.potion || 0) > 0 && user.hp < user.maxHp) {
      user.inventory.potion -= 1;
      const healed = Math.min(user.maxHp - user.hp, 70 + user.level * 4);
      user.hp = clamp(user.hp + healed, 0, user.maxHp);
      message = `Kamu memakai **Potion** dan memulihkan **${Math.round(healed)} HP**.`;
    } else if ((user.inventory.revive || 0) > 0 && user.hp <= 0) {
      user.inventory.revive -= 1;
      user.hp = Math.floor(user.maxHp * 0.75);
      user.energy = 60;
      message = 'Kamu memakai **Revive** dan bangkit kembali.';
    } else {
      const cost = Math.max(250, user.level * 140);
      const charged = await chargeWallet(client, guildId, userId, cost);
      if (!charged.success) return charged;
      user.hp = user.maxHp;
      user.energy = 100;
      message = `Kamu beristirahat di inn seharga **${money(cost)}**. HP dan energy penuh.`;
    }
    await saveGameUser(client, guildId, userId, user);
    return { success: true, user, message };
  }

  static async adventureLeaderboard(client, guildId) {
    const rows = await listDb(client, `gamepack:${guildId}:user:`);
    const users = rows.map(row => ({ userId: String(row.key || '').split(':').pop(), ...normalizeGameUser(row.value) }))
      .sort((a, b) => (b.level - a.level) || (b.wins - a.wins) || (b.floor - a.floor))
      .slice(0, 10);
    return users;
  }

  static async casinoPlay(client, guildId, userId, game, bet, extra = {}) {
    const amount = Math.floor(Number(bet || 0));
    if (!Number.isSafeInteger(amount) || amount < CASINO_LIMITS.minBet || amount > CASINO_LIMITS.maxBet) {
      return { success: false, message: `Bet harus antara **${money(CASINO_LIMITS.minBet)}** dan **${money(CASINO_LIMITS.maxBet)}**.` };
    }
    const charged = await chargeWallet(client, guildId, userId, amount);
    if (!charged.success) return charged;

    let title = 'Casino';
    let description = '';
    let payout = 0;
    let win = false;
    let emoji = '🎰';

    if (game === 'slot') {
      const icons = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
      const reels = [icons[randomInt(0, icons.length - 1)], icons[randomInt(0, icons.length - 1)], icons[randomInt(0, icons.length - 1)]];
      const allSame = reels[0] === reels[1] && reels[1] === reels[2];
      const twoSame = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];
      payout = allSame ? amount * (reels[0] === '7️⃣' ? 8 : 5) : twoSame ? Math.floor(amount * 1.7) : 0;
      win = payout > 0;
      title = '🎰 Slot Machine';
      description = `${reels.join(' | ')}\n${win ? `Kamu menang **${money(payout)}**!` : 'Tidak kena. Coba lagi nanti.'}`;
      emoji = '🎰';
    } else if (game === 'coinflip') {
      const choice = extra.choice || 'heads';
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      win = choice === result;
      payout = win ? amount * 2 : 0;
      title = '🪙 Coinflip';
      description = `Pilihan: **${choice}** • Hasil: **${result}**\n${win ? `Kamu menang **${money(payout)}**!` : 'Kamu kalah.'}`;
      emoji = '🪙';
    } else if (game === 'roulette') {
      const choice = extra.choice || 'red';
      const colors = ['red', 'black', 'green'];
      const result = Math.random() < 0.06 ? 'green' : colors[randomInt(0, 1)];
      win = choice === result;
      payout = win ? amount * (choice === 'green' ? 14 : 2) : 0;
      title = '🎡 Roulette';
      description = `Pilihan: **${choice}** • Hasil: **${result}**\n${win ? `Kamu menang **${money(payout)}**!` : 'Kamu kalah.'}`;
      emoji = '🎡';
    } else if (game === 'blackjack') {
      const player = randomInt(14, 23);
      const dealer = randomInt(15, 22);
      win = player <= 21 && (dealer > 21 || player > dealer);
      const push = player <= 21 && player === dealer;
      payout = push ? amount : win ? Math.floor(amount * 2.2) : 0;
      title = '🃏 Blackjack Lite';
      description = `Kamu: **${player}** • Dealer: **${dealer}**\n${push ? `Push. Bet balik **${money(payout)}**.` : win ? `Kamu menang **${money(payout)}**!` : 'Kamu kalah.'}`;
      emoji = '🃏';
    } else if (game === 'wheel') {
      const multipliers = [0, 0, 0.5, 1, 1.5, 2, 3, 5];
      const multiplier = multipliers[randomInt(0, multipliers.length - 1)];
      payout = Math.floor(amount * multiplier);
      win = payout > amount;
      title = '🎁 Lucky Wheel';
      description = `Multiplier: **x${multiplier}**\nHasil: **${money(payout)}**.`;
      emoji = '🎁';
    }

    if (payout > 0) await addWallet(client, guildId, userId, payout);
    const eco = await getEconomyData(client, guildId, userId);
    return { success: true, title, description, payout, win, wallet: eco.wallet || 0, visual: buildAttachment({ title, subtitle: description.replace(/\n/g, ' • '), emoji, colorA: win ? '#22C55E' : '#EF4444', stat: payout ? `Payout ${money(payout)}` : `Lost ${money(amount)}`, footer: `Wallet ${money(eco.wallet || 0)}` }, `casino-${game}.svg`) };
  }

  static async getBoss(client, guildId) {
    let boss = await getDb(client, bossKey(guildId), null);
    if (!boss || boss.hp <= 0 || (boss.endsAt && boss.endsAt < now())) {
      const base = BOSS_POOL[randomInt(0, BOSS_POOL.length - 1)];
      boss = {
        id: `boss_${now().toString(36)}`,
        ...base,
        hp: base.maxHp,
        spawnedAt: now(),
        endsAt: now() + 24 * 60 * 60 * 1000,
        participants: {},
        defeatedBy: null,
      };
      await setDb(client, bossKey(guildId), boss);
    }
    return boss;
  }

  static async bossStatus(client, guildId) {
    const boss = await this.getBoss(client, guildId);
    const percent = Math.max(0, Math.round((boss.hp / boss.maxHp) * 100));
    return { success: true, boss, percent, visual: buildAttachment({ title: 'World Boss Event', subtitle: `${boss.emoji} ${boss.name}`, emoji: boss.emoji, colorA: '#DC2626', stat: `HP ${Math.max(0, boss.hp).toLocaleString()} / ${boss.maxHp.toLocaleString()} (${percent}%)`, footer: `Ends <t:${Math.floor(boss.endsAt / 1000)}:R>` }, 'world-boss.svg') };
  }

  static async bossAttack(client, guildId, userId) {
    const user = await getGameUser(client, guildId, userId);
    const cd = cooldown(user.lastBossAttack || 0, BOSS_ATTACK_COOLDOWN);
    if (!cd.ready) return { success: false, message: `Kamu sudah menyerang boss. Coba lagi dalam **${cd.text}**.` };
    const boss = await this.getBoss(client, guildId);
    const damage = randomInt(700, 1500) + (user.level * randomInt(35, 75)) + (user.wins * 3);
    boss.hp = Math.max(0, boss.hp - damage);
    boss.participants[userId] = Math.floor(Number(boss.participants[userId] || 0) + damage);
    user.lastBossAttack = now();
    user.bossDamage += damage;
    let reward = randomInt(350, 900);
    let xp = randomInt(25, 80);
    let defeated = false;
    if (boss.hp <= 0) {
      defeated = true;
      boss.defeatedBy = userId;
      reward += boss.reward;
      xp += boss.xp;
      boss.endsAt = now();
    }
    await addWallet(client, guildId, userId, reward);
    const leveled = addXp(user, xp);
    await saveGameUser(client, guildId, userId, user);
    await setDb(client, bossKey(guildId), boss);
    return { success: true, boss, damage, reward, xp, leveled, defeated, user, visual: buildAttachment({ title: defeated ? 'Boss Defeated!' : 'Boss Attack!', subtitle: `${boss.emoji} ${boss.name}`, emoji: defeated ? '🏆' : '⚔️', colorA: defeated ? '#F59E0B' : '#DC2626', stat: `Damage ${damage.toLocaleString()} • Reward ${money(reward)}`, footer: `Boss HP ${Math.max(0, boss.hp).toLocaleString()} / ${boss.maxHp.toLocaleString()}` }, 'boss-attack.svg') };
  }

  static async bossSpawn(client, guildId) {
    const base = BOSS_POOL[randomInt(0, BOSS_POOL.length - 1)];
    const boss = { id: `boss_${now().toString(36)}`, ...base, hp: base.maxHp, spawnedAt: now(), endsAt: now() + 24 * 60 * 60 * 1000, participants: {}, defeatedBy: null };
    await setDb(client, bossKey(guildId), boss);
    return boss;
  }

  static async tcgDuel(client, guildId, userId, targetId) {
    if (!targetId || userId === targetId) return { success: false, message: 'Pilih lawan player lain.' };
    const getCollection = async (id) => {
      const data = await getDb(client, `tcg:${guildId}:user:${id}`, {});
      const cards = Array.isArray(data?.cards) ? data.cards : [];
      const deckIds = Array.isArray(data?.deck) ? data.deck : [];
      const selected = deckIds.length ? cards.filter(c => deckIds.includes(c.instanceId)) : [...cards].sort((a, b) => (b.power || 0) - (a.power || 0)).slice(0, 5);
      return selected.slice(0, 5);
    };
    const [aDeck, bDeck] = await Promise.all([getCollection(userId), getCollection(targetId)]);
    if (aDeck.length < 1) return { success: false, message: 'Kamu belum punya deck/card TCG. Buka pack dan buat deck dulu.' };
    if (bDeck.length < 1) return { success: false, message: 'Lawan belum punya deck/card TCG.' };
    const score = (cards) => cards.reduce((sum, c) => sum + (Number(c.power) || (Number(c.hp || 0) * 0.3 + Number(c.attack || 0) * 1.2 + Number(c.defense || 0) * 0.8)), 0) + randomInt(0, 90);
    const aScore = Math.round(score(aDeck));
    const bScore = Math.round(score(bDeck));
    const win = aScore >= bScore;
    const reward = win ? randomInt(900, 2400) : randomInt(150, 450);
    await addWallet(client, guildId, userId, reward);
    return { success: true, win, aScore, bScore, reward, aDeck, bDeck, visual: buildAttachment({ title: 'TCG PvP Duel', subtitle: win ? 'Victory!' : 'Defeat!', emoji: win ? '🃏' : '💢', colorA: win ? '#7C3AED' : '#EF4444', stat: `${aScore.toLocaleString()} vs ${bScore.toLocaleString()}`, footer: `Reward ${money(reward)}` }, 'tcg-duel.svg') };
  }

  static async petDuel(client, guildId, userId, targetId = null) {
    const getActivePet = async (id) => {
      const data = await getDb(client, `tamagotchi:${guildId}:user:${id}`, {});
      const pets = Array.isArray(data?.pets) ? data.pets : [];
      const activeId = data?.activePetId || pets[0]?.id;
      return pets.find(p => p.id === activeId) || null;
    };
    const userPet = await getActivePet(userId);
    if (!userPet) return { success: false, message: 'Kamu belum punya pet aktif. Beli/adopt pet dulu di Tamagotchi.' };
    const enemyPet = targetId ? await getActivePet(targetId) : { nickname: 'Arena Bot', speciesId: 'bot', hunger: 80, happiness: 80, energy: 80, health: 90, xp: randomInt(100, 900) };
    if (!enemyPet) return { success: false, message: 'Lawan belum punya pet aktif.' };
    const petScore = (pet) => Math.round((Number(pet.health || 50) * 1.2) + (Number(pet.energy || 50) * 0.8) + (Number(pet.happiness || 50) * 0.5) + Math.sqrt(Number(pet.xp || 0)) * 10 + randomInt(0, 80));
    const aScore = petScore(userPet);
    const bScore = petScore(enemyPet);
    const win = aScore >= bScore;
    const reward = win ? randomInt(700, 1900) : randomInt(120, 350);
    await addWallet(client, guildId, userId, reward);
    return { success: true, win, aScore, bScore, userPet, enemyPet, reward, visual: buildAttachment({ title: 'Pet Arena', subtitle: win ? 'Pet kamu menang!' : 'Pet kamu kalah!', emoji: win ? '🐾' : '😵', colorA: win ? '#10B981' : '#EF4444', stat: `${aScore.toLocaleString()} vs ${bScore.toLocaleString()}`, footer: `Reward ${money(reward)}` }, 'pet-arena.svg') };
  }

  static async fishCast(client, guildId, userId) {
    const data = await getFishUser(client, guildId, userId);
    const cd = cooldown(data.lastCast || 0, FISH_COOLDOWN);
    if (!cd.ready) return { success: false, message: `Spot mancing masih sepi. Coba lagi dalam **${cd.text}**.` };
    if (data.bait <= 0) return { success: false, message: 'Bait kamu habis. Beli lewat `/fish shop` lalu `/fish buybait`.' };
    data.bait -= 1;
    data.lastCast = now();
    const bonus = Math.max(0, data.rodLevel - 1) * 0.04;
    const catalog = FISH_CATALOG.map(f => ({ ...f, weight: f.weight * (f.rarity === 'Epic' || f.rarity === 'Legendary' ? 1 + bonus : 1) }));
    const caught = pickWeighted(catalog);
    const amount = Math.random() < (0.08 + data.rodLevel * 0.015) ? 2 : 1;
    data.inventory[caught.id] = (data.inventory[caught.id] || 0) + amount;
    data.stats.caught += amount;
    if (caught.rarity === 'Legendary') data.stats.legendary += amount;
    await saveFishUser(client, guildId, userId, data);
    return { success: true, data, caught, amount, visual: buildAttachment({ title: 'Fishing Game', subtitle: `Kamu menangkap ${caught.name} x${amount}`, emoji: caught.emoji, colorA: '#0EA5E9', stat: `${caught.rarity} catch!`, footer: `Rod Lv.${data.rodLevel} • Bait ${data.bait}` }, 'fish-catch.svg') };
  }

  static async fishSell(client, guildId, userId) {
    const data = await getFishUser(client, guildId, userId);
    const { total, sold } = sellInventoryValue(FISH_CATALOG, data.inventory);
    if (total <= 0) return { success: false, message: 'Inventory ikan kamu kosong.' };
    data.inventory = {};
    data.stats.sold += sold.reduce((a, s) => a + s.amount, 0);
    data.stats.earned += total;
    await addWallet(client, guildId, userId, total);
    await saveFishUser(client, guildId, userId, data);
    return { success: true, total, sold, data };
  }

  static async fishBuyBait(client, guildId, userId, amount = 1) {
    const qty = Math.max(1, Math.min(200, Math.floor(Number(amount || 1))));
    const cost = qty * 75;
    const charged = await chargeWallet(client, guildId, userId, cost);
    if (!charged.success) return charged;
    const data = await getFishUser(client, guildId, userId);
    data.bait += qty;
    await saveFishUser(client, guildId, userId, data);
    return { success: true, qty, cost, data };
  }

  static async fishUpgrade(client, guildId, userId) {
    const data = await getFishUser(client, guildId, userId);
    if (data.rodLevel >= 10) return { success: false, message: 'Fishing rod kamu sudah level maksimal.' };
    const cost = Math.floor(2500 * Math.pow(1.65, data.rodLevel - 1));
    const charged = await chargeWallet(client, guildId, userId, cost);
    if (!charged.success) return charged;
    data.rodLevel += 1;
    await saveFishUser(client, guildId, userId, data);
    return { success: true, cost, data };
  }

  static async fishLeaderboard(client, guildId) {
    const rows = await listDb(client, `gamepack:${guildId}:fish:`);
    return rows.map(row => ({ userId: String(row.key || '').split(':').pop(), ...normalizeFishUser(row.value) }))
      .sort((a, b) => (b.stats.earned - a.stats.earned) || (b.stats.caught - a.stats.caught)).slice(0, 10);
  }

  static fishPricesText() {
    return FISH_CATALOG.map(f => `${f.emoji} **${f.name}** • ${f.rarity} • Server price: **${money(marketPrice(f, f.id))}**`).join('\n');
  }

  static async fishBag(client, guildId, userId) {
    const data = await getFishUser(client, guildId, userId);
    return { success: true, data, text: inventoryText(FISH_CATALOG, data.inventory) };
  }

  static async mineDig(client, guildId, userId) {
    const data = await getMineUser(client, guildId, userId);
    const cd = cooldown(data.lastDig || 0, MINE_COOLDOWN);
    if (!cd.ready) return { success: false, message: `Tambang masih cooldown. Coba lagi dalam **${cd.text}**.` };
    if (data.durability <= 0) return { success: false, message: 'Pickaxe kamu rusak. Repair lewat `/mine repair`.' };
    data.lastDig = now();
    data.durability = clamp(data.durability - randomInt(6, 14), 0, 100);
    const bonus = Math.max(0, data.pickaxeLevel - 1) * 0.05;
    const catalog = ORE_CATALOG.map(o => ({ ...o, weight: o.weight * (o.rarity === 'Epic' || o.rarity === 'Legendary' ? 1 + bonus : 1) }));
    const ore = pickWeighted(catalog);
    const amount = Math.random() < (0.1 + data.pickaxeLevel * 0.018) ? randomInt(2, 3) : 1;
    data.inventory[ore.id] = (data.inventory[ore.id] || 0) + amount;
    data.stats.mined += amount;
    if (ore.rarity === 'Legendary') data.stats.legendary += amount;
    await saveMineUser(client, guildId, userId, data);
    return { success: true, data, ore, amount, visual: buildAttachment({ title: 'Mining Game', subtitle: `Kamu mendapatkan ${ore.name} x${amount}`, emoji: ore.emoji, colorA: '#92400E', stat: `${ore.rarity} ore!`, footer: `Pickaxe Lv.${data.pickaxeLevel} • Durability ${Math.round(data.durability)}%` }, 'mine-dig.svg') };
  }

  static async mineSell(client, guildId, userId) {
    const data = await getMineUser(client, guildId, userId);
    const { total, sold } = sellInventoryValue(ORE_CATALOG, data.inventory);
    if (total <= 0) return { success: false, message: 'Inventory ore kamu kosong.' };
    data.inventory = {};
    data.stats.sold += sold.reduce((a, s) => a + s.amount, 0);
    data.stats.earned += total;
    await addWallet(client, guildId, userId, total);
    await saveMineUser(client, guildId, userId, data);
    return { success: true, total, sold, data };
  }

  static async mineRepair(client, guildId, userId) {
    const data = await getMineUser(client, guildId, userId);
    if (data.durability >= 100) return { success: false, message: 'Pickaxe kamu masih full durability.' };
    const cost = Math.max(350, Math.round((100 - data.durability) * (20 + data.pickaxeLevel * 9)));
    const charged = await chargeWallet(client, guildId, userId, cost);
    if (!charged.success) return charged;
    data.durability = 100;
    await saveMineUser(client, guildId, userId, data);
    return { success: true, cost, data };
  }

  static async mineUpgrade(client, guildId, userId) {
    const data = await getMineUser(client, guildId, userId);
    if (data.pickaxeLevel >= 10) return { success: false, message: 'Pickaxe kamu sudah level maksimal.' };
    const cost = Math.floor(3200 * Math.pow(1.7, data.pickaxeLevel - 1));
    const charged = await chargeWallet(client, guildId, userId, cost);
    if (!charged.success) return charged;
    data.pickaxeLevel += 1;
    data.durability = 100;
    await saveMineUser(client, guildId, userId, data);
    return { success: true, cost, data };
  }

  static async mineLeaderboard(client, guildId) {
    const rows = await listDb(client, `gamepack:${guildId}:mine:`);
    return rows.map(row => ({ userId: String(row.key || '').split(':').pop(), ...normalizeMineUser(row.value) }))
      .sort((a, b) => (b.stats.earned - a.stats.earned) || (b.stats.mined - a.stats.mined)).slice(0, 10);
  }

  static minePricesText() {
    return ORE_CATALOG.map(o => `${o.emoji} **${o.name}** • ${o.rarity} • Server price: **${money(marketPrice(o, o.id))}**`).join('\n');
  }

  static async mineBag(client, guildId, userId) {
    const data = await getMineUser(client, guildId, userId);
    return { success: true, data, text: inventoryText(ORE_CATALOG, data.inventory) };
  }
}

export default GamePackService;
