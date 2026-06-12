import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor } from '../config/bot.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../utils/database.js';
import { logger } from '../utils/logger.js';

const DEFAULT_BOOSTER_MESSAGE = '✨ Terima kasih {user} sudah boost **{server}**! Sekarang server punya **{boostCount} boost** dan berada di **Level {boostLevel}**.';
const DEFAULT_BOOSTER_COLOR = '#F47FFF';
const DUPLICATE_WINDOW_MS = 30_000;

export function getDefaultBoosterConfig() {
  return {
    enabled: false,
    channelId: null,
    message: DEFAULT_BOOSTER_MESSAGE,
    ping: true,
    image: null,
    color: DEFAULT_BOOSTER_COLOR,
    rewardRoleId: null,
    showVisual: true,
    setupBy: null,
    setupAt: null,
    updatedAt: null
  };
}

function normalizeBoosterConfig(raw = {}) {
  const base = typeof raw === 'object' && raw !== null ? raw : {};
  const defaults = getDefaultBoosterConfig();

  return {
    ...defaults,
    ...base,
    enabled: Boolean(base.enabled),
    channelId: base.channelId ?? null,
    message: typeof base.message === 'string' && base.message.trim().length > 0
      ? base.message
      : defaults.message,
    ping: base.ping ?? defaults.ping,
    image: base.image ?? null,
    color: base.color || defaults.color,
    rewardRoleId: base.rewardRoleId ?? null,
    showVisual: base.showVisual ?? defaults.showVisual
  };
}

export async function getBoosterConfig(client, guildId) {
  const welcomeConfig = await getWelcomeConfig(client, guildId);
  return normalizeBoosterConfig(welcomeConfig?.booster);
}

export async function updateBoosterConfig(client, guildId, updates = {}) {
  const current = await getBoosterConfig(client, guildId);
  const next = normalizeBoosterConfig({
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  });

  await updateWelcomeConfig(client, guildId, { booster: next });
  return next;
}

export function validateBoosterImageUrl(url) {
  if (!url) return true;

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/([*_`~|])/g, '\\$1');
}

function getBoostLevel(guild) {
  const tier = guild?.premiumTier ?? 0;
  if (typeof tier === 'number') return tier;
  const normalized = String(tier).toLowerCase();
  if (normalized.includes('tier3')) return 3;
  if (normalized.includes('tier2')) return 2;
  if (normalized.includes('tier1')) return 1;
  return 0;
}

export function formatBoosterMessage(template, member) {
  const guild = member.guild;
  const user = member.user;
  const boostCount = guild.premiumSubscriptionCount ?? 0;
  const boostLevel = getBoostLevel(guild);

  const replacements = {
    '{user}': user.toString(),
    '{user.mention}': user.toString(),
    '{user.tag}': user.tag,
    '{user.username}': user.username,
    '{username}': user.username,
    '{user.id}': user.id,
    '{server}': guild.name,
    '{server.name}': guild.name,
    '{guild.name}': guild.name,
    '{guild.id}': guild.id,
    '{memberCount}': String(guild.memberCount ?? 0),
    '{membercount}': String(guild.memberCount ?? 0),
    '{boostCount}': String(boostCount),
    '{boostcount}': String(boostCount),
    '{boostLevel}': String(boostLevel),
    '{boostlevel}': String(boostLevel),
    '{tier}': String(boostLevel),
    '{premiumTier}': String(boostLevel)
  };

  let output = template || DEFAULT_BOOSTER_MESSAGE;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(String(value));
  }
  return output;
}

function createBoosterSvg(member, config) {
  const guild = member.guild;
  const user = member.user;
  const username = escapeXml(user.username || 'Booster');
  const guildName = escapeXml(guild.name || 'Server');
  const boosts = escapeXml(guild.premiumSubscriptionCount ?? 0);
  const level = escapeXml(getBoostLevel(guild));
  const initials = escapeXml((user.username || 'B').slice(0, 2).toUpperCase());
  const color = /^#[0-9A-F]{6}$/i.test(config.color || '') ? config.color : DEFAULT_BOOSTER_COLOR;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="360" viewBox="0 0 960 360">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#17071f"/>
      <stop offset="45%" stop-color="#331044"/>
      <stop offset="100%" stop-color="#090b18"/>
    </linearGradient>
    <radialGradient id="glow" cx="52%" cy="45%" r="65%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.65"/>
      <stop offset="55%" stop-color="${color}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="softGlow">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <style>
      .float { animation: float 2.4s ease-in-out infinite; transform-origin: center; }
      .pulse { animation: pulse 1.8s ease-in-out infinite; transform-origin: center; }
      .spark { animation: sparkle 1.4s ease-in-out infinite; transform-origin: center; }
      @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
      @keyframes pulse { 0%,100% { opacity: .72; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
      @keyframes sparkle { 0%,100% { opacity: .25; transform: scale(.8) rotate(0deg); } 50% { opacity: 1; transform: scale(1.15) rotate(16deg); } }
      text { font-family: Inter, Arial, Helvetica, sans-serif; }
    </style>
  </defs>

  <rect width="960" height="360" rx="34" fill="url(#bg)"/>
  <rect width="960" height="360" rx="34" fill="url(#glow)"/>
  <rect x="18" y="18" width="924" height="324" rx="28" fill="none" stroke="${color}" stroke-opacity="0.55" stroke-width="3"/>

  <g opacity="0.45">
    <circle class="pulse" cx="785" cy="78" r="55" fill="${color}"/>
    <circle class="pulse" cx="875" cy="260" r="34" fill="#ffffff" opacity="0.22"/>
    <circle class="pulse" cx="110" cy="285" r="42" fill="${color}" opacity="0.35"/>
  </g>

  <g class="float" filter="url(#softGlow)">
    <circle cx="180" cy="174" r="82" fill="#ffffff" opacity="0.1"/>
    <circle cx="180" cy="174" r="72" fill="${color}" opacity="0.86"/>
    <circle cx="180" cy="174" r="61" fill="#1a0c25" opacity="0.82"/>
    <text x="180" y="196" fill="#fff" font-size="52" font-weight="900" text-anchor="middle">${initials}</text>
  </g>

  <g class="spark" filter="url(#softGlow)">
    <text x="116" y="83" font-size="42" fill="#fff">✦</text>
    <text x="810" y="118" font-size="38" fill="#fff">✧</text>
    <text x="760" y="292" font-size="30" fill="#fff">✦</text>
    <text x="296" y="64" font-size="28" fill="#fff">✧</text>
  </g>

  <text x="300" y="112" fill="#ffffff" font-size="30" font-weight="800" letter-spacing="3">SERVER BOOSTER</text>
  <text x="300" y="168" fill="#ffffff" font-size="56" font-weight="900">${username}</text>
  <text x="302" y="210" fill="#e7d7ff" font-size="25" font-weight="600">Terima kasih sudah boost ${guildName}</text>

  <g>
    <rect x="300" y="246" width="168" height="56" rx="18" fill="#ffffff" opacity="0.1" stroke="#ffffff" stroke-opacity="0.17"/>
    <text x="326" y="269" fill="#e7d7ff" font-size="17" font-weight="700">BOOSTS</text>
    <text x="326" y="295" fill="#ffffff" font-size="26" font-weight="900">${boosts}</text>

    <rect x="492" y="246" width="168" height="56" rx="18" fill="#ffffff" opacity="0.1" stroke="#ffffff" stroke-opacity="0.17"/>
    <text x="518" y="269" fill="#e7d7ff" font-size="17" font-weight="700">LEVEL</text>
    <text x="518" y="295" fill="#ffffff" font-size="26" font-weight="900">${level}</text>
  </g>
</svg>`;
}

async function assignRewardRole(member, config) {
  if (!config.rewardRoleId) return null;

  try {
    const role = member.guild.roles.cache.get(config.rewardRoleId);
    if (!role) return { ok: false, reason: 'Role tidak ditemukan' };
    if (member.roles.cache.has(role.id)) return { ok: true, reason: 'Member sudah punya role' };

    const me = member.guild.members.me;
    const canManage = me?.permissions?.has(PermissionFlagsBits.ManageRoles) && role.editable;
    if (!canManage) return { ok: false, reason: 'Bot tidak bisa manage role tersebut' };

    await member.roles.add(role, 'Server booster reward role');
    return { ok: true, reason: `Role ${role.name} diberikan` };
  } catch (error) {
    logger.warn('[Booster] Failed to assign reward role:', error);
    return { ok: false, reason: error.message };
  }
}

async function isDuplicateBoostEvent(client, guildId, userId) {
  if (!client?.db) return false;

  const key = `guild:${guildId}:booster:last:${userId}`;
  const now = Date.now();
  const previous = Number(await client.db.get(key, 0)) || 0;

  if (now - previous < DUPLICATE_WINDOW_MS) {
    return true;
  }

  await client.db.set(key, now);
  return false;
}

async function saveBoosterStats(client, guildId, userId) {
  if (!client?.db) return;

  try {
    await client.db.increment(`guild:${guildId}:booster:stats:total`, 1);
    await client.db.increment(`guild:${guildId}:booster:stats:user:${userId}`, 1);
  } catch (error) {
    logger.debug('[Booster] Failed to save booster stats:', error);
  }
}

export async function sendBoosterAnnouncement(member, options = {}) {
  const { force = false, test = false } = options;
  const guild = member.guild;
  const client = member.client;
  const config = await getBoosterConfig(client, guild.id);

  if (!force && !config.enabled) {
    return { sent: false, reason: 'disabled' };
  }

  if (!config.channelId) {
    return { sent: false, reason: 'missing_channel' };
  }

  if (!test && await isDuplicateBoostEvent(client, guild.id, member.id)) {
    return { sent: false, reason: 'duplicate' };
  }

  const channel = guild.channels.cache.get(config.channelId)
    || await guild.channels.fetch(config.channelId).catch(() => null);

  if (!channel?.isTextBased?.()) {
    return { sent: false, reason: 'invalid_channel' };
  }

  const me = guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    return { sent: false, reason: 'missing_permissions' };
  }

  const message = formatBoosterMessage(config.message, member);
  const content = config.ping ? member.user.toString() : null;
  const canEmbed = permissions.has(PermissionFlagsBits.EmbedLinks);
  const canAttach = permissions.has(PermissionFlagsBits.AttachFiles);
  const roleResult = test ? null : await assignRewardRole(member, config);

  if (!canEmbed) {
    await channel.send({ content: content ? `${content}\n${message}` : message });
    if (!test) await saveBoosterStats(client, guild.id, member.id);
    return { sent: true, reason: 'plain' };
  }

  const embedColor = /^#[0-9A-F]{6}$/i.test(config.color || '') ? config.color : getColor('fuchsia');
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('💎 New Server Booster!')
    .setDescription(message)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 Booster', value: `${escapeMarkdown(member.user.tag)}\n${member.user.toString()}`, inline: true },
      { name: '💎 Total Boost', value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
      { name: '🚀 Boost Level', value: `Level ${getBoostLevel(guild)}`, inline: true }
    )
    .setFooter({ text: test ? 'Booster test preview' : `Thank you for supporting ${guild.name}` })
    .setTimestamp();

  if (roleResult?.ok) {
    embed.addFields({ name: '🎁 Reward', value: roleResult.reason, inline: false });
  }

  if (config.image) {
    embed.setImage(config.image);
    await channel.send({ content, embeds: [embed] });
  } else if (config.showVisual && canAttach) {
    const svg = createBoosterSvg(member, config);
    const attachment = new AttachmentBuilder(Buffer.from(svg, 'utf8'), { name: 'booster-welcome.svg' });
    embed.setImage('attachment://booster-welcome.svg');
    await channel.send({ content, embeds: [embed], files: [attachment] });
  } else {
    await channel.send({ content, embeds: [embed] });
  }

  if (!test) await saveBoosterStats(client, guild.id, member.id);
  return { sent: true, reason: 'embed' };
}

export async function handleMemberBoostUpdate(oldMember, newMember) {
  const oldBoostTime = oldMember?.premiumSinceTimestamp ?? oldMember?.premiumSince?.getTime?.() ?? null;
  const newBoostTime = newMember?.premiumSinceTimestamp ?? newMember?.premiumSince?.getTime?.() ?? null;

  const startedBoosting = !oldBoostTime && Boolean(newBoostTime);
  const boostTimestampChanged = Boolean(oldBoostTime && newBoostTime && oldBoostTime !== newBoostTime);

  if (!startedBoosting && !boostTimestampChanged) {
    return { sent: false, reason: 'not_boost_start' };
  }

  return await sendBoosterAnnouncement(newMember);
}

export function buildBoosterConfigSummary(config) {
  const normalized = normalizeBoosterConfig(config);
  return [
    `Status: ${normalized.enabled ? '✅ Enabled' : '❌ Disabled'}`,
    `Channel: ${normalized.channelId ? `<#${normalized.channelId}>` : 'Belum diset'}`,
    `Ping Booster: ${normalized.ping ? '✅ Ya' : '❌ Tidak'}`,
    `Visual: ${normalized.showVisual ? '✅ Aktif' : '❌ Nonaktif'}`,
    `Reward Role: ${normalized.rewardRoleId ? `<@&${normalized.rewardRoleId}>` : 'Tidak ada'}`,
    `Image Custom: ${normalized.image ? '✅ Ada' : '❌ Tidak ada'}`
  ].join('\n');
}
