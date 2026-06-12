import { Events, PermissionFlagsBits } from 'discord.js';
import { getWelcomeConfig } from '../utils/database.js';
import { sendLifecycleMessage, CUSTOM_MESSAGE_TYPES } from '../services/customMessageService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;

      await handleServerBoost(oldMember, newMember);
      await handleNicknameLog(oldMember, newMember);

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};

async function handleServerBoost(oldMember, newMember) {
    const hadBoost = Boolean(oldMember.premiumSinceTimestamp);
    const hasBoost = Boolean(newMember.premiumSinceTimestamp);

    // Only trigger when a member starts boosting.
    if (hadBoost || !hasBoost) return;

    const guild = newMember.guild;
    const config = await getWelcomeConfig(newMember.client, guild.id);
    if (!config?.boosterEnabled || !config?.boosterChannelId) return;

    const channel = guild.channels.cache.get(config.boosterChannelId);
    if (!channel?.isTextBased?.()) return;

    await sendLifecycleMessage(channel, CUSTOM_MESSAGE_TYPES.BOOSTER, config, {
        user: newMember.user,
        guild,
        member: newMember,
        extra: {
            boostCount: guild.premiumSubscriptionCount || 0,
            boostLevel: guild.premiumTier || 0
        }
    });

    if (config.boosterRewardRoleId) {
        try {
            const role = guild.roles.cache.get(config.boosterRewardRoleId);
            const me = guild.members.me;
            if (
                role &&
                me?.permissions.has(PermissionFlagsBits.ManageRoles) &&
                role.position < me.roles.highest.position
            ) {
                await newMember.roles.add(role, 'Server booster reward role');
            }
        } catch (error) {
            logger.warn('Failed to assign booster reward role', {
                guildId: guild.id,
                userId: newMember.id,
                error: error.message
            });
        }
    }
}

async function handleNicknameLog(oldMember, newMember) {
    const fields = [];

    fields.push({
        name: '👤 Member',
        value: `${newMember.user.tag} (${newMember.user.id})`,
        inline: true
    });

    if (oldMember.nickname !== newMember.nickname) {
        fields.push({
          name: '🏷️ Old Nickname',
          value: oldMember.nickname || '*(no nickname)*',
          inline: true
        });

        fields.push({
          name: '🏷️ New Nickname',
          value: newMember.nickname || '*(no nickname)*',
          inline: true
        });

        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            description: `Member nickname changed: ${newMember.user.tag}`,
            userId: newMember.user.id,
            fields
          }
        });
    }
}
