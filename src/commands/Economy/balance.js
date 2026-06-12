import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ADMIN_ACTIONS = new Set([
    'set-cash',
    'add-cash',
    'remove-cash',
    'set-bank',
    'add-bank',
    'remove-bank',
    'reset-money'
]);

function hasEconomyAdminPermission(interaction) {
    return (
        interaction.guild?.ownerId === interaction.user.id ||
        interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)
    );
}

function formatMoney(amount) {
    return `$${Math.max(0, Number(amount || 0)).toLocaleString()}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Check or manage a player's economy balance")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check or manage')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Economy admin action')
                .setRequired(false)
                .addChoices(
                    { name: 'View balance', value: 'view' },
                    { name: 'Set cash', value: 'set-cash' },
                    { name: 'Add cash', value: 'add-cash' },
                    { name: 'Remove cash', value: 'remove-cash' },
                    { name: 'Set bank', value: 'set-bank' },
                    { name: 'Add bank', value: 'add-bank' },
                    { name: 'Remove bank', value: 'remove-bank' },
                    { name: 'Reset money', value: 'reset-money' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount for set/add/remove actions')
                .setRequired(false)
                .setMinValue(0)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for admin economy changes')
                .setRequired(false)
                .setMaxLength(200)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const guildId = interaction.guildId;
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const action = interaction.options.getString('action') || 'view';
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (targetUser.bot) {
            throw createError(
                'Bot user queried for economy balance',
                ErrorTypes.VALIDATION,
                "Bots don't have an economy balance."
            );
        }

        const isAdminAction = ADMIN_ACTIONS.has(action);

        if (isAdminAction && !hasEconomyAdminPermission(interaction)) {
            throw createError(
                'Missing economy admin permission',
                ErrorTypes.PERMISSION,
                'You need **Manage Server** or **Administrator** permission to edit player cash.'
            );
        }

        if (isAdminAction && action !== 'reset-money' && amount === null) {
            throw createError(
                'Missing economy amount',
                ErrorTypes.VALIDATION,
                'Please fill the **amount** option for this action.'
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        if (!userData) {
            throw createError(
                'Failed to load economy data',
                ErrorTypes.DATABASE,
                'Failed to load economy data. Please try again later.',
                { userId: targetUser.id, guildId }
            );
        }

        const beforeWallet = Number(userData.wallet || 0);
        const beforeBank = Number(userData.bank || 0);

        if (isAdminAction) {
            switch (action) {
                case 'set-cash':
                    userData.wallet = amount;
                    break;
                case 'add-cash':
                    userData.wallet = beforeWallet + amount;
                    break;
                case 'remove-cash':
                    userData.wallet = Math.max(0, beforeWallet - amount);
                    break;
                case 'set-bank':
                    userData.bank = amount;
                    break;
                case 'add-bank':
                    userData.bank = beforeBank + amount;
                    break;
                case 'remove-bank':
                    userData.bank = Math.max(0, beforeBank - amount);
                    break;
                case 'reset-money':
                    userData.wallet = 0;
                    userData.bank = 0;
                    break;
                default:
                    break;
            }

            await setEconomyData(client, guildId, targetUser.id, userData);

            logger.info('[ECONOMY_ADMIN] Balance updated', {
                guildId,
                targetUserId: targetUser.id,
                moderatorId: interaction.user.id,
                action,
                amount,
                reason,
                beforeWallet,
                afterWallet: userData.wallet,
                beforeBank,
                afterBank: userData.bank,
                timestamp: new Date().toISOString()
            });

            const embed = successEmbed(
                `Economy balance for **${targetUser.username}** has been updated.`,
                '✅ Economy Updated'
            ).addFields(
                {
                    name: '👤 Player',
                    value: `${targetUser}`,
                    inline: true
                },
                {
                    name: '⚙️ Action',
                    value: action,
                    inline: true
                },
                {
                    name: '📝 Reason',
                    value: reason,
                    inline: false
                },
                {
                    name: '💵 Cash',
                    value: `${formatMoney(beforeWallet)} → **${formatMoney(userData.wallet)}**`,
                    inline: true
                },
                {
                    name: '🏦 Bank',
                    value: `${formatMoney(beforeBank)} → **${formatMoney(userData.bank)}**`,
                    inline: true
                }
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        const maxBank = getMaxBankCapacity(userData);
        const wallet = Number(userData.wallet || 0);
        const bank = Number(userData.bank || 0);

        const embed = createEmbed({
            title: `💰 ${targetUser.username}'s Balance`,
            description: `Here is the current financial status for ${targetUser.username}.`
        })
            .addFields(
                {
                    name: '💵 Cash',
                    value: formatMoney(wallet),
                    inline: true
                },
                {
                    name: '🏦 Bank',
                    value: `${formatMoney(bank)} / ${formatMoney(maxBank)}`,
                    inline: true
                },
                {
                    name: '💎 Total',
                    value: formatMoney(wallet + bank),
                    inline: true
                }
            )
            .setFooter({
                text: `Requested by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            });

        logger.info('[ECONOMY] Balance retrieved', { userId: targetUser.id, guildId, wallet, bank });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
};
