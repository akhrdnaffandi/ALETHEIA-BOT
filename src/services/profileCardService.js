import { AttachmentBuilder } from 'discord.js';
import { getEconomyData, getMaxBankCapacity } from '../utils/economy.js';
import { getUserLevelData, getXpForLevel } from './leveling.js';
import { PremiumMembershipService } from './premiumMembershipService.js';
import { logger } from '../utils/logger.js';

const DEFAULT_PROFILE = {
  title: '',
  bio: 'Belum ada bio. Gunakan /profile edit untuk mengatur bio.',
  color: '#5865F2',
  favorite: '',
  showBalance: true,
  showPremium: true,
  updatedAt: 0
};

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeText(value, max = 80, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : fallback;
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeHexColor(value, fallback = DEFAULT_PROFILE.color) {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  if (/^[0-9A-Fa-f]{6}$/.test(color)) return `#${color}`;
  return fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function normalizeProfile(raw = {}) {
  return {
    title: safeText(raw.title, 48, DEFAULT_PROFILE.title),
    bio: safeText(raw.bio, 160, DEFAULT_PROFILE.bio),
    color: normalizeHexColor(raw.color, DEFAULT_PROFILE.color),
    favorite: safeText(raw.favorite, 48, DEFAULT_PROFILE.favorite),
    showBalance: raw.showBalance !== false,
    showPremium: raw.showPremium !== false,
    updatedAt: safeNumber(raw.updatedAt, 0)
  };
}

function progressBarValue(current, max) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(1, current / max));
}

function formatCompact(number) {
  const value = safeNumber(number, 0);
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function getReadableJoinDate(member) {
  if (!member?.joinedTimestamp) return 'Unknown';
  return new Date(member.joinedTimestamp).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function splitBioLines(text, maxChars = 44, maxLines = 3) {
  const words = safeText(text, 160, '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === 0) lines.push('Belum ada bio.');
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return lines;
}

export class ProfileCardService {
  static getProfileKey(guildId, userId) {
    return `profileCard:${guildId}:${userId}`;
  }

  static normalizeProfile(raw = {}) {
    return normalizeProfile(raw);
  }

  static async getProfile(client, guildId, userId) {
    const stored = await client.db.get(this.getProfileKey(guildId, userId), null).catch(() => null);
    return normalizeProfile(stored || {});
  }

  static async updateProfile(client, guildId, userId, updates = {}) {
    const current = await this.getProfile(client, guildId, userId);
    const next = normalizeProfile({ ...current, ...updates, updatedAt: Date.now() });
    await client.db.set(this.getProfileKey(guildId, userId), next);
    return next;
  }

  static async resetProfile(client, guildId, userId) {
    await client.db.delete(this.getProfileKey(guildId, userId));
    return normalizeProfile({});
  }

  static getBadges({ member, levelData, economyData, premiumStatus }) {
    const badges = [];
    if (premiumStatus?.active) badges.push(`${premiumStatus.tier?.emoji || '⭐'} ${premiumStatus.tier?.badge || 'Premium'}`);
    if (member?.premiumSinceTimestamp) badges.push('💎 Booster');
    if ((levelData?.level || 0) >= 50) badges.push('👑 Level 50+');
    else if ((levelData?.level || 0) >= 25) badges.push('🏆 Level 25+');
    else if ((levelData?.level || 0) >= 10) badges.push('⚡ Level 10+');
    const totalMoney = safeNumber(economyData?.wallet) + safeNumber(economyData?.bank);
    if (totalMoney >= 1_000_000) badges.push('💰 Millionaire');
    else if (totalMoney >= 100_000) badges.push('💵 Rich');
    if (member?.permissions?.has?.('ManageGuild')) badges.push('🛡️ Staff');
    return badges.slice(0, 5);
  }

  static async collectProfileData(client, guild, targetUser) {
    const guildId = guild.id;
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    const [profile, economyData, levelData, premiumStatus] = await Promise.all([
      this.getProfile(client, guildId, targetUser.id),
      getEconomyData(client, guildId, targetUser.id),
      getUserLevelData(client, guildId, targetUser.id).catch((error) => {
        logger.warn('[PROFILE] Failed to load leveling data:', error?.message || error);
        return { level: 0, xp: 0, totalXp: 0 };
      }),
      PremiumMembershipService.getStatus(client, guild, targetUser.id).catch((error) => {
        logger.warn('[PROFILE] Failed to load premium status:', error?.message || error);
        return { active: false, tier: null, source: 'none' };
      })
    ]);

    const safeLevel = {
      level: safeNumber(levelData?.level, 0),
      xp: safeNumber(levelData?.xp, 0),
      totalXp: safeNumber(levelData?.totalXp, 0)
    };
    const xpNeeded = Math.max(1, safeNumber(getXpForLevel(safeLevel.level + 1), 100));
    const maxBank = getMaxBankCapacity(economyData);
    const badges = this.getBadges({ member, levelData: safeLevel, economyData, premiumStatus });

    return {
      user: targetUser,
      member,
      profile,
      economy: {
        wallet: safeNumber(economyData?.wallet, 0),
        bank: safeNumber(economyData?.bank, 0),
        total: safeNumber(economyData?.wallet, 0) + safeNumber(economyData?.bank, 0),
        maxBank: safeNumber(maxBank, 10000)
      },
      level: {
        ...safeLevel,
        xpNeeded,
        progress: progressBarValue(safeLevel.xp, xpNeeded)
      },
      premium: premiumStatus,
      badges,
      joinedAt: getReadableJoinDate(member)
    };
  }

  static buildProfileSvg(data) {
    const accent = normalizeHexColor(data.profile.color, DEFAULT_PROFILE.color);
    const username = escapeXml(safeText(data.member?.displayName || data.user.username, 26, 'Unknown'));
    const tag = escapeXml(`@${data.user.username}`);
    const title = escapeXml(safeText(data.profile.title || (data.premium.active ? data.premium.tier?.badge : 'Community Member'), 42, 'Community Member'));
    const favorite = escapeXml(safeText(data.profile.favorite || 'Belum dipilih', 38, 'Belum dipilih'));
    const avatar = escapeXml(data.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }));
    const levelProgress = Math.round(data.level.progress * 100);
    const xpWidth = Math.round(330 * data.level.progress);
    const bankProgress = progressBarValue(data.economy.bank, data.economy.maxBank);
    const bankWidth = Math.round(330 * bankProgress);
    const premiumText = data.premium.active
      ? `${data.premium.tier?.emoji || '⭐'} ${data.premium.tier?.name || 'Premium'} • ${data.premium.expiresAt ? 'Active' : 'Lifetime'}`
      : 'Free Member';
    const premiumColor = data.premium.active ? (data.premium.tier?.color || '#FEE75C') : '#8A8F98';
    const bioLines = splitBioLines(data.profile.bio, 48, 3)
      .map((line, index) => `<text x="300" y="${282 + index * 25}" fill="#DDE2EE" font-size="17" font-family="Arial, sans-serif">${escapeXml(line)}</text>`)
      .join('\n');
    const badgeNodes = (data.badges.length ? data.badges : ['🌱 New Member'])
      .slice(0, 5)
      .map((badge, index) => {
        const x = 300 + (index % 2) * 210;
        const y = 360 + Math.floor(index / 2) * 42;
        return `
          <rect x="${x}" y="${y}" width="190" height="30" rx="15" fill="#232937" stroke="#3B4358" stroke-width="1"/>
          <text x="${x + 14}" y="${y + 20}" fill="#FFFFFF" font-size="14" font-family="Arial, sans-serif">${escapeXml(safeText(badge, 22, 'Badge'))}</text>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="900" height="520" viewBox="0 0 900 520" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0D111B"/>
      <stop offset="50%" stop-color="#151B2C"/>
      <stop offset="100%" stop-color="#070A10"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.55"/>
    </linearGradient>
    <clipPath id="avatarClip"><circle cx="145" cy="145" r="82"/></clipPath>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="900" height="520" rx="32" fill="url(#bg)"/>
  <circle cx="810" cy="65" r="150" fill="${accent}" opacity="0.16"/>
  <circle cx="75" cy="485" r="180" fill="${accent}" opacity="0.10"/>
  <rect x="28" y="28" width="844" height="464" rx="26" fill="#111827" opacity="0.78" stroke="#2A3348" stroke-width="2"/>
  <rect x="28" y="28" width="844" height="7" rx="4" fill="url(#accent)"/>

  <circle cx="145" cy="145" r="92" fill="none" stroke="${accent}" stroke-width="6" filter="url(#glow)"/>
  <circle cx="145" cy="145" r="86" fill="#202638"/>
  <image x="63" y="63" width="164" height="164" href="${avatar}" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>

  <text x="270" y="88" fill="#FFFFFF" font-size="34" font-weight="800" font-family="Arial, sans-serif">${username}</text>
  <text x="272" y="119" fill="#9EA7B8" font-size="17" font-family="Arial, sans-serif">${tag}</text>
  <text x="272" y="154" fill="${accent}" font-size="18" font-weight="700" font-family="Arial, sans-serif">${title}</text>

  <rect x="635" y="70" width="200" height="42" rx="21" fill="#202638" stroke="${premiumColor}" stroke-width="1.5"/>
  <text x="654" y="97" fill="#FFFFFF" font-size="16" font-weight="700" font-family="Arial, sans-serif">${escapeXml(safeText(premiumText, 26, 'Free Member'))}</text>

  <g>
    <rect x="64" y="270" width="170" height="68" rx="18" fill="#171E2D" stroke="#2A3348"/>
    <text x="87" y="296" fill="#9EA7B8" font-size="15" font-family="Arial, sans-serif">LEVEL</text>
    <text x="87" y="324" fill="#FFFFFF" font-size="26" font-weight="800" font-family="Arial, sans-serif">${data.level.level}</text>
  </g>
  <g>
    <rect x="64" y="352" width="170" height="68" rx="18" fill="#171E2D" stroke="#2A3348"/>
    <text x="87" y="378" fill="#9EA7B8" font-size="15" font-family="Arial, sans-serif">TOTAL CASH</text>
    <text x="87" y="406" fill="#FFFFFF" font-size="25" font-weight="800" font-family="Arial, sans-serif">$${formatCompact(data.economy.total)}</text>
  </g>

  <text x="300" y="205" fill="#9EA7B8" font-size="15" font-family="Arial, sans-serif">XP PROGRESS • ${levelProgress}%</text>
  <rect x="300" y="218" width="330" height="16" rx="8" fill="#232937"/>
  <rect x="300" y="218" width="${xpWidth}" height="16" rx="8" fill="url(#accent)"/>
  <text x="646" y="232" fill="#DDE2EE" font-size="14" font-family="Arial, sans-serif">${formatCompact(data.level.xp)} / ${formatCompact(data.level.xpNeeded)}</text>

  <text x="300" y="257" fill="#9EA7B8" font-size="15" font-family="Arial, sans-serif">BIO</text>
  ${bioLines}

  <text x="300" y="349" fill="#9EA7B8" font-size="15" font-family="Arial, sans-serif">BADGES</text>
  ${badgeNodes}

  <g>
    <text x="650" y="205" fill="#9EA7B8" font-size="15" font-family="Arial, sans-serif">BANK</text>
    <rect x="650" y="218" width="160" height="16" rx="8" fill="#232937"/>
    <rect x="650" y="218" width="${Math.min(160, Math.round(160 * bankProgress))}" height="16" rx="8" fill="#42B883"/>
    <text x="650" y="257" fill="#FFFFFF" font-size="20" font-weight="700" font-family="Arial, sans-serif">$${formatCompact(data.economy.bank)}</text>
    <text x="650" y="282" fill="#9EA7B8" font-size="13" font-family="Arial, sans-serif">Max: $${formatCompact(data.economy.maxBank)}</text>

    <text x="650" y="327" fill="#9EA7B8" font-size="15" font-family="Arial, sans-serif">FAVORITE</text>
    <text x="650" y="354" fill="#FFFFFF" font-size="18" font-weight="700" font-family="Arial, sans-serif">${favorite}</text>

    <text x="650" y="407" fill="#9EA7B8" font-size="15" font-family="Arial, sans-serif">JOINED</text>
    <text x="650" y="434" fill="#FFFFFF" font-size="18" font-weight="700" font-family="Arial, sans-serif">${escapeXml(data.joinedAt)}</text>
  </g>

  <text x="64" y="470" fill="#6F778A" font-size="13" font-family="Arial, sans-serif">Generated by NGABRUT Bot • /profile edit untuk custom title, bio, warna, dan favorite</text>
</svg>`;
  }

  static buildProfileAttachment(data) {
    const svg = this.buildProfileSvg(data);
    const fileName = `profile_${data.user.id}.svg`;
    return new AttachmentBuilder(Buffer.from(svg, 'utf8'), { name: fileName });
  }
}

export default ProfileCardService;
