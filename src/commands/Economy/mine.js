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
  return rows.map((row, index) => `**${index + 1}.** <@${row.userId}> • Earned **${money(row.stats.earned)}** • Mined **${Number(row.stats.mined || 0).toLocaleString()}**`).join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('mine')
    .setDescription('Mining game with inventory, dynamic prices, pickaxe upgrades, and leaderboard')
    .addSubcommand(sub => sub.setName('dig').setDescription('Dig in the mine and collect ores'))
    .addSubcommand(sub => sub.setName('bag').setDescription('View your ore inventory'))
    .addSubcommand(sub => sub.setName('sell').setDescription('Sell all ores to the server dynamic market'))
    .addSubcommand(sub => sub.setName('shop').setDescription('View ore prices and mining upgrade info'))
    .addSubcommand(sub => sub.setName('repair').setDescription('Repair your pickaxe durability'))
    .addSubcommand(sub => sub.setName('upgrade').setDescription('Upgrade your pickaxe'))
    .addSubcommand(sub => sub.setName('leaderboard').setDescription('View mining leaderboard')),

  async execute(interaction, config, client) {
    const deferred = await InteractionHelper.safeDefer(interaction, {});
    if (!deferred) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'dig') {
        const result = await GamePackService.mineDig(client, guildId, userId);
        if (!result.success) return replyError(interaction, result.message);
        const embed = createEmbed({
          title: `${result.ore.emoji} Mining Result!`,
          description: `Kamu mendapatkan **${result.ore.name} x${result.amount}**.\nRarity: **${result.ore.rarity}**\n\nJual ore lewat **/mine sell** atau cek bag lewat **/mine bag**.`,
          color: result.ore.rarity === 'Legendary' ? 'warning' : result.ore.rarity === 'Epic' ? 'primary' : 'success',
          image: 'attachment://mine-dig.svg',
          fields: [
            { name: '⛏️ Pickaxe', value: `Lv.${result.data.pickaxeLevel}`, inline: true },
            { name: '🧰 Durability', value: `${Math.round(result.data.durability)}%`, inline: true },
            { name: '🪨 Total Mined', value: `${Number(result.data.stats.mined || 0).toLocaleString()}`, inline: true },
          ]
        });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
      }

      if (sub === 'bag') {
        const result = await GamePackService.mineBag(client, guildId, userId);
        const embed = createEmbed({
          title: '🎒 Mining Bag',
          description: result.text,
          color: 'info',
          fields: [
            { name: '⛏️ Pickaxe Level', value: `${result.data.pickaxeLevel}`, inline: true },
            { name: '🧰 Durability', value: `${Math.round(result.data.durability)}%`, inline: true },
            { name: '💰 Total Earned', value: money(result.data.stats.earned || 0), inline: true },
          ]
        });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      if (sub === 'sell') {
        const result = await GamePackService.mineSell(client, guildId, userId);
        if (!result.success) return replyError(interaction, result.message);
        const lines = result.sold.map(s => `${s.item.emoji} **${s.item.name}** x${s.amount} • ${money(s.price)} each`).join('\n');
        return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`${lines}\n\nTotal hasil penjualan: **${money(result.total)}**`, '⛏️ Ores Sold')] });
      }

      if (sub === 'shop') {
        const embed = createEmbed({
          title: '⛏️ Mining Shop & Server Market',
          description: `${GamePackService.minePricesText()}\n\n🧰 Repair cost tergantung durability dan level.\n⛏️ Pickaxe upgrade: harga naik setiap level, max Lv.10\nHarga server berubah tiap ±6 jam.`,
          color: 'primary'
        });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      if (sub === 'repair') {
        const result = await GamePackService.mineRepair(client, guildId, userId);
        if (!result.success) return replyError(interaction, result.message);
        return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`Pickaxe kamu sudah diperbaiki ke **100% durability**. Biaya: **${money(result.cost)}**.`, '🧰 Pickaxe Repaired')] });
      }

      if (sub === 'upgrade') {
        const result = await GamePackService.mineUpgrade(client, guildId, userId);
        if (!result.success) return replyError(interaction, result.message);
        return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`Pickaxe kamu naik ke **Lv.${result.data.pickaxeLevel}**. Biaya: **${money(result.cost)}**.`, '⛏️ Pickaxe Upgraded')] });
      }

      if (sub === 'leaderboard') {
        const rows = await GamePackService.mineLeaderboard(client, guildId);
        const embed = createEmbed({ title: '🏆 Mining Leaderboard', description: leaderboardText(rows), color: 'warning' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      return replyError(interaction, 'Subcommand mine tidak dikenal.');
    } catch (error) {
      logger.error('mine command error:', error);
      return replyError(interaction, 'Terjadi error saat menjalankan mining game.');
    }
  }
};
