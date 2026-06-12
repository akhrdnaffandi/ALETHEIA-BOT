import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { PremiumMembershipService } from '../../services/premiumMembershipService.js';

const TIER_CHOICES = [
  { name: 'Basic', value: 'basic' },
  { name: 'Gold', value: 'gold' },
  { name: 'Diamond', value: 'diamond' }
];

function isAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.guild?.ownerId === interaction.user.id
  );
}

function requireAdmin(interaction) {
  if (!isAdmin(interaction)) {
    throw new Error('Kamu butuh permission **Manage Server** atau **Administrator** untuk memakai aksi admin premium.');
  }
}

function formatStatus(status) {
  if (!status.enabled) return '❌ Disabled';
  if (!status.active) return '⚪ Free Member';
  const expiry = PremiumMembershipService.formatDate(status.expiresAt);
  return `${status.tier?.emoji || '⭐'} **${status.tier?.name || 'Premium'}**\nSource: **${status.source}**\nExpired: ${expiry}`;
}

function buildConfigDescription(config) {
  const role = config.roleId ? `<@&${config.roleId}>` : 'Belum diset';
  const log = config.logChannelId ? `<#${config.logChannelId}>` : 'Belum diset';
  return [
    `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
    `Role Premium: ${role}`,
    `Log Channel: ${log}`,
    `Default Durasi: **${config.defaultDays > 0 ? `${config.defaultDays} hari` : 'Lifetime'}**`,
    `Sync Premium Farm: **${config.syncPremiumFarm ? 'ON' : 'OFF'}**`
  ].join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Kelola premium membership server')
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Cek status premium kamu atau user lain')
        .addUserOption((option) =>
          option.setName('user').setDescription('User yang mau dicek').setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Tambah premium ke user')
        .addUserOption((option) =>
          option.setName('user').setDescription('User target').setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('days')
            .setDescription('Durasi premium dalam hari. Isi 0 untuk lifetime')
            .setMinValue(0)
            .setMaxValue(3650)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('tier')
            .setDescription('Tier premium')
            .addChoices(...TIER_CHOICES)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('note').setDescription('Catatan admin').setMaxLength(180).setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Hapus premium user')
        .addUserOption((option) =>
          option.setName('user').setDescription('User target').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Alasan penghapusan').setMaxLength(180).setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('check')
        .setDescription('Cek detail premium user')
        .addUserOption((option) =>
          option.setName('user').setDescription('User target').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Lihat daftar user premium')
        .addIntegerOption((option) =>
          option.setName('limit').setDescription('Jumlah data yang ditampilkan').setMinValue(1).setMaxValue(25).setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-role')
        .setDescription('Set role premium server')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role premium').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('clear-role').setDescription('Hapus role premium dari config')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-log')
        .setDescription('Set channel log premium')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel log premium')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-default-days')
        .setDescription('Set durasi default saat add premium')
        .addIntegerOption((option) =>
          option.setName('days').setDescription('0 = lifetime').setMinValue(0).setMaxValue(3650).setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('enable').setDescription('Aktifkan sistem premium')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Nonaktifkan sistem premium')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('config').setDescription('Lihat konfigurasi premium')
    ),

  category: 'Premium',

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

      if (subcommand === 'status') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const status = await PremiumMembershipService.getStatus(client, guild, targetUser.id);
        const embed = new EmbedBuilder()
          .setTitle(`⭐ Premium Status - ${targetUser.username}`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
          .setColor(status.active ? status.tier?.color || '#FEE75C' : '#747F8D')
          .setDescription(formatStatus(status))
          .addFields(
            { name: 'Source', value: status.source || 'none', inline: true },
            { name: 'Role Active', value: status.roleActive ? 'Yes' : 'No', inline: true },
            { name: 'Legacy Farm', value: status.legacyActive ? 'Yes' : 'No', inline: true }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
      }

      if (subcommand === 'check') {
        requireAdmin(interaction);
        const targetUser = interaction.options.getUser('user', true);
        const status = await PremiumMembershipService.getStatus(client, guild, targetUser.id);
        const record = status.record;
        const embed = new EmbedBuilder()
          .setTitle(`🔎 Premium Check - ${targetUser.username}`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
          .setColor(status.active ? status.tier?.color || '#FEE75C' : '#747F8D')
          .setDescription(formatStatus(status))
          .addFields(
            { name: 'Tier', value: status.tier?.name || 'Basic', inline: true },
            { name: 'Started', value: record?.startedAt ? PremiumMembershipService.formatDate(record.startedAt) : 'N/A', inline: true },
            { name: 'Added By', value: record?.addedBy ? `<@${record.addedBy}>` : 'N/A', inline: true },
            { name: 'Note', value: record?.note || 'Tidak ada catatan', inline: false }
          )
          .setTimestamp();
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
      }

      if (subcommand === 'add') {
        requireAdmin(interaction);
        const targetUser = interaction.options.getUser('user', true);
        const days = interaction.options.getInteger('days');
        const tier = interaction.options.getString('tier') || 'basic';
        const note = interaction.options.getString('note') || '';
        if (targetUser.bot) {
          await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Bot tidak perlu premium membership.')] });
          return;
        }
        const record = await PremiumMembershipService.addPremium(client, guild, targetUser, {
          days,
          tier,
          note,
          addedBy: interaction.user.id
        });
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            `${targetUser} sekarang menjadi premium **${tier}**.\nExpired: ${PremiumMembershipService.formatDate(record.expiresAt)}`,
            '⭐ Premium Added'
          )]
        });
        return;
      }

      if (subcommand === 'remove') {
        requireAdmin(interaction);
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason';
        await PremiumMembershipService.removePremium(client, guild, targetUser, {
          reason,
          removedBy: interaction.user.id
        });
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`${targetUser} sudah dihapus dari premium membership.`, '🗑️ Premium Removed')]
        });
        return;
      }

      if (subcommand === 'list') {
        requireAdmin(interaction);
        const limit = interaction.options.getInteger('limit') || 10;
        const entries = await PremiumMembershipService.listPremiumUsers(client, guild, limit);
        const description = entries.length
          ? entries.map((entry, index) => {
              const status = entry.activeNow ? '✅' : '❌';
              const expiry = PremiumMembershipService.formatDate(entry.expiresAt);
              return `**${index + 1}.** ${status} <@${entry.userId}> • **${entry.tier}** • ${expiry}`;
            }).join('\n')
          : 'Belum ada user premium yang tersimpan.';
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [infoEmbed(description, '⭐ Premium Members')]
        });
        return;
      }

      if (subcommand === 'set-role') {
        requireAdmin(interaction);
        const role = interaction.options.getRole('role', true);
        const saved = await PremiumMembershipService.setRole(client, guildId, role.id);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Role premium diset ke ${role}.\nPremium Farm juga ikut disinkronkan.`, '⚙️ Premium Role Updated')]
        });
        return;
      }

      if (subcommand === 'clear-role') {
        requireAdmin(interaction);
        await PremiumMembershipService.setRole(client, guildId, null);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Role premium sudah dihapus dari config.', '⚙️ Premium Role Cleared')]
        });
        return;
      }

      if (subcommand === 'set-log') {
        requireAdmin(interaction);
        const channel = interaction.options.getChannel('channel', true);
        await PremiumMembershipService.setLogChannel(client, guildId, channel.id);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Log premium diset ke ${channel}.`, '📝 Premium Log Updated')]
        });
        return;
      }

      if (subcommand === 'set-default-days') {
        requireAdmin(interaction);
        const days = interaction.options.getInteger('days', true);
        await PremiumMembershipService.setDefaultDays(client, guildId, days);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Default durasi premium diset ke **${days > 0 ? `${days} hari` : 'Lifetime'}**.`, '⏳ Default Duration Updated')]
        });
        return;
      }

      if (subcommand === 'enable' || subcommand === 'disable') {
        requireAdmin(interaction);
        const enabled = subcommand === 'enable';
        await PremiumMembershipService.setEnabled(client, guildId, enabled);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Sistem premium sekarang **${enabled ? 'aktif' : 'nonaktif'}**.`, '⚙️ Premium Status Updated')]
        });
        return;
      }

      if (subcommand === 'config') {
        requireAdmin(interaction);
        const premiumConfig = await PremiumMembershipService.getConfig(client, guildId);
        const embed = infoEmbed(buildConfigDescription(premiumConfig), '⚙️ Premium Configuration');
        embed.addFields({
          name: 'Tiers',
          value: Object.entries(premiumConfig.tiers)
            .map(([key, tier]) => `${tier.emoji} **${tier.name}** (${key})`)
            .join('\n'),
          inline: false
        });
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
      }
    } catch (error) {
      logger.error('[PREMIUM] Command error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed(error.message || 'Terjadi error saat menjalankan premium command.')]
      });
    }
  }
};
