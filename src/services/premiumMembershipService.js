import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CONFIG = {
  enabled: true,
  roleId: null,
  logChannelId: null,
  defaultDays: 30,
  syncPremiumFarm: true,
  tiers: {
    basic: {
      name: 'Basic',
      emoji: '⭐',
      badge: 'Premium Basic',
      color: '#57F287',
      benefits: ['Premium badge', 'Premium farm access', 'Profile card badge']
    },
    gold: {
      name: 'Gold',
      emoji: '🌟',
      badge: 'Premium Gold',
      color: '#FEE75C',
      benefits: ['Premium badge', 'Premium farm access', 'Bonus profile badge', 'Priority benefits']
    },
    diamond: {
      name: 'Diamond',
      emoji: '💎',
      badge: 'Premium Diamond',
      color: '#9B59B6',
      benefits: ['Premium badge', 'Premium farm access', 'Diamond profile badge', 'Max premium benefits']
    }
  }
};

function safeInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const integer = Math.floor(number);
  return Math.min(max, Math.max(min, integer));
}

function now() {
  return Date.now();
}

function compactUserRecord(record = {}) {
  const expiresAt = safeInt(record.expiresAt, 0, 0);
  return {
    active: record.active !== false,
    tier: ['basic', 'gold', 'diamond'].includes(record.tier) ? record.tier : 'basic',
    startedAt: safeInt(record.startedAt, now(), 0),
    expiresAt,
    addedBy: record.addedBy ? String(record.addedBy) : null,
    updatedAt: safeInt(record.updatedAt, now(), 0),
    note: typeof record.note === 'string' ? record.note.substring(0, 200) : ''
  };
}

function normalizeConfig(raw = {}) {
  const merged = { ...DEFAULT_CONFIG, ...(raw || {}) };
  return {
    enabled: merged.enabled !== false,
    roleId: merged.roleId ? String(merged.roleId) : null,
    logChannelId: merged.logChannelId ? String(merged.logChannelId) : null,
    defaultDays: safeInt(merged.defaultDays, DEFAULT_CONFIG.defaultDays, 0, 3650),
    syncPremiumFarm: merged.syncPremiumFarm !== false,
    tiers: DEFAULT_CONFIG.tiers
  };
}

function formatDate(timestamp) {
  if (!timestamp || timestamp <= 0) return 'Lifetime';
  const seconds = Math.floor(timestamp / 1000);
  return `<t:${seconds}:F> (<t:${seconds}:R>)`;
}

function hasAdminPermission(member) {
  return Boolean(
    member?.permissions?.has?.('Administrator') ||
    member?.permissions?.has?.('ManageGuild')
  );
}

async function tryGetMember(guild, userId) {
  if (!guild || !userId) return null;
  return guild.members.fetch(userId).catch(() => null);
}

export class PremiumMembershipService {
  static getConfigKey(guildId) {
    return `premiumMembership:${guildId}:config`;
  }

  static getUserKey(guildId, userId) {
    return `premiumMembership:${guildId}:user:${userId}`;
  }

  static getUserPrefix(guildId) {
    return `premiumMembership:${guildId}:user:`;
  }

  static getLegacyFarmConfigKey(guildId) {
    return `premiumFarm:${guildId}:config`;
  }

  static hasAdminPermission(member) {
    return hasAdminPermission(member);
  }

  static async getConfig(client, guildId) {
    const stored = await client.db.get(this.getConfigKey(guildId), null).catch(() => null);
    return normalizeConfig(stored);
  }

  static async saveConfig(client, guildId, config) {
    const normalized = normalizeConfig(config);
    await client.db.set(this.getConfigKey(guildId), normalized);
    if (normalized.syncPremiumFarm) {
      await this.syncRoleToPremiumFarm(client, guildId, normalized.roleId).catch((error) => {
        logger.warn('[PREMIUM] Failed to sync role to premium farm:', error?.message || error);
      });
    }
    return normalized;
  }

  static async getUser(client, guildId, userId) {
    const stored = await client.db.get(this.getUserKey(guildId, userId), null).catch(() => null);
    if (!stored) return null;
    return compactUserRecord(stored);
  }

  static async saveUser(client, guildId, userId, record) {
    const normalized = compactUserRecord(record);
    await client.db.set(this.getUserKey(guildId, userId), normalized);
    const config = await this.getConfig(client, guildId);
    if (config.syncPremiumFarm) {
      await this.syncUserToPremiumFarm(client, guildId, userId, normalized).catch((error) => {
        logger.warn('[PREMIUM] Failed to sync user to premium farm:', error?.message || error);
      });
    }
    return normalized;
  }

  static async deleteUser(client, guildId, userId) {
    await client.db.delete(this.getUserKey(guildId, userId));
    const config = await this.getConfig(client, guildId);
    if (config.syncPremiumFarm) {
      await this.removeUserFromPremiumFarm(client, guildId, userId).catch((error) => {
        logger.warn('[PREMIUM] Failed to remove user from premium farm:', error?.message || error);
      });
    }
    return true;
  }

  static calculateExpiry(days, startedAt = now()) {
    const safeDays = safeInt(days, 0, 0, 3650);
    return safeDays > 0 ? startedAt + safeDays * DAY_MS : 0;
  }

  static isRecordActive(record) {
    if (!record || record.active === false) return false;
    return !record.expiresAt || record.expiresAt <= 0 || record.expiresAt > now();
  }

  static getTier(config, tier) {
    const normalized = ['basic', 'gold', 'diamond'].includes(tier) ? tier : 'basic';
    return config?.tiers?.[normalized] || DEFAULT_CONFIG.tiers.basic;
  }

  static async addPremium(client, guild, targetUser, options = {}) {
    const guildId = guild.id;
    const config = await this.getConfig(client, guildId);
    const startedAt = now();
    const days = options.days ?? config.defaultDays;
    const record = await this.saveUser(client, guildId, targetUser.id, {
      active: true,
      tier: options.tier || 'basic',
      startedAt,
      expiresAt: this.calculateExpiry(days, startedAt),
      addedBy: options.addedBy || null,
      updatedAt: startedAt,
      note: options.note || ''
    });

    if (config.roleId) {
      const member = await tryGetMember(guild, targetUser.id);
      if (member && !member.roles.cache.has(config.roleId)) {
        await member.roles.add(config.roleId, 'Premium membership granted').catch((error) => {
          logger.warn(`[PREMIUM] Failed to add premium role to ${targetUser.id}:`, error?.message || error);
        });
      }
    }

    await this.sendLog(client, guild, {
      title: '✅ Premium Added',
      description: `${targetUser} mendapatkan premium **${this.getTier(config, record.tier).name}**.`,
      fields: [
        { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
        { name: 'Expires', value: formatDate(record.expiresAt), inline: true },
        { name: 'Added By', value: options.addedBy ? `<@${options.addedBy}>` : 'Unknown', inline: true }
      ]
    });

    return record;
  }

  static async removePremium(client, guild, targetUser, options = {}) {
    const guildId = guild.id;
    const config = await this.getConfig(client, guildId);
    await this.deleteUser(client, guildId, targetUser.id);

    if (config.roleId) {
      const member = await tryGetMember(guild, targetUser.id);
      if (member?.roles?.cache?.has(config.roleId)) {
        await member.roles.remove(config.roleId, 'Premium membership removed').catch((error) => {
          logger.warn(`[PREMIUM] Failed to remove premium role from ${targetUser.id}:`, error?.message || error);
        });
      }
    }

    await this.sendLog(client, guild, {
      title: '🗑️ Premium Removed',
      description: `${targetUser} dihapus dari premium membership.`,
      fields: [
        { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
        { name: 'Reason', value: options.reason || 'No reason', inline: false },
        { name: 'Removed By', value: options.removedBy ? `<@${options.removedBy}>` : 'Unknown', inline: true }
      ]
    });

    return true;
  }

  static async getStatus(client, guild, userId) {
    const guildId = guild.id;
    const config = await this.getConfig(client, guildId);
    const member = await tryGetMember(guild, userId);
    const record = await this.getUser(client, guildId, userId);
    const legacy = await this.getLegacyPremiumFarmStatus(client, guildId, userId, member);

    const roleActive = Boolean(config.roleId && member?.roles?.cache?.has(config.roleId));
    const recordActive = this.isRecordActive(record);
    const active = config.enabled && (roleActive || recordActive || legacy.active);
    const tierKey = record?.tier || legacy.tier || 'basic';
    const tier = this.getTier(config, tierKey);

    return {
      active,
      enabled: config.enabled,
      tierKey,
      tier,
      record,
      roleActive,
      legacyActive: legacy.active,
      source: recordActive ? 'membership' : roleActive ? 'role' : legacy.active ? 'premium-farm' : 'none',
      expiresAt: record?.expiresAt || legacy.expiresAt || 0,
      member
    };
  }

  static async listPremiumUsers(client, guild, limit = 20) {
    const guildId = guild.id;
    const prefix = this.getUserPrefix(guildId);
    const keys = await client.db.list(prefix).catch(() => []);
    const entries = [];

    for (const key of keys) {
      const userId = key.replace(prefix, '');
      const record = await this.getUser(client, guildId, userId);
      if (!record) continue;
      const status = await this.getStatus(client, guild, userId);
      entries.push({ userId, ...record, activeNow: status.active, source: status.source });
    }

    entries.sort((a, b) => {
      if (a.activeNow !== b.activeNow) return a.activeNow ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    return entries.slice(0, Math.max(1, Math.min(limit, 50)));
  }

  static async setRole(client, guildId, roleId) {
    const config = await this.getConfig(client, guildId);
    config.roleId = roleId || null;
    return this.saveConfig(client, guildId, config);
  }

  static async setLogChannel(client, guildId, channelId) {
    const config = await this.getConfig(client, guildId);
    config.logChannelId = channelId || null;
    return this.saveConfig(client, guildId, config);
  }

  static async setEnabled(client, guildId, enabled) {
    const config = await this.getConfig(client, guildId);
    config.enabled = Boolean(enabled);
    return this.saveConfig(client, guildId, config);
  }

  static async setDefaultDays(client, guildId, days) {
    const config = await this.getConfig(client, guildId);
    config.defaultDays = safeInt(days, config.defaultDays, 0, 3650);
    return this.saveConfig(client, guildId, config);
  }

  static formatDate(timestamp) {
    return formatDate(timestamp);
  }

  static async sendLog(client, guild, payload) {
    try {
      const config = await this.getConfig(client, guild.id);
      if (!config.logChannelId) return false;
      const channel = guild.channels.cache.get(config.logChannelId) || await guild.channels.fetch(config.logChannelId).catch(() => null);
      if (!channel?.isTextBased?.()) return false;
      await channel.send({
        embeds: [{
          title: payload.title,
          description: payload.description,
          color: 0x5865F2,
          fields: payload.fields || [],
          timestamp: new Date().toISOString()
        }]
      }).catch(() => null);
      return true;
    } catch (error) {
      logger.warn('[PREMIUM] Failed to send premium log:', error?.message || error);
      return false;
    }
  }

  static async syncRoleToPremiumFarm(client, guildId, roleId) {
    const key = this.getLegacyFarmConfigKey(guildId);
    const raw = await client.db.get(key, {}).catch(() => ({}));
    if (!raw || typeof raw !== 'object') return false;
    raw.roleId = roleId || raw.roleId || null;
    await client.db.set(key, raw);
    return true;
  }

  static async syncUserToPremiumFarm(client, guildId, userId, record) {
    const key = this.getLegacyFarmConfigKey(guildId);
    const raw = await client.db.get(key, {}).catch(() => ({}));
    const config = raw && typeof raw === 'object' ? raw : {};
    const ids = Array.isArray(config.userIds) ? config.userIds.map(String) : [];
    const id = String(userId);
    if (!ids.includes(id)) ids.push(id);
    config.userIds = ids;
    config.userExpiresAt = config.userExpiresAt && typeof config.userExpiresAt === 'object' ? config.userExpiresAt : {};
    config.userExpiresAt[id] = record.expiresAt || 0;
    await client.db.set(key, config);
    return true;
  }

  static async removeUserFromPremiumFarm(client, guildId, userId) {
    const key = this.getLegacyFarmConfigKey(guildId);
    const raw = await client.db.get(key, {}).catch(() => ({}));
    if (!raw || typeof raw !== 'object') return false;
    const id = String(userId);
    raw.userIds = Array.isArray(raw.userIds) ? raw.userIds.map(String).filter((storedId) => storedId !== id) : [];
    if (raw.userExpiresAt && typeof raw.userExpiresAt === 'object') delete raw.userExpiresAt[id];
    await client.db.set(key, raw);
    return true;
  }

  static async getLegacyPremiumFarmStatus(client, guildId, userId, member = null) {
    const raw = await client.db.get(this.getLegacyFarmConfigKey(guildId), null).catch(() => null);
    if (!raw || typeof raw !== 'object') return { active: false, expiresAt: 0 };
    const id = String(userId);
    const userIds = Array.isArray(raw.userIds) ? raw.userIds.map(String) : [];
    const expiresAt = raw.userExpiresAt?.[id] ? safeInt(raw.userExpiresAt[id], 0) : 0;
    const userActive = userIds.includes(id) && (!expiresAt || expiresAt <= 0 || expiresAt > now());
    const roleActive = Boolean(raw.roleId && member?.roles?.cache?.has(raw.roleId));
    return { active: userActive || roleActive, expiresAt, tier: 'basic' };
  }
}

export default PremiumMembershipService;
