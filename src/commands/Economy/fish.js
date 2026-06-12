import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import GamePackService from '../../services/gamePackService.js';

const money = (amount) => GamePackService.money(amount);

async function replyError(interaction, message) {
  return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(message)] });
}

function leaderboardText(rows) {
  if (!rows.length) return 'Belum ada data leaderboard.';
  return rows.map((row, index) => `**${index + 1}.** <@${row.userId}> • Earned **${money(row.stats.earned)}** • Caught **${Number(row.stats.caught || 0).toLocaleString()}**`).join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Fishing game with inventory, dynamic prices, rod upgrades, and leaderboard')
    .addSubcommand(sub => sub.setName('cast').setDescription('Cast your fishing rod and catch fish'))
    .addSubcommand(sub => sub.setName('bag').setDescription('View your fish inventory'))
    .addSubcommand(sub => sub.setName('sell').setDescription('Sell all fish to the server dynamic market'))
    .addSubcommand(sub => sub.setName('shop').setDescription('View fish market prices and fishing upgrade info'))
    .addSubcommand(sub => sub
      .setName('buybait')
      .setDescription('Buy bait for fishing')
      .addIntegerOption(option => option.setName('amount').setDescription('Bait amount').setRequired(true).setMinValue(1).setMaxValue(200)))
    .addSubcommand(sub => sub.setName('upgrade').setDescription('Upgrade your fishing rod'))
    .addSubcommand(sub => sub.setName('leaderboard').setDescription('View fishing leaderboard')),

  async execute(interaction, config, client) {
    const deferred = await InteractionHelper.safeDefer(interaction, {});
    if (!deferred) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'cast') {
        const result = await GamePackService.fishCast(client, guildId, userId);
        if (!result.success) return replyError(interaction, result.message);
        const embed = createEmbed({
          title: `${result.caught.emoji} Fishing Catch!`,
          description: `Kamu menangkap **${result.caught.name} x${result.amount}**.\nRarity: **${result.caught.rarity}**\n\nJual ikanmu lewat **/fish sell** atau cek bag lewat **/fish bag**.`,
          color: result.caught.rarity === 'Legendary' ? 'warning' : result.caught.rarity === 'Epic' ? 'primary' : 'success',
          image: 'attachment://fish-catch.svg',
          fields: [
            { name: '🎣 Rod', value: `Lv.${result.data.rodLevel}`, inline: true },
            { name: '🪱 Bait', value: `${result.data.bait}`, inline: true },
            { name: '🐟 Total Caught', value: `${Number(result.data.stats.caught || 0).toLocaleString()}`, inline: true },
          ]
        });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
      }

      if (sub === 'bag') {
        const result = await GamePackService.fishBag(client, guildId, userId);
        const embed = createEmbed({
          title: '🎒 Fish Bag',
          description: result.text,
          color: 'info',
          fields: [
            { name: '🎣 Rod Level', value: `${result.data.rodLevel}`, inline: true },
            { name: '🪱 Bait', value: `${result.data.bait}`, inline: true },
            { name: '💰 Total Earned', value: money(result.data.stats.earned || 0), inline: true },
          ]
        });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      if (sub === 'sell') {
        const result = await GamePackService.fishSell(client, guildId, userId);
        if (!result.success) return replyError(interaction, result.message);
        const lines = result.sold.map(s => `${s.item.emoji} **${s.item.name}** x${s.amount} • ${money(s.price)} each`).join('\n');
        return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`${lines}\n\nTotal hasil penjualan: **${money(result.total)}**`, '🐟 Fish Sold')] });
      }

      if (sub === 'shop') {
        const embed = createEmbed({
          title: '🎣 Fishing Shop & Server Market',
          description: `${GamePackService.fishPricesText()}\n\n🪱 Bait price: **$75** each\n🎣 Rod upgrade: harga naik setiap level, max Lv.10\nHarga server berubah tiap ±6 jam.`,
          color: 'primary'
        });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      if (sub === 'buybait') {
        const amount = interaction.options.getInteger('amount', true);
        const result = await GamePackService.fishBuyBait(client, guildId, userId, amount);
        if (!result.success) return replyError(interaction, result.message);
        return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`Kamu membeli **${result.qty} bait** seharga **${money(result.cost)}**. Total bait sekarang: **${result.data.bait}**.`, '🪱 Bait Purchased')] });
      }

      if (sub === 'upgrade') {
        const result = await GamePackService.fishUpgrade(client, guildId, userId);
        if (!result.success) return replyError(interaction, result.message);
        return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`Fishing rod kamu naik ke **Lv.${result.data.rodLevel}**. Biaya: **${money(result.cost)}**.`, '🎣 Rod Upgraded')] });
      }

      if (sub === 'leaderboard') {
        const rows = await GamePackService.fishLeaderboard(client, guildId);
        const embed = createEmbed({ title: '🏆 Fishing Leaderboard', description: leaderboardText(rows), color: 'warning' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      return replyError(interaction, 'Subcommand fish tidak dikenal.');
    } catch (error) {
      logger.error('fish command error:', error);
      return replyError(interaction, 'Terjadi error saat menjalankan fishing game.');
    }
  }
};
