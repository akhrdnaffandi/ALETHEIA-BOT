import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor } from '../config/bot.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logger } from '../utils/logger.js';

export const CUSTOM_MESSAGE_TYPES = Object.freeze({
    WELCOME: 'welcome',
    GOODBYE: 'goodbye',
    BOOSTER: 'booster',
    VERIFICATION: 'verification'
});

const DEFAULTS = Object.freeze({
    welcome: {
        title: '🎉 Welcome!',
        description: 'Welcome {user} to {server}!',
        footer: 'Welcome to {server}!',
        color: 'success',
        thumbnail: { mode: 'user' },
        image: null,
        fields: []
    },
    goodbye: {
        title: '👋 Goodbye',
        description: '{user.tag} has left the server.',
        footer: 'Goodbye from {server}!',
        color: 'error',
        thumbnail: { mode: 'user' },
        image: null,
        fields: []
    },
    booster: {
        title: '💎 Server Boost!',
        description: 'Thank you {user} for boosting **{server}**!\n\n🚀 Total Boost: **{boostCount}**\n✨ Boost Level: **{boostLevel}**',
        footer: 'Thank you for supporting {server}!',
        color: '#F47FFF',
        thumbnail: { mode: 'user' },
        image: null,
        fields: []
    },
    verification: {
        title: '✅ Server Verification',
        description: 'Click the button below to verify yourself and gain access to the server!',
        footer: 'Verification System',
        color: 'success',
        thumbnail: { mode: 'server' },
        image: null,
        fields: []
    }
});

function clampText(value, maxLength, fallback = '') {
    const text = value === undefined || value === null ? fallback : String(value);
    return text.slice(0, maxLength);
}

function safeUrl(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

export function resolveUploadedImage(attachment, fallbackUrl = null) {
    const uploadUrl = attachment?.url ? safeUrl(attachment.url) : null;
    if (uploadUrl) return uploadUrl;
    return safeUrl(fallbackUrl);
}

export function normalizeColorInput(value, fallback = 'primary') {
    if (!value) return fallback;
    const raw = String(value).trim();
    if (!raw) return fallback;

    if (/^#?[0-9A-F]{6}$/i.test(raw)) {
        return raw.startsWith('#') ? raw : `#${raw}`;
    }

    return raw.toLowerCase();
}

function resolveColor(value, fallback = 'primary') {
    try {
        return getColor(normalizeColorInput(value, fallback), getColor(fallback));
    } catch {
        return getColor(fallback);
    }
}

export function parseCustomFields(rawFields = '') {
    if (!rawFields || typeof rawFields !== 'string') return [];

    // Format: Judul=Isi; Judul 2=Isi 2
    return rawFields
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const [name, ...valueParts] = part.split('=');
            const value = valueParts.join('=').trim();
            if (!name?.trim() || !value) return null;
            return {
                name: clampText(name.trim(), 256),
                value: clampText(value, 1024),
                inline: false
            };
        })
        .filter(Boolean)
        .slice(0, 8);
}

function extractUrl(value) {
    if (!value) return null;
    if (typeof value === 'string') return safeUrl(value);
    if (typeof value === 'object') return safeUrl(value.url);
    return null;
}

function normalizeThumbnail(value, defaultMode = 'user') {
    if (value === false || value === 'none') return { mode: 'none' };
    if (value === true) return { mode: defaultMode };
    if (typeof value === 'string') {
        if (['user', 'server', 'none', 'custom'].includes(value)) return { mode: value };
        const url = safeUrl(value);
        if (url) return { mode: 'custom', url };
    }
    if (value && typeof value === 'object') {
        return {
            mode: value.mode || defaultMode,
            url: safeUrl(value.url) || null
        };
    }
    return { mode: defaultMode };
}

function resolveThumbnailUrl(thumbnail, { user, guild }) {
    const normalized = normalizeThumbnail(thumbnail);
    if (normalized.mode === 'none') return null;
    if (normalized.mode === 'server') return guild?.iconURL?.({ size: 256 }) || null;
    if (normalized.mode === 'custom') return normalized.url || null;
    return user?.displayAvatarURL?.({ size: 256 }) || null;
}

export function applyTemplate(value, context = {}) {
    const { user, guild, member, extra = {} } = context;
    let result = formatWelcomeMessage(String(value ?? ''), { user, guild, member });

    const replacements = {
        '{member.displayName}': member?.displayName || user?.username || 'User',
        '{member.joinedAt}': member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown',
        '{account.createdAt}': user?.createdTimestamp ? `<t:${Math.floor(user.createdTimestamp / 1000)}:F>` : 'Unknown',
        '{boostCount}': guild?.premiumSubscriptionCount?.toString?.() || '0',
        '{boostLevel}': guild?.premiumTier?.toString?.() || '0',
        '{date}': `<t:${Math.floor(Date.now() / 1000)}:F>`,
        '{time}': `<t:${Math.floor(Date.now() / 1000)}:R>`,
        ...Object.fromEntries(Object.entries(extra).map(([key, val]) => [`{${key}}`, String(val ?? '')]))
    };

    for (const [token, replacement] of Object.entries(replacements)) {
        result = result.split(token).join(replacement);
    }

    return result;
}

export function buildEmbedConfigFromOptions(options, defaults = {}) {
    const imageFromUpload = resolveUploadedImage(options.getAttachment?.('image_file'), options.getString?.('image_url'));
    const thumbnailMode = options.getString?.('thumbnail') || defaults.thumbnail?.mode || 'user';
    const thumbnailUrl = safeUrl(options.getString?.('thumbnail_url'));

    return {
        title: options.getString?.('title') || defaults.title,
        description: options.getString?.('message') || options.getString?.('description') || defaults.description,
        footer: options.getString?.('footer') || defaults.footer,
        color: normalizeColorInput(options.getString?.('color'), defaults.color || 'primary'),
        image: imageFromUpload || defaults.image || null,
        thumbnail: {
            mode: thumbnailMode,
            url: thumbnailMode === 'custom' ? thumbnailUrl : null
        },
        fields: parseCustomFields(options.getString?.('fields') || '')
    };
}

function getTypeDefaults(type) {
    return DEFAULTS[type] || DEFAULTS.welcome;
}

export function createCustomEmbed(type, storedConfig = {}, context = {}) {
    const defaults = getTypeDefaults(type);
    const embedConfig = {
        ...defaults,
        ...(storedConfig || {})
    };

    // Backward compatibility with older configs.
    if (!embedConfig.description && storedConfig.message) embedConfig.description = storedConfig.message;
    if (!embedConfig.image && storedConfig.imageUrl) embedConfig.image = storedConfig.imageUrl;

    const embed = new EmbedBuilder()
        .setColor(resolveColor(embedConfig.color, defaults.color || 'primary'));

    const title = applyTemplate(embedConfig.title || defaults.title, context);
    const description = applyTemplate(embedConfig.description || defaults.description, context);
    const footer = applyTemplate(embedConfig.footer || defaults.footer, context);

    if (title) embed.setTitle(clampText(title, 256));
    if (description) embed.setDescription(clampText(description, 4096));
    if (footer) embed.setFooter({ text: clampText(footer, 2048) });

    const thumbnailUrl = resolveThumbnailUrl(embedConfig.thumbnail ?? defaults.thumbnail, context);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

    const imageUrl = extractUrl(embedConfig.image);
    if (imageUrl) embed.setImage(imageUrl);

    const fields = Array.isArray(embedConfig.fields) ? embedConfig.fields : [];
    const preparedFields = fields
        .map(field => ({
            name: clampText(applyTemplate(field.name, context), 256),
            value: clampText(applyTemplate(field.value, context), 1024),
            inline: Boolean(field.inline)
        }))
        .filter(field => field.name && field.value)
        .slice(0, 25);

    if (preparedFields.length > 0) embed.addFields(preparedFields);

    if (embedConfig.timestamp !== false) embed.setTimestamp();

    return embed;
}

export function getLifecycleEmbedConfig(type, config = {}) {
    if (type === CUSTOM_MESSAGE_TYPES.GOODBYE) {
        return {
            ...getTypeDefaults(type),
            ...(config.leaveEmbed || {}),
            description: config.leaveMessage || config.leaveEmbed?.description || getTypeDefaults(type).description,
            image: config.leaveImage || config.leaveEmbed?.image || getTypeDefaults(type).image
        };
    }

    if (type === CUSTOM_MESSAGE_TYPES.BOOSTER) {
        return {
            ...getTypeDefaults(type),
            ...(config.boosterEmbed || {}),
            description: config.boosterMessage || config.boosterEmbed?.description || getTypeDefaults(type).description,
            image: config.boosterImage || config.boosterEmbed?.image || getTypeDefaults(type).image
        };
    }

    return {
        ...getTypeDefaults(type),
        ...(config.welcomeEmbed || {}),
        description: config.welcomeMessage || config.welcomeEmbed?.description || getTypeDefaults(type).description,
        image: config.welcomeImage || config.welcomeEmbed?.image || getTypeDefaults(type).image
    };
}

function getPingEnabled(type, config = {}) {
    if (type === CUSTOM_MESSAGE_TYPES.GOODBYE) return Boolean(config.goodbyePing);
    if (type === CUSTOM_MESSAGE_TYPES.BOOSTER) return Boolean(config.boosterPing);
    return Boolean(config.welcomePing);
}

export function buildLifecyclePayload(type, config = {}, context = {}, options = {}) {
    const { canEmbed = true, forceNoPing = false } = options;
    const embedConfig = getLifecycleEmbedConfig(type, config);
    const description = applyTemplate(embedConfig.description, context);
    const shouldPing = !forceNoPing && getPingEnabled(type, config) && context.user?.id;
    const content = shouldPing ? `<@${context.user.id}>` : undefined;
    const allowedMentions = shouldPing ? { users: [context.user.id] } : { parse: [] };

    if (!canEmbed) {
        return {
            content: shouldPing ? `${content} ${description}` : description,
            allowedMentions
        };
    }

    return {
        content,
        allowedMentions,
        embeds: [createCustomEmbed(type, embedConfig, context)]
    };
}

export function buildVerificationPayload(verificationConfig = {}, context = {}, options = {}) {
    const embedConfig = {
        ...getTypeDefaults(CUSTOM_MESSAGE_TYPES.VERIFICATION),
        ...(verificationConfig.embed || {}),
        description: verificationConfig.message || verificationConfig.embed?.description || getTypeDefaults(CUSTOM_MESSAGE_TYPES.VERIFICATION).description
    };

    if (!options.canEmbed) {
        return {
            content: applyTemplate(embedConfig.description, context),
            allowedMentions: { parse: [] }
        };
    }

    return {
        embeds: [createCustomEmbed(CUSTOM_MESSAGE_TYPES.VERIFICATION, embedConfig, context)],
        allowedMentions: { parse: [] }
    };
}

export function hasChannelPermissions(channel, guild, permissions = []) {
    const me = guild?.members?.me;
    const channelPerms = me && channel?.permissionsFor?.(me);
    if (!channelPerms) return false;
    return channelPerms.has(permissions);
}

export async function sendLifecycleMessage(channel, type, config, context = {}) {
    const guild = context.guild || channel?.guild;
    const canEmbed = hasChannelPermissions(channel, guild, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ]);

    const canSendBasic = hasChannelPermissions(channel, guild, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages
    ]);

    if (!canSendBasic) return null;

    const payload = buildLifecyclePayload(type, config, context, { canEmbed });

    try {
        return await channel.send(payload);
    } catch (error) {
        logger.warn(`Failed to send ${type} custom message`, {
            guildId: guild?.id,
            channelId: channel?.id,
            error: error.message
        });
        return null;
    }
}

export function buildConfigSummaryEmbed(title, items = [], color = 'info') {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(resolveColor(color, 'info'))
        .setTimestamp();

    const fields = items
        .filter(item => item?.name && item?.value !== undefined)
        .map(item => ({
            name: clampText(item.name, 256),
            value: clampText(String(item.value), 1024),
            inline: Boolean(item.inline)
        }))
        .slice(0, 25);

    if (fields.length > 0) embed.addFields(fields);
    return embed;
}

export function getDefaultCustomConfig(type) {
    return { ...getTypeDefaults(type) };
}
