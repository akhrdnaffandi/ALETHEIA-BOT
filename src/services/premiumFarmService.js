import { getEconomyData, setEconomyData, getEconomyKey } from '../utils/economy.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { createEmbed } from '../utils/embeds.js';

const DEFAULT_CONFIG = {
  enabled: true,
  roleId: null,
  logChannelId: null,
  userIds: [],
  userExpiresAt: {},
  cooldownMs: 15 * 60 * 1000,
  minReward: 450,
  maxReward: 1500,
  dailyCooldownMs: 24 * 60 * 60 * 1000,
  dailyMinReward: 2500,
  dailyMaxReward: 7000,
  streakBonusPerClaim: 0.03,
  maxStreakBonus: 0.25,
  boostCost: 7500,
  boostMultiplier: 2,
  boostDurationMs: 30 * 60 * 1000,
  maxBoostInventory: 25
};

const FARM_EVENTS = [
  'menyelesaikan premium farming route',
  'mengumpulkan rare loot dari server farm',
  'menjalankan misi premium economy',
  'menjual hasil farming virtual',
  'mengambil reward dari premium node',
  'mengamankan jackpot kecil dari farm zone',
  'menyelesaikan contract farming premium',
  'menemukan bonus crate di premium zone'
];

function safeInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const integer = Math.floor(number);
  if (!Number.isSafeInteger(integer)) return fallback;
  return Math.min(max, Math.max(min, integer));
}

function safeFloat(value, fallback, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function normalizeStats(stats = {}) {
  return {
    totalClaims: safeInt(stats.totalClaims, 0),
    totalEarned: safeInt(stats.totalEarned, 0),
    streak: safeInt(stats.streak, 0),
    bestReward: safeInt(stats.bestReward, 0),
    lastReward: safeInt(stats.lastReward, 0),
    lastClaimAt: safeInt(stats.lastClaimAt, 0),
    dailyClaims: safeInt(stats.dailyClaims, 0),
    dailyEarned: safeInt(stats.dailyEarned, 0),
    lastDailyReward: safeInt(stats.lastDailyReward, 0),
    lastDailyAt: safeInt(stats.lastDailyAt, 0),
    boosts: safeInt(stats.boosts, 0),
    activeBoostUntil: safeInt(stats.activeBoostUntil, 0),
    lifetimeBoostsUsed: safeInt(stats.lifetimeBoostsUsed, 0)
  };
}

export class PremiumFarmService {
  static getConfigKey(guildId) {
    return `premiumFarm:${guildId}:config`;
  }

  static normalizeConfig(raw = {}) {
    const merged = { ...DEFAULT_CONFIG, ...(raw || {}) };
    const minReward = safeInt(merged.minReward, DEFAULT_CONFIG.minReward, 1, 100000000);
    const maxReward = safeInt(merged.maxReward, DEFAULT_CONFIG.maxReward, 1, 100000000);
    const dailyMinReward = safeInt(merged.dailyMinReward, DEFAULT_CONFIG.dailyMinReward, 1, 100000000);
    const dailyMaxReward = safeInt(merged.dailyMaxReward, DEFAULT_CONFIG.dailyMaxReward, 1, 100000000);

    return {
      enabled: Boolean(merged.enabled),
      roleId: merged.roleId ? String(merged.roleId) : null,
      logChannelId: merged.logChannelId ? String(merged.logChannelId) : null,
      userIds: uniqueStrings(merged.userIds),
      userExpiresAt: typeof merged.userExpiresAt === 'object' && merged.userExpiresAt !== null
        ? Object.fromEntries(
            Object.entries(merged.userExpiresAt)
              .filter(([userId]) => userId)
              .map(([userId, expiresAt]) => [String(userId), expiresAt ? safeInt(expiresAt, 0) : 0])
          )
        : {},
      cooldownMs: safeInt(merged.cooldownMs, DEFAULT_CONFIG.cooldownMs, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
      minReward: Math.min(minReward, maxReward),
      maxReward: Math.max(minReward, maxReward),
      dailyCooldownMs: safeInt(merged.dailyCooldownMs, DEFAULT_CONFIG.dailyCooldownMs, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
      dailyMinReward: Math.min(dailyMinReward, dailyMaxReward),
      dailyMaxReward: Math.max(dailyMinReward, dailyMaxReward),
      streakBonusPerClaim: safeFloat(merged.streakBonusPerClaim, DEFAULT_CONFIG.streakBonusPerClaim, 0, 5),
      maxStreakBonus: safeFloat(merged.maxStreakBonus, DEFAULT_CONFIG.maxStreakBonus, 0, 10),
      boostCost: safeInt(merged.boostCost, DEFAULT_CONFIG.boostCost, 1, 100000000),
      boostMultiplier: safeFloat(merged.boostMultiplier, DEFAULT_CONFIG.boostMultiplier, 1, 20),
      boostDurationMs: safeInt(merged.boostDurationMs, DEFAULT_CONFIG.boostDurationMs, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
      maxBoostInventory: safeInt(merged.maxBoostInventory, DEFAULT_CONFIG.maxBoostInventory, 1, 1000)
    };
  }

  static async getConfig(client, guildId) {
    const stored = await client.db.get(this.getConfigKey(guildId), null);
    return this.normalizeConfig(stored);
  }

  static async saveConfig(client, guildId, config) {
    const normalized = this.normalizeConfig(config);
    await client.db.set(this.getConfigKey(guildId), normalized);
    return normalized;
  }

  static async setEnabled(client, guildId, enabled) {
    const config = await this.getConfig(client, guildId);
    config.enabled = Boolean(enabled);
    return this.saveConfig(client, guildId, config);
  }

  static async addPremiumUser(client, guildId, userId, days = null) {
    const config = await this.getConfig(client, guildId);
    const id = String(userId);
    if (!config.userIds.includes(id)) config.userIds.push(id);

    if (days !== null && days !== undefined) {
      const safeDays = safeInt(days, 0, 0, 3650);
      config.userExpiresAt[id] = safeDays > 0 ? Date.now() + safeDays * 24 * 60 * 60 * 1000 : 0;
    }

    return this.saveConfig(client, guildId, config);
  }

  static async removePremiumUser(client, guildId, userId) {
    const config = await this.getConfig(client, guildId);
    const id = String(userId);
    config.userIds = config.userIds.filter((storedId) => storedId !== id);
    delete config.userExpiresAt[id];
    return this.saveConfig(client, guildId, config);
  }

  static async setPremiumRole(client, guildId, roleId) {
    const config = await this.getConfig(client, guildId);
    config.roleId = roleId || null;
    return this.saveConfig(client, guildId, config);
  }

  static async setLogChannel(client, guildId, channelId) {
    const config = await this.getConfig(client, guildId);
    config.logChannelId = channelId || null;
    return this.saveConfig(client, guildId, config);
  }

  static async setRewardRange(client, guildId, minReward, maxReward) {
    const config = await this.getConfig(client, guildId);
    config.minReward = minReward;
    config.maxReward = maxReward;
    return this.saveConfig(client, guildId, config);
  }

  static async setDailyRewardRange(client, guildId, minReward, maxReward) {
    const config = await this.getConfig(client, guildId);
    config.dailyMinReward = minReward;
    config.dailyMaxReward = maxReward;
    return this.saveConfig(client, guildId, config);
  }

  static async setCooldown(client, guildId, minutes) {
    const config = await this.getConfig(client, guildId);
    config.cooldownMs = safeInt(minutes, 15, 1, 10080) * 60 * 1000;
    return this.saveConfig(client, guildId, config);
  }

  static async hasAccess(client, guildId, userId, member = null) {
    const config = await this.getConfig(client, guildId);

    if (!config.enabled) {
      return { allowed: false, config, reason: 'disabled' };
    }

    const now = Date.now();
    const id = String(userId);

    if (config.userIds.includes(id)) {
      const expiresAt = config.userExpiresAt[id] || 0;
      if (!expiresAt || expiresAt > now) {
        return { allowed: true, config, reason: 'user_whitelist', expiresAt };
      }
      return { allowed: false, config, reason: 'premium_expired', expiresAt };
    }

    if (config.roleId && member?.roles?.cache?.has(config.roleId)) {
      return { allowed: true, config, reason: 'premium_role', expiresAt: 0 };
    }

    return { allowed: false, config, reason: 'not_premium', expiresAt: 0 };
  }

  static formatDuration(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  static async getStatus(client, guildId, userId, member = null) {
    const access = await this.hasAccess(client, guildId, userId, member);
    const userData = await getEconomyData(client, guildId, userId);
    const cooldowns = userData.cooldowns || {};
    const lastFarm = cooldowns.premiumFarm || 0;
    const lastDaily = cooldowns.premiumFarmDaily || 0;
    const stats = normalizeStats(userData.premiumFarm || {});
    const now = Date.now();
    const remaining = Math.max(0, lastFarm + access.config.cooldownMs - now);
    const dailyRemaining = Math.max(0, lastDaily + access.config.dailyCooldownMs - now);
    const boostRemaining = Math.max(0, stats.activeBoostUntil - now);

    return {
      ...access,
      wallet: userData.wallet || 0,
      remaining,
      dailyRemaining,
      nextClaimAt: remaining > 0 ? new Date(now + remaining) : null,
      nextDailyAt: dailyRemaining > 0 ? new Date(now + dailyRemaining) : null,
      boostRemaining,
      stats
    };
  }

  static async assertAccess(client, guildId, userId, member = null) {
    const access = await this.hasAccess(client, guildId, userId, member);
    if (!access.allowed) {
      const messages = {
        disabled: 'Premium farm sedang dinonaktifkan oleh admin server.',
        premium_expired: 'Akses premium farm kamu sudah expired. Minta admin memperpanjang akses.',
        not_premium: 'Fitur ini khusus premium. Minta admin menambahkan role/user kamu ke premium farm.'
      };
      throw createError(
        'Premium farm access denied',
        ErrorTypes.PERMISSION,
        messages[access.reason] || messages.not_premium,
        { guildId, userId, reason: access.reason }
      );
    }
    return access;
  }

  static async claim(client, guildId, userId, member = null) {
    const access = await this.assertAccess(client, guildId, userId, member);
    const config = access.config;
    const userData = await getEconomyData(client, guildId, userId);
    const now = Date.now();
    const cooldowns = userData.cooldowns || {};
    const lastFarm = cooldowns.premiumFarm || 0;
    const remaining = lastFarm + config.cooldownMs - now;

    if (remaining > 0) {
      throw createError(
        'Premium farm cooldown active',
        ErrorTypes.RATE_LIMIT,
        `Premium farm masih cooldown. Coba lagi dalam **${this.formatDuration(remaining)}**.`,
        { guildId, userId, remaining }
      );
    }

    const stats = normalizeStats(userData.premiumFarm || {});
    const baseReward = randomInt(config.minReward, config.maxReward);
    const nextStreak = stats.streak + 1;
    const streakBonus = Math.min(
      config.maxStreakBonus,
      Math.max(0, nextStreak - 1) * config.streakBonusPerClaim
    );
    const boostActive = stats.activeBoostUntil > now;
    const boostMultiplier = boostActive ? config.boostMultiplier : 1;
    const earned = Math.floor(baseReward * (1 + streakBonus) * boostMultiplier);
    const event = FARM_EVENTS[Math.floor(Math.random() * FARM_EVENTS.length)];

    this.assertSafeWallet((userData.wallet || 0) + earned, guildId, userId);

    userData.wallet = (userData.wallet || 0) + earned;
    userData.cooldowns = {
      ...cooldowns,
      premiumFarm: now
    };
    userData.premiumFarm = {
      ...stats,
      totalClaims: stats.totalClaims + 1,
      totalEarned: stats.totalEarned + earned,
      streak: nextStreak,
      bestReward: Math.max(stats.bestReward, earned),
      lastReward: earned,
      lastClaimAt: now
    };

    await setEconomyData(client, guildId, userId, userData);

    logger.info('[PREMIUM_FARM] Claimed', {
      guildId,
      userId,
      earned,
      wallet: userData.wallet,
      streak: nextStreak,
      boostActive
    });

    await this.sendLog(client, guildId, {
      title: '🌾 Premium Farm Claim',
      description: `<@${userId}> mendapatkan **$${earned.toLocaleString()}** dari premium farm.`,
      fields: [
        { name: 'Wallet', value: `$${userData.wallet.toLocaleString()}`, inline: true },
        { name: 'Streak', value: `${nextStreak}x`, inline: true },
        { name: 'Boost', value: boostActive ? `x${config.boostMultiplier}` : 'Tidak aktif', inline: true }
      ]
    });

    return {
      earned,
      baseReward,
      streakBonus,
      boostActive,
      boostMultiplier,
      streak: nextStreak,
      event,
      wallet: userData.wallet,
      nextClaimAt: new Date(now + config.cooldownMs),
      stats: userData.premiumFarm
    };
  }

  static async claimDaily(client, guildId, userId, member = null) {
    const access = await this.assertAccess(client, guildId, userId, member);
    const config = access.config;
    const userData = await getEconomyData(client, guildId, userId);
    const now = Date.now();
    const cooldowns = userData.cooldowns || {};
    const lastDaily = cooldowns.premiumFarmDaily || 0;
    const remaining = lastDaily + config.dailyCooldownMs - now;

    if (remaining > 0) {
      throw createError(
        'Premium farm daily cooldown active',
        ErrorTypes.RATE_LIMIT,
        `Daily premium reward masih cooldown. Coba lagi dalam **${this.formatDuration(remaining)}**.`,
        { guildId, userId, remaining }
      );
    }

    const stats = normalizeStats(userData.premiumFarm || {});
    const earned = randomInt(config.dailyMinReward, config.dailyMaxReward);
    this.assertSafeWallet((userData.wallet || 0) + earned, guildId, userId);

    userData.wallet = (userData.wallet || 0) + earned;
    userData.cooldowns = {
      ...cooldowns,
      premiumFarmDaily: now
    };
    userData.premiumFarm = {
      ...stats,
      dailyClaims: stats.dailyClaims + 1,
      dailyEarned: stats.dailyEarned + earned,
      lastDailyReward: earned,
      lastDailyAt: now
    };

    await setEconomyData(client, guildId, userId, userData);

    await this.sendLog(client, guildId, {
      title: '🎁 Premium Daily Reward',
      description: `<@${userId}> claim daily premium sebesar **$${earned.toLocaleString()}**.`,
      fields: [
        { name: 'Wallet', value: `$${userData.wallet.toLocaleString()}`, inline: true },
        { name: 'Daily Claims', value: `${userData.premiumFarm.dailyClaims}x`, inline: true }
      ]
    });

    return {
      earned,
      wallet: userData.wallet,
      nextDailyAt: new Date(now + config.dailyCooldownMs),
      stats: userData.premiumFarm
    };
  }

  static async buyBoost(client, guildId, userId, member = null, amount = 1) {
    const access = await this.assertAccess(client, guildId, userId, member);
    const config = access.config;
    const userData = await getEconomyData(client, guildId, userId);
    const stats = normalizeStats(userData.premiumFarm || {});
    const quantity = safeInt(amount, 1, 1, config.maxBoostInventory);
    const totalCost = config.boostCost * quantity;

    if ((userData.wallet || 0) < totalCost) {
      throw createError(
        'Insufficient premium farm boost funds',
        ErrorTypes.VALIDATION,
        `Wallet kamu kurang. Butuh **$${totalCost.toLocaleString()}** untuk membeli ${quantity} boost.`,
        { guildId, userId, totalCost }
      );
    }

    if (stats.boosts + quantity > config.maxBoostInventory) {
      throw createError(
        'Premium farm boost inventory full',
        ErrorTypes.VALIDATION,
        `Inventory boost maksimal **${config.maxBoostInventory}**. Kamu sekarang punya **${stats.boosts}** boost.`,
        { guildId, userId, boosts: stats.boosts }
      );
    }

    userData.wallet = (userData.wallet || 0) - totalCost;
    userData.premiumFarm = {
      ...stats,
      boosts: stats.boosts + quantity
    };

    await setEconomyData(client, guildId, userId, userData);
    return {
      amount: quantity,
      cost: totalCost,
      wallet: userData.wallet,
      boosts: userData.premiumFarm.boosts
    };
  }

  static async useBoost(client, guildId, userId, member = null) {
    const access = await this.assertAccess(client, guildId, userId, member);
    const config = access.config;
    const userData = await getEconomyData(client, guildId, userId);
    const stats = normalizeStats(userData.premiumFarm || {});

    if (stats.boosts <= 0) {
      throw createError(
        'No premium farm boosts',
        ErrorTypes.VALIDATION,
        'Kamu belum punya boost. Beli dulu dengan `/work mode:premium action:buy-boost`.',
        { guildId, userId }
      );
    }

    const now = Date.now();
    const currentUntil = Math.max(now, stats.activeBoostUntil || 0);
    const activeBoostUntil = currentUntil + config.boostDurationMs;

    userData.premiumFarm = {
      ...stats,
      boosts: stats.boosts - 1,
      activeBoostUntil,
      lifetimeBoostsUsed: stats.lifetimeBoostsUsed + 1
    };

    await setEconomyData(client, guildId, userId, userData);

    return {
      boosts: userData.premiumFarm.boosts,
      activeBoostUntil: new Date(activeBoostUntil),
      boostMultiplier: config.boostMultiplier,
      boostDurationMs: config.boostDurationMs
    };
  }

  static async grantBoost(client, guildId, userId, amount = 1) {
    const config = await this.getConfig(client, guildId);
    const userData = await getEconomyData(client, guildId, userId);
    const stats = normalizeStats(userData.premiumFarm || {});
    const quantity = safeInt(amount, 1, 1, config.maxBoostInventory);

    userData.premiumFarm = {
      ...stats,
      boosts: Math.min(config.maxBoostInventory, stats.boosts + quantity)
    };

    await setEconomyData(client, guildId, userId, userData);
    return userData.premiumFarm.boosts;
  }

  static async resetStreak(client, guildId, userId) {
    const userData = await getEconomyData(client, guildId, userId);
    const stats = normalizeStats(userData.premiumFarm || {});
    userData.premiumFarm = { ...stats, streak: 0 };
    await setEconomyData(client, guildId, userId, userData);
    return true;
  }

  static async getLeaderboard(client, guildId, limit = 10) {
    const prefix = `economy:${guildId}:`;
    const keys = typeof client.db.list === 'function' ? await client.db.list(prefix) : [];
    const rows = [];

    for (const key of keys) {
      const userId = key.slice(prefix.length);
      if (!userId) continue;
      const data = await client.db.get(key, null);
      const stats = normalizeStats(data?.premiumFarm || {});
      if (stats.totalEarned <= 0 && stats.totalClaims <= 0 && stats.dailyEarned <= 0) continue;

      rows.push({
        userId,
        totalEarned: stats.totalEarned,
        totalClaims: stats.totalClaims,
        dailyEarned: stats.dailyEarned,
        bestReward: stats.bestReward,
        streak: stats.streak
      });
    }

    rows.sort((a, b) =>
      b.totalEarned - a.totalEarned
      || b.dailyEarned - a.dailyEarned
      || b.totalClaims - a.totalClaims
    );

    return rows.slice(0, safeInt(limit, 10, 1, 25));
  }

  static async sendLog(client, guildId, payload) {
    try {
      const config = await this.getConfig(client, guildId);
      if (!config.logChannelId) return false;

      const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
      if (!channel?.isTextBased?.()) return false;

      const embed = createEmbed({
        title: payload.title || 'Premium Farm Log',
        description: payload.description || '',
        color: 'info',
        fields: payload.fields || []
      });

      await channel.send({ embeds: [embed] });
      return true;
    } catch (error) {
      logger.warn('[PREMIUM_FARM] Failed to send log', error);
      return false;
    }
  }

  static assertSafeWallet(nextWallet, guildId, userId) {
    if (!Number.isSafeInteger(nextWallet) || nextWallet < 0) {
      throw createError(
        'Invalid premium farm balance',
        ErrorTypes.VALIDATION,
        'Saldo tidak valid. Farming dibatalkan untuk mencegah data rusak.',
        { guildId, userId, nextWallet }
      );
    }
  }
}

export default PremiumFarmService;
