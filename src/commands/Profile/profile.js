import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ProfileCardService } from '../../services/profileCardService.js';
import { PremiumMembershipService } from '../../services/premiumMembershipService.js';

function isValidHex(value) {
  return typeof value === 'string' && (/^#[0-9A-Fa-f]{6}$/.test(value.trim()) || /^[0-9A-Fa-f]{6}$/.test(value.trim()));
}

function normalizeColor(value) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function createTextProgressBar(progress, length = 18) {
  const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  const filled = Math.round(safeProgress * length);
  return `${'█'.repeat(filled)}${'░'.repeat(length - filled)} ${Math.round(safeProgress * 100)}%`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Lihat dan custom visual profile card')
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('Lihat profile card kamu atau user lain')
        .addUserOption((option) =>
          option.setName('user').setDescription('User yang mau dilihat').setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Edit title, bio, warna, dan favorite di profile card')
        .addStringOption((option) =>
          option.setName('title').setDescription('Title profile, maksimal 48 karakter').setMaxLength(48).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('bio').setDescription('Bio pendek, maksimal 160 karakter').setMaxLength(160).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('color').setDescription('Warna HEX, contoh #5865F2').setMaxLength(7).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('favorite').setDescription('Favorite card/pet/item/title').setMaxLength(48).setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('show_balance').setDescription('Tampilkan cash/bank di profile card').setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('show_premium').setDescription('Tampilkan status premium di profile card').setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('reset').setDescription('Reset custom profile kamu')
    ),

  category: 'Profile',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    try {
      const subcommand = interaction.options.getSubcommand();
      const guild = interaction.guild;
      const guildId = interaction.guildId;

      if (!guild || !guildId) {
        await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Command ini hanya bisa dipakai di server.')] });
        return;
      }

      if (subcommand === 'edit') {
        const updates = {};
        const title = interaction.options.getString('title');
        const bio = interaction.options.getString('bio');
        const colorInput = interaction.options.getString('color');
        const favorite = interaction.options.getString('favorite');
        const showBalance = interaction.options.getBoolean('show_balance');
        const showPremium = interaction.options.getBoolean('show_premium');

        if (title !== null) updates.title = title;
        if (bio !== null) updates.bio = bio;
        if (favorite !== null) updates.favorite = favorite;
        if (showBalance !== null) updates.showBalance = showBalance;
        if (showPremium !== null) updates.showPremium = showPremium;
        if (colorInput !== null) {
          if (!isValidHex(colorInput)) {
            await InteractionHelper.safeEditReply(interaction, {
              embeds: [errorEmbed('Format color harus HEX, contoh: `#5865F2` atau `5865F2`.')]
            });
            return;
          }
          updates.color = normalizeColor(colorInput);
        }

        if (Object.keys(updates).length === 0) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Isi minimal satu option yang ingin diubah, misalnya `title`, `bio`, atau `color`.')]
          });
          return;
        }

        const profile = await ProfileCardService.updateProfile(client, guildId, interaction.user.id, updates);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            [
              'Profile card berhasil diupdate.',
              `Title: **${profile.title || 'Default'}**`,
              `Bio: ${profile.bio}`,
              `Color: \`${profile.color}\``,
              `Favorite: **${profile.favorite || 'Belum dipilih'}**`,
              '',
              'Lihat hasilnya dengan `/profile view`.'
            ].join('\n'),
            '🎴 Profile Updated'
          )]
        });
        return;
      }

      if (subcommand === 'reset') {
        await ProfileCardService.resetProfile(client, guildId, interaction.user.id);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Custom profile kamu sudah direset ke default.', '♻️ Profile Reset')]
        });
        return;
      }

      if (subcommand === 'view') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        if (targetUser.bot) {
          await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Bot tidak punya profile card economy.')] });
          return;
        }

        const data = await ProfileCardService.collectProfileData(client, guild, targetUser);
        if (!data.profile.showBalance && targetUser.id !== interaction.user.id) {
          data.economy.wallet = 0;
          data.economy.bank = 0;
          data.economy.total = 0;
        }
        if (!data.profile.showPremium && targetUser.id !== interaction.user.id) {
          data.premium = { active: false, tier: null, source: 'hidden' };
        }

        const attachment = ProfileCardService.buildProfileAttachment(data);
        const fileName = attachment.name || `profile_${targetUser.id}.svg`;
        const premiumStatus = await PremiumMembershipService.getStatus(client, guild, targetUser.id).catch(() => ({ active: false }));

        const embed = new EmbedBuilder()
          .setTitle(`🎴 ${targetUser.username}'s Profile Card`)
          .setColor(data.profile.color || '#5865F2')
          .setImage(`attachment://${fileName}`)
          .addFields(
            { name: 'Level', value: `${data.level.level}`, inline: true },
            { name: 'XP', value: createTextProgressBar(data.level.progress), inline: false },
            { name: 'Premium', value: premiumStatus.active ? `${premiumStatus.tier?.emoji || '⭐'} ${premiumStatus.tier?.name || 'Premium'}` : 'Free Member', inline: true },
            { name: 'Badges', value: data.badges.length ? data.badges.join(' • ') : 'Belum ada badge', inline: false }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [embed],
          files: [attachment]
        });
      }
    } catch (error) {
      logger.error('[PROFILE] Command error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed(error.message || 'Terjadi error saat membuat profile card.')]
      });
    }
  }
};
