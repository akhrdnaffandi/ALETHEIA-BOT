import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { PremiumFarmService } from '../../services/premiumFarmService.js';

const WORK_COOLDOWN = 30 * 60 * 1000;
const MIN_WORK_AMOUNT = 50;
const MAX_WORK_AMOUNT = 300;
const LAPTOP_MULTIPLIER = 1.5;
const WORK_JOBS = [
    'Software Developer',
    'Barista',
    'Janitor',
    'YouTuber',
    'Discord Bot Developer',
    'Cashier',
    'Pizza Delivery Driver',
    'Librarian',
    'Gardener',
    'Data Analyst'
];

const ADMIN_ACTIONS = new Set([
    'config',
    'add-user',
    'remove-user',
    'set-expiry',
    'set-role',
    'clear-role',
    'set-reward',
    'set-daily',
    'set-cooldown',
    'set-log',
    'clear-log',
    'enable',
    'disable',
    'reset-streak',
    'grant-boost'
]);

function money(value) {
    return `$${Number(value || 0).toLocaleString()}`;
}

function unixTime(dateOrMs) {
    const ms = dateOrMs instanceof Date ? dateOrMs.getTime() : Number(dateOrMs || 0);
    return Math.floor(ms / 1000);
}

function requireAdmin(interaction, action) {
    if (!ADMIN_ACTIONS.has(action)) return;

    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw createError(
            'Missing permission',
            ErrorTypes.PERMISSION,
            'Hanya member dengan permission **Manage Server** yang bisa mengatur premium farm.',
            { userId: interaction.user.id, guildId: interaction.guildId, action }
        );
    }
}

function getPositiveInteger(interaction, optionName, fallback = 1) {
    const value = interaction.options.getInteger(optionName);
    return value === null || value === undefined ? fallback : Math.max(1, value);
}

function getRangeOptions(interaction) {
    const min = interaction.options.getInteger('min');
    const max = interaction.options.getInteger('max');

    if (!min || !max) {
        throw createError(
            'Missing reward range',
            ErrorTypes.VALIDATION,
            'Isi option **min** dan **max** untuk mengatur reward.',
            { min, max }
        );
    }

    if (min < 1 || max < 1 || min > 100000000 || max > 100000000) {
        throw createError(
            'Invalid reward range',
            ErrorTypes.VALIDATION,
            'Reward minimal 1 dan maksimal 100.000.000.',
            { min, max }
        );
    }

    return { minReward: Math.min(min, max), maxReward: Math.max(min, max) };
}

async function handlePremiumFarm(interaction, client) {
    const action = interaction.options.getString('action') || 'claim';
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    requireAdmin(interaction, action);

    if (action === 'claim') {
        const result = await PremiumFarmService.claim(client, guildId, userId, interaction.member);
        const bonusPercent = Math.round(result.streakBonus * 100);

        const embed = createEmbed({
            title: '🌾 Premium Farm Berhasil!',
            description: `Kamu ${result.event} dan mendapatkan **${money(result.earned)}** cash.`,
            color: 'success',
            fields: [
                {
                    name: '🔥 Streak Bonus',
                    value: `x${result.streak} claim • +${bonusPercent}%`,
                    inline: true
                },
                {
                    name: '⚡ Boost',
                    value: result.boostActive ? `Aktif x${result.boostMultiplier}` : 'Tidak aktif',
                    inline: true
                },
                {
                    name: '💰 Wallet Sekarang',
                    value: money(result.wallet),
                    inline: true
                },
                {
                    name: '⏰ Claim Berikutnya',
                    value: `<t:${unixTime(result.nextClaimAt)}:R>`,
                    inline: true
                }
            ],
            footer: {
                text: 'Premium farming ini memakai economy bot kamu sendiri, bukan auto-farm bot lain.'
            }
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
    }

    if (action === 'daily') {
        const result = await PremiumFarmService.claimDaily(client, guildId, userId, interaction.member);
        const embed = createEmbed({
            title: '🎁 Premium Daily Reward',
            description: `Kamu mendapatkan daily premium sebesar **${money(result.earned)}**.`,
            color: 'success',
            fields: [
                { name: '💰 Wallet Sekarang', value: money(result.wallet), inline: true },
                { name: '⏰ Daily Berikutnya', value: `<t:${unixTime(result.nextDailyAt)}:R>`, inline: true },
                { name: '📦 Total Daily Claim', value: `${result.stats.dailyClaims.toLocaleString()}x`, inline: true }
            ]
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
    }

    if (action === 'status') {
        const status = await PremiumFarmService.getStatus(client, guildId, userId, interaction.member);
        const expiresText = status.expiresAt
            ? `<t:${unixTime(status.expiresAt)}:R>`
            : status.allowed
                ? 'Lifetime / role access'
                : '-';
        const boostText = status.boostRemaining > 0
            ? `Aktif sampai <t:${unixTime(Date.now() + status.boostRemaining)}:R>`
            : 'Tidak aktif';

        const embed = createEmbed({
            title: '🌾 Premium Farm Status',
            description: status.allowed
                ? 'Kamu punya akses premium farm.'
                : 'Kamu belum punya akses premium farm.',
            color: status.allowed ? 'success' : 'warning',
            fields: [
                { name: '🔐 Akses', value: status.allowed ? `✅ Premium (${status.reason})` : `❌ ${status.reason}`, inline: true },
                { name: '⏳ Expired', value: expiresText, inline: true },
                { name: '💰 Wallet', value: money(status.wallet), inline: true },
                {
                    name: '🌾 Farm Cooldown',
                    value: status.remaining > 0 ? `<t:${unixTime(status.nextClaimAt)}:R>` : 'Siap claim sekarang',
                    inline: true
                },
                {
                    name: '🎁 Daily Cooldown',
                    value: status.dailyRemaining > 0 ? `<t:${unixTime(status.nextDailyAt)}:R>` : 'Siap claim sekarang',
                    inline: true
                },
                { name: '⚡ Boost', value: `${status.stats.boosts} item • ${boostText}`, inline: true },
                { name: '📊 Total Claim', value: `${status.stats.totalClaims.toLocaleString()}x`, inline: true },
                { name: '💵 Total Earned', value: money(status.stats.totalEarned), inline: true },
                { name: '🏆 Best Reward', value: money(status.stats.bestReward), inline: true }
            ]
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
    }

    if (action === 'boosts') {
        const status = await PremiumFarmService.getStatus(client, guildId, userId, interaction.member);
        const boostText = status.boostRemaining > 0
            ? `Aktif sampai <t:${unixTime(Date.now() + status.boostRemaining)}:R>`
            : 'Tidak aktif';

        const embed = createEmbed({
            title: '⚡ Premium Farm Boost',
            description: 'Boost akan melipatgandakan reward premium farm saat aktif.',
            color: 'info',
            fields: [
                { name: '📦 Boost Dimiliki', value: `${status.stats.boosts} item`, inline: true },
                { name: '⚡ Status Boost', value: boostText, inline: true },
                { name: '💸 Harga Boost', value: money(status.config.boostCost), inline: true },
                { name: '✨ Multiplier', value: `x${status.config.boostMultiplier}`, inline: true },
                { name: '⏱️ Durasi', value: PremiumFarmService.formatDuration(status.config.boostDurationMs), inline: true }
            ]
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
    }

    if (action === 'buy-boost') {
        const amount = getPositiveInteger(interaction, 'amount', 1);
        const result = await PremiumFarmService.buyBoost(client, guildId, userId, interaction.member, amount);
        const embed = createEmbed({
            title: '⚡ Boost Dibeli',
            description: `Kamu membeli **${result.amount}x Premium Farm Boost** seharga **${money(result.cost)}**.`,
            color: 'success',
            fields: [
                { name: '📦 Boost Sekarang', value: `${result.boosts} item`, inline: true },
                { name: '💰 Wallet', value: money(result.wallet), inline: true }
            ]
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
    }

    if (action === 'use-boost') {
        const result = await PremiumFarmService.useBoost(client, guildId, userId, interaction.member);
        const embed = createEmbed({
            title: '⚡ Boost Diaktifkan',
            description: `Reward premium farm kamu sekarang dikali **x${result.boostMultiplier}**.`,
            color: 'success',
            fields: [
                { name: '⏱️ Aktif Sampai', value: `<t:${unixTime(result.activeBoostUntil)}:R>`, inline: true },
                { name: '📦 Sisa Boost', value: `${result.boosts} item`, inline: true }
            ]
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
    }

    if (action === 'leaderboard') {
        const rows = await PremiumFarmService.getLeaderboard(client, guildId, 10);
        const description = rows.length > 0
            ? rows.map((row, index) => {
                const medal = ['🥇', '🥈', '🥉'][index] || `#${index + 1}`;
                return `${medal} <@${row.userId}> — **${money(row.totalEarned)}** • ${row.totalClaims} claim • best ${money(row.bestReward)}`;
            }).join('\n')
            : 'Belum ada data premium farm leaderboard.';

        const embed = createEmbed({
            title: '🏆 Premium Farm Leaderboard',
            description,
            color: 'info'
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
    }

    if (action === 'config') {
        const config = await PremiumFarmService.getConfig(client, guildId);
        const embed = createEmbed({
            title: '⚙️ Premium Farm Config',
            description: 'Konfigurasi premium farming server ini.',
            color: 'info',
            fields: [
                { name: 'Status', value: config.enabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
                { name: '🎭 Premium Role', value: config.roleId ? `<@&${config.roleId}>` : 'Belum diset', inline: true },
                { name: '👤 Whitelist User', value: `${config.userIds.length} user`, inline: true },
                { name: '🧾 Log Channel', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Belum diset', inline: true },
                { name: '⏰ Farm Cooldown', value: PremiumFarmService.formatDuration(config.cooldownMs), inline: true },
                { name: '💵 Farm Reward', value: `${money(config.minReward)} - ${money(config.maxReward)}`, inline: true },
                { name: '🎁 Daily Reward', value: `${money(config.dailyMinReward)} - ${money(config.dailyMaxReward)}`, inline: true },
                { name: '⚡ Boost', value: `${money(config.boostCost)} • x${config.boostMultiplier} • ${PremiumFarmService.formatDuration(config.boostDurationMs)}`, inline: true }
            ]
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
    }

    if (action === 'add-user' || action === 'set-expiry') {
        const target = interaction.options.getUser('user');
        const days = interaction.options.getInteger('days');
        if (!target) {
            throw createError('Missing user', ErrorTypes.VALIDATION, 'Pilih user yang mau diberi akses premium farm.');
        }

        const config = await PremiumFarmService.addPremiumUser(client, guildId, target.id, days ?? 0);
        const expiresAt = config.userExpiresAt[target.id] || 0;
        const expireText = expiresAt ? `<t:${unixTime(expiresAt)}:F>` : 'Lifetime';
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '✅ Premium User Disimpan',
                description: `${target} sekarang bisa memakai premium farm.\nExpired: **${expireText}**`,
                color: 'success'
            })]
        });
        return;
    }

    if (action === 'remove-user') {
        const target = interaction.options.getUser('user');
        if (!target) {
            throw createError('Missing user', ErrorTypes.VALIDATION, 'Pilih user yang mau dicabut akses premium farm-nya.');
        }

        await PremiumFarmService.removePremiumUser(client, guildId, target.id);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '✅ Premium User Dihapus',
                description: `${target} tidak lagi ada di whitelist premium farm.`,
                color: 'success'
            })]
        });
        return;
    }

    if (action === 'set-role') {
        const role = interaction.options.getRole('role');
        if (!role) {
            throw createError('Missing role', ErrorTypes.VALIDATION, 'Pilih role premium yang boleh memakai premium farm.');
        }

        await PremiumFarmService.setPremiumRole(client, guildId, role.id);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '✅ Premium Role Diset',
                description: `Role ${role} sekarang bisa memakai premium farm.`,
                color: 'success'
            })]
        });
        return;
    }

    if (action === 'clear-role') {
        await PremiumFarmService.setPremiumRole(client, guildId, null);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '✅ Premium Role Dihapus', description: 'Akses role premium farm sudah dikosongkan.', color: 'success' })]
        });
        return;
    }

    if (action === 'set-reward') {
        const { minReward, maxReward } = getRangeOptions(interaction);
        await PremiumFarmService.setRewardRange(client, guildId, minReward, maxReward);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '✅ Reward Farm Diubah', description: `Reward farm sekarang **${money(minReward)} - ${money(maxReward)}**.`, color: 'success' })]
        });
        return;
    }

    if (action === 'set-daily') {
        const { minReward, maxReward } = getRangeOptions(interaction);
        await PremiumFarmService.setDailyRewardRange(client, guildId, minReward, maxReward);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '✅ Daily Reward Diubah', description: `Daily premium sekarang **${money(minReward)} - ${money(maxReward)}**.`, color: 'success' })]
        });
        return;
    }

    if (action === 'set-cooldown') {
        const minutes = interaction.options.getInteger('minutes');
        if (!minutes || minutes < 1) {
            throw createError('Missing cooldown', ErrorTypes.VALIDATION, 'Isi option **minutes** minimal 1 menit.');
        }

        const config = await PremiumFarmService.setCooldown(client, guildId, minutes);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '✅ Cooldown Diubah', description: `Cooldown premium farm sekarang **${PremiumFarmService.formatDuration(config.cooldownMs)}**.`, color: 'success' })]
        });
        return;
    }

    if (action === 'set-log') {
        const channel = interaction.options.getChannel('channel');
        if (!channel || !channel.isTextBased?.()) {
            throw createError('Invalid log channel', ErrorTypes.VALIDATION, 'Pilih channel teks untuk log premium farm.');
        }

        await PremiumFarmService.setLogChannel(client, guildId, channel.id);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '✅ Log Channel Diset', description: `Log premium farm akan dikirim ke ${channel}.`, color: 'success' })]
        });
        return;
    }

    if (action === 'clear-log') {
        await PremiumFarmService.setLogChannel(client, guildId, null);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '✅ Log Channel Dihapus', description: 'Log channel premium farm sudah dikosongkan.', color: 'success' })]
        });
        return;
    }

    if (action === 'enable' || action === 'disable') {
        const enabled = action === 'enable';
        await PremiumFarmService.setEnabled(client, guildId, enabled);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: enabled ? '✅ Premium Farm Diaktifkan' : '⛔ Premium Farm Dinonaktifkan',
                description: enabled ? 'User premium bisa memakai premium farm lagi.' : 'User premium sementara tidak bisa memakai premium farm.',
                color: enabled ? 'success' : 'warning'
            })]
        });
        return;
    }

    if (action === 'reset-streak') {
        const target = interaction.options.getUser('user');
        if (!target) {
            throw createError('Missing user', ErrorTypes.VALIDATION, 'Pilih user yang streak-nya mau direset.');
        }

        await PremiumFarmService.resetStreak(client, guildId, target.id);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '✅ Streak Direset', description: `Streak premium farm ${target} sudah direset.`, color: 'success' })]
        });
        return;
    }

    if (action === 'grant-boost') {
        const target = interaction.options.getUser('user');
        const amount = getPositiveInteger(interaction, 'amount', 1);
        if (!target) {
            throw createError('Missing user', ErrorTypes.VALIDATION, 'Pilih user yang mau diberi boost.');
        }

        const totalBoosts = await PremiumFarmService.grantBoost(client, guildId, target.id, amount);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '✅ Boost Diberikan',
                description: `${target} mendapatkan **${amount}x boost**. Total boost sekarang: **${totalBoosts}**.`,
                color: 'success'
            })]
        });
        return;
    }

    throw createError('Invalid premium farm action', ErrorTypes.VALIDATION, 'Action premium farm tidak valid.');
}

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work to earn some money')
        .addStringOption(option => option
            .setName('mode')
            .setDescription('Pilih mode kerja')
            .setRequired(false)
            .addChoices(
                { name: 'Normal Work', value: 'normal' },
                { name: 'Premium Farm', value: 'premium' }
            ))
        .addStringOption(option => option
            .setName('action')
            .setDescription('Action khusus mode premium')
            .setRequired(false)
            .addChoices(
                { name: 'Claim farming cash', value: 'claim' },
                { name: 'Claim daily premium reward', value: 'daily' },
                { name: 'Cek status premium farm', value: 'status' },
                { name: 'Cek boost premium farm', value: 'boosts' },
                { name: 'Beli boost premium farm', value: 'buy-boost' },
                { name: 'Pakai boost premium farm', value: 'use-boost' },
                { name: 'Leaderboard premium farm', value: 'leaderboard' },
                { name: 'Lihat config premium farm', value: 'config' },
                { name: 'Tambah user premium', value: 'add-user' },
                { name: 'Hapus user premium', value: 'remove-user' },
                { name: 'Set expiry user premium', value: 'set-expiry' },
                { name: 'Set role premium', value: 'set-role' },
                { name: 'Hapus role premium', value: 'clear-role' },
                { name: 'Set reward farm', value: 'set-reward' },
                { name: 'Set daily reward', value: 'set-daily' },
                { name: 'Set cooldown farm', value: 'set-cooldown' },
                { name: 'Set log channel', value: 'set-log' },
                { name: 'Hapus log channel', value: 'clear-log' },
                { name: 'Aktifkan premium farm', value: 'enable' },
                { name: 'Nonaktifkan premium farm', value: 'disable' },
                { name: 'Reset streak user', value: 'reset-streak' },
                { name: 'Grant boost ke user', value: 'grant-boost' }
            ))
        .addUserOption(option => option
            .setName('user')
            .setDescription('User untuk add/remove/expiry/reset/grant')
            .setRequired(false))
        .addRoleOption(option => option
            .setName('role')
            .setDescription('Role yang boleh memakai premium farm')
            .setRequired(false))
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('Channel log premium farm')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false))
        .addIntegerOption(option => option
            .setName('min')
            .setDescription('Nilai reward minimum')
            .setMinValue(1)
            .setMaxValue(100000000)
            .setRequired(false))
        .addIntegerOption(option => option
            .setName('max')
            .setDescription('Nilai reward maksimum')
            .setMinValue(1)
            .setMaxValue(100000000)
            .setRequired(false))
        .addIntegerOption(option => option
            .setName('minutes')
            .setDescription('Cooldown premium farm dalam menit')
            .setMinValue(1)
            .setMaxValue(10080)
            .setRequired(false))
        .addIntegerOption(option => option
            .setName('days')
            .setDescription('Durasi premium user dalam hari. Isi 0/kosong untuk lifetime')
            .setMinValue(0)
            .setMaxValue(3650)
            .setRequired(false))
        .addIntegerOption(option => option
            .setName('amount')
            .setDescription('Jumlah boost yang dibeli/diberikan')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const mode = interaction.options.getString('mode') || 'normal';
        if (mode === 'premium') {
            await handlePremiumFarm(interaction, client);
            return;
        }

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                'Failed to load economy data for work',
                ErrorTypes.DATABASE,
                'Failed to load your economy data. Please try again later.',
                { userId, guildId }
            );
        }

        logger.debug(`[ECONOMY] Work command started for ${userId}`, { userId, guildId });

        const lastWork = userData.lastWork || 0;
        const inventory = userData.inventory || {};
        const extraWorkShifts = inventory.extra_work || 0;
        const hasLaptop = inventory.laptop || 0;

        const cooldownActive = now < lastWork + WORK_COOLDOWN;
        let usedConsumable = false;

        if (cooldownActive) {
            if (extraWorkShifts > 0) {
                inventory.extra_work = (inventory.extra_work || 0) - 1;
                userData.inventory = inventory;
                usedConsumable = true;
            } else {
                const remaining = lastWork + WORK_COOLDOWN - now;
                throw createError(
                    'Work cooldown active',
                    ErrorTypes.RATE_LIMIT,
                    `You're working too fast! Wait **${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m** before working again.`,
                    { timeRemaining: remaining, cooldownType: 'work' }
                );
            }
        }

        let earned = Math.floor(Math.random() * (MAX_WORK_AMOUNT - MIN_WORK_AMOUNT + 1)) + MIN_WORK_AMOUNT;
        const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

        let multiplierMessage = '';
        if (hasLaptop > 0) {
            earned = Math.floor(earned * LAPTOP_MULTIPLIER);
            multiplierMessage = '\n💻 **Laptop Bonus:** +50% earnings!';
        }

        userData.wallet = (userData.wallet || 0) + earned;
        userData.lastWork = now;

        await setEconomyData(client, guildId, userId, userData);

        logger.info('[ECONOMY_TRANSACTION] Work completed', {
            userId,
            guildId,
            amount: earned,
            job,
            usedConsumable,
            hasLaptop: hasLaptop > 0,
            newWallet: userData.wallet,
            timestamp: new Date().toISOString()
        });

        const embed = createEmbed({
            title: '💼 Work Complete!',
            description: `You worked as a **${job}** and earned **${money(earned)}**!${multiplierMessage}`,
            color: 'success',
            fields: [
                { name: '💰 New Balance', value: money(userData.wallet), inline: true },
                { name: '⏰ Next Work', value: `<t:${Math.floor((now + WORK_COOLDOWN) / 1000)}:R>`, inline: true }
            ],
            footer: {
                text: `Requested by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            }
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'work' })
};
