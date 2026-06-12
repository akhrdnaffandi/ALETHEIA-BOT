import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
    EmbedBuilder
} from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    CUSTOM_MESSAGE_TYPES,
    buildEmbedConfigFromOptions,
    buildLifecyclePayload,
    buildConfigSummaryEmbed,
    resolveUploadedImage,
    getDefaultCustomConfig
} from '../../services/customMessageService.js';

function addCommonCustomOptions(subcommand, { requireMessage = true, includeRewardRole = false } = {}) {
    subcommand
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel tujuan pesan')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Isi pesan. Variable: {user}, {server}, {memberCount}, {boostCount}, {boostLevel}')
                .setMaxLength(2000)
                .setRequired(requireMessage))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Judul embed')
                .setMaxLength(256)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('footer')
                .setDescription('Footer embed')
                .setMaxLength(2048)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Warna embed, contoh: #57F287, success, error, info')
                .setMaxLength(32)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image_url')
                .setDescription('URL gambar/banner embed')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image_file')
                .setDescription('Upload gambar/banner langsung dari galeri')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('thumbnail')
                .setDescription('Thumbnail embed')
                .addChoices(
                    { name: 'Avatar user', value: 'user' },
                    { name: 'Icon server', value: 'server' },
                    { name: 'Custom URL', value: 'custom' },
                    { name: 'Tidak pakai thumbnail', value: 'none' }
                )
                .setRequired(false))
        .addStringOption(option =>
            option.setName('thumbnail_url')
                .setDescription('URL thumbnail jika thumbnail = Custom URL')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('ping')
                .setDescription('Ping user di luar embed?')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('fields')
                .setDescription('Field tambahan. Format: Judul=Isi; Judul 2=Isi 2')
                .setMaxLength(1500)
                .setRequired(false));

    if (includeRewardRole) {
        subcommand.addRoleOption(option =>
            option.setName('reward_role')
                .setDescription('Role bonus yang diberikan ketika member boost')
                .setRequired(false));
    }

    return subcommand;
}

function makePreviewPayload(type, storedConfig, interaction, forceNoPing = true) {
    return buildLifecyclePayload(type, storedConfig, {
        user: interaction.user,
        guild: interaction.guild,
        member: interaction.member,
        extra: {
            boostCount: interaction.guild?.premiumSubscriptionCount || 0,
            boostLevel: interaction.guild?.premiumTier || 0
        }
    }, { forceNoPing });
}

function setupEmbedConfig(options, type) {
    return buildEmbedConfigFromOptions(options, getDefaultCustomConfig(type));
}

function configItems(config, type) {
    if (type === CUSTOM_MESSAGE_TYPES.BOOSTER) {
        return [
            { name: 'Status', value: config.boosterEnabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
            { name: 'Channel', value: config.boosterChannelId ? `<#${config.boosterChannelId}>` : '`Belum diset`', inline: true },
            { name: 'Ping', value: config.boosterPing ? '✅ Ya' : '❌ Tidak', inline: true },
            { name: 'Reward Role', value: config.boosterRewardRoleId ? `<@&${config.boosterRewardRoleId}>` : '`Tidak ada`', inline: true },
            { name: 'Title', value: config.boosterEmbed?.title || '`Default`', inline: false },
            { name: 'Image', value: config.boosterEmbed?.image ? '✅ Ada' : '❌ Tidak ada', inline: true },
            { name: 'Footer', value: config.boosterEmbed?.footer || '`Default`', inline: false }
        ];
    }

    return [
        { name: 'Status', value: config.enabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
        { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : '`Belum diset`', inline: true },
        { name: 'Ping', value: config.welcomePing ? '✅ Ya' : '❌ Tidak', inline: true },
        { name: 'Title', value: config.welcomeEmbed?.title || '`Default`', inline: false },
        { name: 'Image', value: config.welcomeEmbed?.image || config.welcomeImage ? '✅ Ada' : '❌ Tidak ada', inline: true },
        { name: 'Footer', value: config.welcomeEmbed?.footer || '`Default`', inline: false }
    ];
}

export default {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Configure welcome and server booster messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand => addCommonCustomOptions(
            subcommand.setName('setup').setDescription('Setup welcome message full custom'),
            { requireMessage: true }
        ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('image')
                .setDescription('Menu upload gambar langsung dari galeri untuk welcome/booster')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Jenis pesan yang gambarnya mau diganti')
                        .addChoices(
                            { name: 'Welcome', value: 'welcome' },
                            { name: 'Booster', value: 'booster' }
                        )
                        .setRequired(true))
                .addAttachmentOption(option =>
                    option.setName('image_file')
                        .setDescription('Upload gambar dari galeri')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('preview')
                .setDescription('Preview tampilan welcome/booster')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Jenis pesan')
                        .addChoices(
                            { name: 'Welcome', value: 'welcome' },
                            { name: 'Booster', value: 'booster' }
                        )
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Lihat konfigurasi welcome'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Matikan welcome message'))
        .addSubcommand(subcommand => addCommonCustomOptions(
            subcommand.setName('booster-setup').setDescription('Setup booster welcome full custom'),
            { requireMessage: false, includeRewardRole: true }
        ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('booster-test')
                .setDescription('Test kirim booster welcome ke channel yang diset'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('booster-config')
                .setDescription('Lihat konfigurasi booster welcome'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('booster-disable')
                .setDescription('Matikan booster welcome')),

    async execute(interaction) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Missing Permissions', 'You need the **Manage Server** permission to use `/welcome`.')]
            });
        }

        const subcommand = options.getSubcommand();

        try {
            switch (subcommand) {
                case 'setup':
                    return await handleWelcomeSetup(interaction, client, guild);
                case 'image':
                    return await handleImageUpload(interaction, client, guild);
                case 'preview':
                    return await handlePreview(interaction, client, guild);
                case 'config':
                    return await handleConfig(interaction, client, guild, CUSTOM_MESSAGE_TYPES.WELCOME);
                case 'disable':
                    return await handleDisable(interaction, client, guild, CUSTOM_MESSAGE_TYPES.WELCOME);
                case 'booster-setup':
                    return await handleBoosterSetup(interaction, client, guild);
                case 'booster-test':
                    return await handleBoosterTest(interaction, client, guild);
                case 'booster-config':
                    return await handleConfig(interaction, client, guild, CUSTOM_MESSAGE_TYPES.BOOSTER);
                case 'booster-disable':
                    return await handleDisable(interaction, client, guild, CUSTOM_MESSAGE_TYPES.BOOSTER);
                default:
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Unknown Subcommand', 'Subcommand tidak dikenali.')]
                    });
            }
        } catch (error) {
            logger.error(`[Welcome Custom] ${subcommand} failed`, error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Setup Failed', error.message || 'Terjadi error saat menyimpan konfigurasi.')]
            });
        }
    },
};

async function handleWelcomeSetup(interaction, client, guild) {
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    const ping = interaction.options.getBoolean('ping') ?? false;
    const embedConfig = setupEmbedConfig(interaction.options, CUSTOM_MESSAGE_TYPES.WELCOME);
    embedConfig.description = message;

    const updated = await updateWelcomeConfig(client, guild.id, {
        enabled: true,
        channelId: channel.id,
        welcomeMessage: message,
        welcomePing: ping,
        welcomeImage: embedConfig.image || null,
        welcomeEmbed: embedConfig,
        setupBy: interaction.user.id,
        setupAt: new Date().toISOString()
    });

    const preview = makePreviewPayload(CUSTOM_MESSAGE_TYPES.WELCOME, updated, interaction);
    preview.embeds = [new EmbedBuilder(preview.embeds?.[0]?.data || {})
        .setTitle(`✅ Welcome Configured — ${embedConfig.title || 'Preview'}`)];

    await InteractionHelper.safeEditReply(interaction, {
        content: `Welcome akan dikirim ke ${channel}.`,
        embeds: preview.embeds
    });
}

async function handleBoosterSetup(interaction, client, guild) {
    const channel = interaction.options.getChannel('channel');
    const ping = interaction.options.getBoolean('ping') ?? false;
    const rewardRole = interaction.options.getRole('reward_role');
    const embedConfig = setupEmbedConfig(interaction.options, CUSTOM_MESSAGE_TYPES.BOOSTER);

    const updated = await updateWelcomeConfig(client, guild.id, {
        boosterEnabled: true,
        boosterChannelId: channel.id,
        boosterMessage: embedConfig.description,
        boosterPing: ping,
        boosterRewardRoleId: rewardRole?.id || null,
        boosterImage: embedConfig.image || null,
        boosterEmbed: embedConfig,
        boosterSetupBy: interaction.user.id,
        boosterSetupAt: new Date().toISOString()
    });

    const preview = makePreviewPayload(CUSTOM_MESSAGE_TYPES.BOOSTER, updated, interaction);
    await InteractionHelper.safeEditReply(interaction, {
        content: `Booster welcome akan dikirim ke ${channel}.${rewardRole ? ` Reward role: ${rewardRole}` : ''}`,
        embeds: preview.embeds
    });
}

async function handleImageUpload(interaction, client, guild) {
    const type = interaction.options.getString('type') || CUSTOM_MESSAGE_TYPES.WELCOME;
    const imageUrl = resolveUploadedImage(interaction.options.getAttachment('image_file'));
    if (!imageUrl) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Invalid Image', 'File yang diupload tidak bisa dipakai sebagai gambar.')]
        });
    }

    const current = await getWelcomeConfig(client, guild.id);
    if (type === CUSTOM_MESSAGE_TYPES.BOOSTER) {
        await updateWelcomeConfig(client, guild.id, {
            boosterImage: imageUrl,
            boosterEmbed: { ...(current.boosterEmbed || getDefaultCustomConfig(CUSTOM_MESSAGE_TYPES.BOOSTER)), image: imageUrl }
        });
    } else {
        await updateWelcomeConfig(client, guild.id, {
            welcomeImage: imageUrl,
            welcomeEmbed: { ...(current.welcomeEmbed || getDefaultCustomConfig(CUSTOM_MESSAGE_TYPES.WELCOME)), image: imageUrl }
        });
    }

    const label = type === CUSTOM_MESSAGE_TYPES.BOOSTER ? 'Booster' : 'Welcome';
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(`Gambar **${label}** berhasil diganti dari upload galeri.`, '✅ Image Updated')]
    });
}

async function handlePreview(interaction, client, guild) {
    const type = interaction.options.getString('type') || CUSTOM_MESSAGE_TYPES.WELCOME;
    const config = await getWelcomeConfig(client, guild.id);
    const payload = makePreviewPayload(type, config, interaction);
    await InteractionHelper.safeEditReply(interaction, {
        content: `Preview **${type}**:`,
        embeds: payload.embeds
    });
}

async function handleConfig(interaction, client, guild, type) {
    const config = await getWelcomeConfig(client, guild.id);
    const title = type === CUSTOM_MESSAGE_TYPES.BOOSTER ? '💎 Booster Welcome Config' : '🎉 Welcome Config';
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildConfigSummaryEmbed(title, configItems(config, type), 'info')]
    });
}

async function handleDisable(interaction, client, guild, type) {
    if (type === CUSTOM_MESSAGE_TYPES.BOOSTER) {
        await updateWelcomeConfig(client, guild.id, { boosterEnabled: false });
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Booster welcome berhasil dimatikan.', '✅ Booster Disabled')]
        });
    }

    await updateWelcomeConfig(client, guild.id, { enabled: false });
    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Welcome message berhasil dimatikan.', '✅ Welcome Disabled')]
    });
}

async function handleBoosterTest(interaction, client, guild) {
    const config = await getWelcomeConfig(client, guild.id);
    if (!config.boosterChannelId) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Booster belum diset', 'Gunakan `/welcome booster-setup` dulu.')]
        });
    }

    const channel = guild.channels.cache.get(config.boosterChannelId);
    if (!channel?.isTextBased?.()) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Channel tidak valid', 'Channel booster tidak ditemukan atau bukan text channel.')]
        });
    }

    const payload = makePreviewPayload(CUSTOM_MESSAGE_TYPES.BOOSTER, config, interaction, true);
    await channel.send(payload);
    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(`Test booster welcome berhasil dikirim ke ${channel}.`, '✅ Booster Test Sent')]
    });
}
