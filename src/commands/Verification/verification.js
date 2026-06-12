import { botConfig } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';
import { handleInteractionError, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { removeVerification } from '../../services/verificationService.js';
import { ContextualMessages } from '../../utils/messageTemplates.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../utils/database.js';
import verificationDashboard from './modules/verification_dashboard.js';
import {
    CUSTOM_MESSAGE_TYPES,
    buildEmbedConfigFromOptions,
    buildVerificationPayload,
    buildConfigSummaryEmbed,
    resolveUploadedImage,
    getDefaultCustomConfig
} from '../../services/customMessageService.js';

function addVerificationSetupOptions(subcommand) {
    return subcommand
        .addChannelOption(option =>
            option
                .setName('verification_channel')
                .setDescription('Channel tempat panel verifikasi dikirim')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addRoleOption(option =>
            option
                .setName('verified_role')
                .setDescription('Role yang diberikan setelah user verify')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Isi pesan verifikasi')
                .setMaxLength(2000)
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('button_text')
                .setDescription('Text tombol verify')
                .setMaxLength(80)
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('title')
                .setDescription('Judul embed verifikasi')
                .setMaxLength(256)
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('footer')
                .setDescription('Footer embed verifikasi')
                .setMaxLength(2048)
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('color')
                .setDescription('Warna embed, contoh: #57F287, success, info')
                .setMaxLength(32)
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('image_url')
                .setDescription('URL gambar/banner embed')
                .setRequired(false))
        .addAttachmentOption(option =>
            option
                .setName('image_file')
                .setDescription('Upload gambar/banner langsung dari galeri')
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('thumbnail')
                .setDescription('Thumbnail embed')
                .addChoices(
                    { name: 'Icon server', value: 'server' },
                    { name: 'Avatar admin', value: 'user' },
                    { name: 'Custom URL', value: 'custom' },
                    { name: 'Tidak pakai thumbnail', value: 'none' }
                )
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('thumbnail_url')
                .setDescription('URL thumbnail jika thumbnail = Custom URL')
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('fields')
                .setDescription('Field tambahan. Format: Judul=Isi; Judul 2=Isi 2')
                .setMaxLength(1500)
                .setRequired(false));
}

export default {
    data: new SlashCommandBuilder()
        .setName('verification')
        .setDescription('Manage the server verification system')
        .addSubcommand(subcommand => addVerificationSetupOptions(
            subcommand.setName('setup').setDescription('Set up verification panel full custom')
        ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('image')
                .setDescription('Menu upload gambar verifikasi langsung dari galeri')
                .addAttachmentOption(option =>
                    option
                        .setName('image_file')
                        .setDescription('Upload gambar/banner dari galeri')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('preview')
                .setDescription('Preview tampilan panel verifikasi'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Lihat konfigurasi verifikasi'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Matikan sistem verifikasi'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove verification from a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to remove verification from')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the verification system configuration dashboard')),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Missing ManageGuild permission for verification admin subcommand',
                    ErrorTypes.PERMISSION,
                    'You need the **Manage Server** permission to use this verification subcommand.',
                    { subcommand, requiredPermission: 'ManageGuild', userId: interaction.user.id }
                );
            }

            switch (subcommand) {
                case 'setup':
                    return await handleSetup(interaction, guild, client);
                case 'image':
                    return await handleImage(interaction, guild, client);
                case 'preview':
                    return await handlePreview(interaction, guild, client);
                case 'config':
                    return await handleConfig(interaction, guild, client);
                case 'disable':
                    return await handleDisable(interaction, guild, client);
                case 'remove':
                    return await handleRemove(interaction, guild, client);
                case 'dashboard':
                    return await verificationDashboard.execute(interaction, config, client);
                default:
                    throw createError(
                        `Unknown subcommand: ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        'Please select a valid subcommand.',
                        { subcommand }
                    );
            }
        } catch (error) {
            await handleInteractionError(
                interaction,
                error,
                { command: 'verification', subcommand: interaction.options.getSubcommand(false) }
            );
        }
    }
};

function buildVerifyButton(buttonText) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('verify_user')
            .setLabel((buttonText || botConfig.verification.defaultButtonText || 'Verify').slice(0, 80))
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );
}

function buildPanelPayload(guildConfig, guild, user) {
    const verificationConfig = guildConfig.verification || {};
    const payload = buildVerificationPayload(verificationConfig, { user, guild, member: null }, { canEmbed: true });
    payload.components = [buildVerifyButton(verificationConfig.buttonText)];
    return payload;
}

async function updateLivePanel(guild, guildConfig) {
    const cfg = guildConfig.verification;
    if (!cfg?.channelId || !cfg?.messageId) return;

    try {
        const channel = guild.channels.cache.get(cfg.channelId);
        if (!channel?.isTextBased?.()) return;
        const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
        if (!msg) return;
        await msg.edit(buildPanelPayload(guildConfig, guild, guild.client.user));
    } catch (error) {
        logger.warn('Could not update live verification panel:', error.message);
    }
}

async function validateSetup(interaction, guild, verificationChannel, verifiedRole) {
    const botMember = guild.members.me;

    if (!botMember) {
        throw createError(
            'Bot member not found in guild cache',
            ErrorTypes.CONFIGURATION,
            'I could not verify my permissions in this server. Please try again in a moment.',
            { guildId: guild.id }
        );
    }

    const requiredChannelPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ];
    const missingChannelPerms = requiredChannelPermissions.filter(perm =>
        !verificationChannel.permissionsFor(botMember).has(perm)
    );

    if (missingChannelPerms.length > 0) {
        throw createError(
            `Missing channel permissions: ${missingChannelPerms.join(', ')}`,
            ErrorTypes.PERMISSION,
            'I need **View Channel**, **Send Messages**, and **Embed Links** in the verification channel.',
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            'Missing ManageRoles permission',
            ErrorTypes.PERMISSION,
            "I need the 'Manage Roles' permission to give verified roles.",
            { missingPermission: 'ManageRoles' }
        );
    }

    if (verifiedRole.id === guild.id || verifiedRole.managed) {
        throw createError(
            'Invalid verified role selected',
            ErrorTypes.VALIDATION,
            'Please choose a normal assignable role (not @everyone or an integration-managed role).',
            { roleId: verifiedRole.id, managed: verifiedRole.managed }
        );
    }

    const botRole = botMember.roles.highest;
    if (verifiedRole.position >= botRole.position) {
        throw createError(
            'Role hierarchy error',
            ErrorTypes.PERMISSION,
            'The verified role must be below my highest role in the server role hierarchy.',
            { rolePosition: verifiedRole.position, botRolePosition: botRole.position }
        );
    }

    const guildConfig = await getGuildConfig(interaction.client, guild.id);
    const welcomeConfig = await getWelcomeConfig(interaction.client, guild.id);
    const hasAutoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
    const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

    if (hasAutoVerifyEnabled || hasAutoRoleConfigured) {
        throw createError(
            'Verification setup blocked by conflicting onboarding system',
            ErrorTypes.CONFIGURATION,
            'You cannot enable the verification system while **AutoVerify** or **AutoRole** is configured. Disable those first.',
            {
                guildId: guild.id,
                hasAutoVerifyEnabled,
                hasAutoRoleConfigured,
                expected: true,
                suppressErrorLog: true
            }
        );
    }
}

async function handleSetup(interaction, guild, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const verificationChannel = interaction.options.getChannel('verification_channel');
    const verifiedRole = interaction.options.getRole('verified_role');
    const message = interaction.options.getString('message') || botConfig.verification.defaultMessage;
    const buttonText = interaction.options.getString('button_text') || botConfig.verification.defaultButtonText;

    await validateSetup(interaction, guild, verificationChannel, verifiedRole);

    const embedConfig = buildEmbedConfigFromOptions(interaction.options, getDefaultCustomConfig(CUSTOM_MESSAGE_TYPES.VERIFICATION));
    embedConfig.description = message;

    const guildConfig = await getGuildConfig(client, guild.id);
    guildConfig.verification = {
        ...(guildConfig.verification || {}),
        enabled: true,
        channelId: verificationChannel.id,
        roleId: verifiedRole.id,
        message,
        buttonText,
        embed: embedConfig
    };

    const verifyMessage = await verificationChannel.send(buildPanelPayload(guildConfig, guild, interaction.user));
    guildConfig.verification.messageId = verifyMessage.id;

    await setGuildConfig(client, guild.id, guildConfig);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [ContextualMessages.configUpdated(
            'Verification System',
            [
                `Channel: ${verificationChannel}`,
                `Verified Role: ${verifiedRole}`,
                `Button Text: ${buttonText}`,
                `Title: ${embedConfig.title}`,
                `Image: ${embedConfig.image ? '✅ Ada' : '❌ Tidak ada'}`
            ]
        )]
    });
}

async function handleImage(interaction, guild, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const imageUrl = resolveUploadedImage(interaction.options.getAttachment('image_file'));
    if (!imageUrl) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Invalid Image', 'File yang diupload tidak bisa dipakai sebagai gambar.')]
        });
    }

    const guildConfig = await getGuildConfig(client, guild.id);
    guildConfig.verification = guildConfig.verification || {};
    guildConfig.verification.embed = {
        ...(guildConfig.verification.embed || getDefaultCustomConfig(CUSTOM_MESSAGE_TYPES.VERIFICATION)),
        image: imageUrl
    };

    await setGuildConfig(client, guild.id, guildConfig);
    await updateLivePanel(guild, guildConfig);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Gambar **Verification** berhasil diganti dari upload galeri.', '✅ Image Updated')]
    });
}

async function handlePreview(interaction, guild, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const guildConfig = await getGuildConfig(client, guild.id);
    const payload = buildPanelPayload(guildConfig, guild, interaction.user);
    await InteractionHelper.safeEditReply(interaction, {
        content: 'Preview **verification panel**:',
        embeds: payload.embeds,
        components: payload.components
    });
}

async function handleConfig(interaction, guild, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const guildConfig = await getGuildConfig(client, guild.id);
    const cfg = guildConfig.verification || {};
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildConfigSummaryEmbed('✅ Verification Config', [
            { name: 'Status', value: cfg.enabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
            { name: 'Channel', value: cfg.channelId ? `<#${cfg.channelId}>` : '`Belum diset`', inline: true },
            { name: 'Verified Role', value: cfg.roleId ? `<@&${cfg.roleId}>` : '`Belum diset`', inline: true },
            { name: 'Button Text', value: cfg.buttonText || botConfig.verification.defaultButtonText || '`Default`', inline: true },
            { name: 'Title', value: cfg.embed?.title || '`Default`', inline: false },
            { name: 'Image', value: cfg.embed?.image ? '✅ Ada' : '❌ Tidak ada', inline: true },
            { name: 'Footer', value: cfg.embed?.footer || '`Default`', inline: false }
        ], 'info')]
    });
}

async function handleDisable(interaction, guild, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const guildConfig = await getGuildConfig(client, guild.id);
    guildConfig.verification = guildConfig.verification || {};
    guildConfig.verification.enabled = false;
    await setGuildConfig(client, guild.id, guildConfig);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Verification system berhasil dimatikan.', '✅ Verification Disabled')]
    });
}

async function handleRemove(interaction, guild, client) {
    const targetUser = interaction.options.getUser('user');
    
    try {
        const result = await removeVerification(client, guild.id, targetUser.id, {
            moderatorId: interaction.user.id,
            reason: 'admin_removal'
        });

        if (!result.success) {
            if (result.notVerified) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [infoEmbed('Not Verified', `${targetUser.tag} does not currently have the verified role.`)],
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        logger.info('Verification removed via command', {
            guildId: guild.id,
            targetUserId: targetUser.id,
            moderatorId: interaction.user.id
        });

        return await InteractionHelper.safeReply(interaction, {
            embeds: [successEmbed('Verification Removed', `Verification removed from ${targetUser.tag}.`)]
        });

    } catch (error) {
        await handleInteractionError(
            interaction,
            error,
            { command: 'verification', subcommand: 'remove' }
        );
    }
}
