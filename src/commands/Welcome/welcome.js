import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    buildBoosterConfigSummary,
    getBoosterConfig,
    sendBoosterAnnouncement,
    updateBoosterConfig,
    validateBoosterImageUrl
} from '../../services/boosterService.js';

const BOOSTER_MESSAGE_HELP = 'Variables: {user}, {username}, {user.tag}, {server}, {boostCount}, {boostLevel}, {memberCount}';
const DEFAULT_BOOSTER_MESSAGE = '✨ Terima kasih {user} sudah boost **{server}**! Sekarang server punya **{boostCount} boost** dan berada di **Level {boostLevel}**.';

function isHexColor(color) {
    return /^#[0-9A-F]{6}$/i.test(color || '');
}

async function getMemberFromOption(interaction, optionName = 'user') {
    const member = interaction.options.getMember(optionName);
    if (member) return member;

    const user = interaction.options.getUser(optionName);
    if (!user) return interaction.member;

    return await interaction.guild.members.fetch(user.id).catch(() => interaction.member);
}

export default {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Configure the welcome and booster welcome system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the welcome message')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send welcome messages to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Welcome message. Variables: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL of the image to include in the welcome message')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Whether to ping the user in the welcome message')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('booster-setup')
                .setDescription('Set channel and message for server booster welcome')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel untuk pesan server booster')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription(BOOSTER_MESSAGE_HELP)
                        .setMaxLength(1500)
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('Optional URL gambar/banner custom untuk booster welcome')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Ping member yang boost server?')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('visual')
                        .setDescription('Tampilkan visual booster otomatis jika tidak pakai image custom?')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('reward_role')
                        .setDescription('Optional role reward yang diberikan ke booster')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('Warna embed HEX, contoh: #F47FFF')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('booster-disable')
                .setDescription('Disable server booster welcome'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('booster-config')
                .setDescription('Show current server booster welcome config'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('booster-test')
                .setDescription('Send a test server booster welcome message')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User yang dipakai untuk preview/test')
                        .setRequired(false))),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                logger.warn('Welcome interaction defer failed', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'welcome'
                });
                return;
            }
        } catch (deferError) {
            logger.error('Welcome defer error', { error: deferError.message });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Missing Permissions', 'You need the **Manage Server** permission to use `/welcome`.')],
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            return await handleWelcomeSetup(interaction);
        }

        if (subcommand === 'booster-setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message') || DEFAULT_BOOSTER_MESSAGE;
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? true;
            const showVisual = options.getBoolean('visual') ?? true;
            const rewardRole = options.getRole('reward_role');
            const color = options.getString('color') || '#F47FFF';

            if (!message || message.trim().length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Invalid Input', 'Booster message tidak boleh kosong.')]
                });
            }

            if (image && !validateBoosterImageUrl(image)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Invalid Image URL', 'Gunakan URL gambar publik yang valid, contoh `https://.../banner.png`.')]
                });
            }

            if (!isHexColor(color)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Invalid Color', 'Format warna harus HEX, contoh `#F47FFF`.')]
                });
            }

            const config = await updateBoosterConfig(client, guild.id, {
                enabled: true,
                channelId: channel.id,
                message,
                image: image || null,
                ping,
                showVisual,
                rewardRoleId: rewardRole?.id ?? null,
                color,
                setupBy: interaction.user.id,
                setupAt: new Date().toISOString()
            });

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('💎 Booster Welcome Configured')
                .setDescription(`Pesan server booster akan dikirim ke ${channel}.`)
                .addFields(
                    { name: 'Preview Message', value: message },
                    { name: 'Config', value: buildBoosterConfigSummary(config) }
                )
                .setFooter({ text: 'Gunakan /welcome booster-test untuk cek tampilannya.' })
                .setTimestamp();

            if (image) embed.setImage(image);

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (subcommand === 'booster-disable') {
            const config = await updateBoosterConfig(client, guild.id, { enabled: false });
            const embed = new EmbedBuilder()
                .setColor(getColor('warning'))
                .setTitle('💎 Booster Welcome Disabled')
                .setDescription('Pesan server booster sudah dinonaktifkan.')
                .addFields({ name: 'Config', value: buildBoosterConfigSummary(config) })
                .setTimestamp();

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (subcommand === 'booster-config') {
            const config = await getBoosterConfig(client, guild.id);
            const embed = new EmbedBuilder()
                .setColor(config.color || '#F47FFF')
                .setTitle('💎 Booster Welcome Config')
                .setDescription(buildBoosterConfigSummary(config))
                .addFields({ name: 'Message', value: config.message || DEFAULT_BOOSTER_MESSAGE })
                .setTimestamp();

            if (config.image) embed.setImage(config.image);

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (subcommand === 'booster-test') {
            const config = await getBoosterConfig(client, guild.id);
            if (!config.channelId) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Booster Welcome Belum Diset', 'Jalankan dulu `/welcome booster-setup`.')]
                });
            }

            const member = await getMemberFromOption(interaction, 'user');
            const result = await sendBoosterAnnouncement(member, { force: true, test: true });

            const success = result.sent;
            const embed = new EmbedBuilder()
                .setColor(success ? getColor('success') : getColor('error'))
                .setTitle(success ? '✅ Booster Test Sent' : '❌ Booster Test Failed')
                .setDescription(success
                    ? `Preview berhasil dikirim ke <#${config.channelId}>.`
                    : `Gagal mengirim preview. Reason: **${result.reason || 'unknown'}**`)
                .setTimestamp();

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }
};

async function handleWelcomeSetup(interaction) {
    const { options, guild, client } = interaction;
    const channel = options.getChannel('channel');
    const message = options.getString('message');
    const image = options.getString('image');
    const ping = options.getBoolean('ping') ?? false;

    const existingConfig = await getWelcomeConfig(client, guild.id);
    if (existingConfig?.channelId) {
        logger.info(`[Welcome] Setup blocked because config already exists in channel ${existingConfig.channelId} for guild ${guild.id}`);
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(
                'Welcome Setup Already Exists',
                `Welcome is already configured for <#${existingConfig.channelId}>. Use **/welcome config** to customize channel, message, ping, or image.`
            )]
        });
    }

    if (!message || message.trim().length === 0) {
        logger.warn(`[Welcome] Empty message provided by ${interaction.user.tag} in ${guild.name}`);
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Invalid Input', 'Welcome message cannot be empty')]
        });
    }

    if (image) {
        try {
            new URL(image);
        } catch (e) {
            logger.warn(`[Welcome] Invalid image URL provided by ${interaction.user.tag}: ${image}`);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Invalid Image URL', 'Please provide a valid image URL (must start with http:// or https://)')]
            });
        }
    }

    try {
        await updateWelcomeConfig(client, guild.id, {
            enabled: true,
            channelId: channel.id,
            welcomeMessage: message,
            welcomeImage: image || undefined,
            welcomePing: ping
        });

        logger.info(`[Welcome] Setup configured by ${interaction.user.tag} for guild ${guild.name} (${guild.id})`);

        const previewMessage = formatWelcomeMessage(message, {
            user: interaction.user,
            guild
        });

        const embed = new EmbedBuilder()
            .setColor(getColor('success'))
            .setTitle('✅ Welcome System Configured')
            .setDescription(`Welcome messages will now be sent to ${channel}`)
            .addFields(
                { name: 'Message Preview', value: previewMessage },
                { name: 'Ping User', value: ping ? '✅ Yes' : '❌ No' },
                { name: 'Status', value: '✅ Enabled' }
            )
            .setFooter({ text: 'Tip: Use /welcome config to customize welcome settings' });

        if (image) {
            embed.setImage(image);
        }

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error(`[Welcome] Failed to setup welcome system for guild ${guild.id}:`, error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(
                'Setup Failed',
                'An error occurred while configuring the welcome system. Please try again.',
                { showDetails: true }
            )]
        });
    }
}
