import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
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

function addGoodbyeOptions(subcommand) {
    return subcommand
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel tujuan goodbye')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Isi goodbye. Variable: {user}, {user.tag}, {server}, {memberCount}')
                .setMaxLength(2000)
                .setRequired(true))
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
                .setDescription('Warna embed, contoh: #ED4245, error, info')
                .setMaxLength(32)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image_url')
                .setDescription('URL gambar/banner')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image_file')
                .setDescription('Upload gambar/banner dari galeri')
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
}

function previewPayload(config, interaction) {
    return buildLifecyclePayload(CUSTOM_MESSAGE_TYPES.GOODBYE, config, {
        user: interaction.user,
        guild: interaction.guild,
        member: interaction.member
    }, { forceNoPing: true });
}

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('Configure the goodbye message system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand => addGoodbyeOptions(
            subcommand.setName('setup').setDescription('Setup goodbye message full custom')
        ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('image')
                .setDescription('Menu upload gambar goodbye langsung dari galeri')
                .addAttachmentOption(option =>
                    option.setName('image_file')
                        .setDescription('Upload gambar/banner dari galeri')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('preview')
                .setDescription('Preview tampilan goodbye'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Lihat konfigurasi goodbye'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Matikan goodbye message')),

    async execute(interaction) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Missing Permissions', 'You need the **Manage Server** permission to use `/goodbye`.')]
            });
        }

        const subcommand = options.getSubcommand();

        try {
            switch (subcommand) {
                case 'setup':
                    return await handleSetup(interaction, client, guild);
                case 'image':
                    return await handleImage(interaction, client, guild);
                case 'preview':
                    return await handlePreview(interaction, client, guild);
                case 'config':
                    return await handleConfig(interaction, client, guild);
                case 'disable':
                    return await handleDisable(interaction, client, guild);
                default:
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Unknown Subcommand', 'Subcommand tidak dikenali.')]
                    });
            }
        } catch (error) {
            logger.error(`[Goodbye Custom] ${subcommand} failed`, error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Setup Failed', error.message || 'Terjadi error saat menyimpan goodbye.')]
            });
        }
    },
};

async function handleSetup(interaction, client, guild) {
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    const ping = interaction.options.getBoolean('ping') ?? false;
    const embedConfig = buildEmbedConfigFromOptions(interaction.options, getDefaultCustomConfig(CUSTOM_MESSAGE_TYPES.GOODBYE));
    embedConfig.description = message;

    const updated = await updateWelcomeConfig(client, guild.id, {
        goodbyeEnabled: true,
        goodbyeChannelId: channel.id,
        leaveMessage: message,
        goodbyePing: ping,
        leaveImage: embedConfig.image || null,
        leaveEmbed: embedConfig,
        goodbyeSetupBy: interaction.user.id,
        goodbyeSetupAt: new Date().toISOString()
    });

    const payload = previewPayload(updated, interaction);
    await InteractionHelper.safeEditReply(interaction, {
        content: `Goodbye akan dikirim ke ${channel}.`,
        embeds: payload.embeds
    });
}

async function handleImage(interaction, client, guild) {
    const imageUrl = resolveUploadedImage(interaction.options.getAttachment('image_file'));
    if (!imageUrl) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Invalid Image', 'File yang diupload tidak bisa dipakai sebagai gambar.')]
        });
    }

    const current = await getWelcomeConfig(client, guild.id);
    await updateWelcomeConfig(client, guild.id, {
        leaveImage: imageUrl,
        leaveEmbed: { ...(current.leaveEmbed || getDefaultCustomConfig(CUSTOM_MESSAGE_TYPES.GOODBYE)), image: imageUrl }
    });

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Gambar **Goodbye** berhasil diganti dari upload galeri.', '✅ Image Updated')]
    });
}

async function handlePreview(interaction, client, guild) {
    const config = await getWelcomeConfig(client, guild.id);
    const payload = previewPayload(config, interaction);
    await InteractionHelper.safeEditReply(interaction, {
        content: 'Preview **goodbye**:',
        embeds: payload.embeds
    });
}

async function handleConfig(interaction, client, guild) {
    const config = await getWelcomeConfig(client, guild.id);
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildConfigSummaryEmbed('👋 Goodbye Config', [
            { name: 'Status', value: config.goodbyeEnabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
            { name: 'Channel', value: config.goodbyeChannelId ? `<#${config.goodbyeChannelId}>` : '`Belum diset`', inline: true },
            { name: 'Ping', value: config.goodbyePing ? '✅ Ya' : '❌ Tidak', inline: true },
            { name: 'Title', value: config.leaveEmbed?.title || '`Default`', inline: false },
            { name: 'Image', value: config.leaveEmbed?.image || config.leaveImage ? '✅ Ada' : '❌ Tidak ada', inline: true },
            { name: 'Footer', value: config.leaveEmbed?.footer || '`Default`', inline: false }
        ], 'info')]
    });
}

async function handleDisable(interaction, client, guild) {
    await updateWelcomeConfig(client, guild.id, { goodbyeEnabled: false });
    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Goodbye message berhasil dimatikan.', '✅ Goodbye Disabled')]
    });
}
