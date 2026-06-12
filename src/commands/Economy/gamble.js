import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import GamePackService from '../../services/gamePackService.js';

function money(amount) { return GamePackService.money(amount); }

function boolWinText(win) { return win ? 'Menang' : 'Kalah'; }

async function replyError(interaction, message) {
  return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(message)] });
}

function leaderboardText(rows, formatter) {
  if (!rows.length) return 'Belum ada data leaderboard.';
  return rows.map((row, index) => formatter(row, index)).join('\n');
}

export default {
  // File ini sengaja tetap bernama gamble.js supaya gampang replace file lama,
  // tapi command yang didaftarkan berubah menjadi /game agar tidak menambah jumlah slash command.
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Game center: Adventure RPG, TCG PvP, Pet Arena, Casino, and World Boss')
    .addSubcommand(subcommand => subcommand.setName('help').setDescription('Show the game pack help menu'))
    .addSubcommandGroup(group => group
      .setName('adventure')
      .setDescription('Dungeon / Adventure RPG')
      .addSubcommand(sub => sub.setName('profile').setDescription('View your adventure RPG profile'))
      .addSubcommand(sub => sub.setName('explore').setDescription('Explore dungeon rooms for loot, XP, and random events'))
      .addSubcommand(sub => sub.setName('fight').setDescription('Fight a dungeon monster'))
      .addSubcommand(sub => sub.setName('heal').setDescription('Heal HP and energy with potion or inn'))
      .addSubcommand(sub => sub.setName('inventory').setDescription('View your adventure inventory'))
      .addSubcommand(sub => sub.setName('leaderboard').setDescription('View top adventure players')))
    .addSubcommandGroup(group => group
      .setName('tcg')
      .setDescription('TCG PvP battle tools')
      .addSubcommand(sub => sub
        .setName('duel')
        .setDescription('Duel another player using TCG decks/cards')
        .addUserOption(option => option.setName('user').setDescription('Opponent').setRequired(true))))
    .addSubcommandGroup(group => group
      .setName('pet')
      .setDescription('Tamagotchi / Pet Arena battle')
      .addSubcommand(sub => sub
        .setName('duel')
        .setDescription('Battle your active pet against a player or NPC')
        .addUserOption(option => option.setName('user').setDescription('Opponent player. Leave empty for NPC').setRequired(false))))
    .addSubcommandGroup(group => group
      .setName('casino')
      .setDescription('Casino arcade games')
      .addSubcommand(sub => sub
        .setName('slot')
        .setDescription('Play slot machine')
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(100).setMaxValue(250000)))
      .addSubcommand(sub => sub
        .setName('coinflip')
        .setDescription('Bet on heads or tails')
        .addStringOption(option => option.setName('choice').setDescription('Your choice').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }))
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(100).setMaxValue(250000)))
      .addSubcommand(sub => sub
        .setName('roulette')
        .setDescription('Bet on red, black, or green')
        .addStringOption(option => option.setName('choice').setDescription('Roulette color').setRequired(true).addChoices({ name: 'Red', value: 'red' }, { name: 'Black', value: 'black' }, { name: 'Green', value: 'green' }))
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(100).setMaxValue(250000)))
      .addSubcommand(sub => sub
        .setName('blackjack')
        .setDescription('Play simplified blackjack')
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(100).setMaxValue(250000)))
      .addSubcommand(sub => sub
        .setName('wheel')
        .setDescription('Spin lucky wheel')
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(100).setMaxValue(250000))))
    .addSubcommandGroup(group => group
      .setName('boss')
      .setDescription('World Boss Event')
      .addSubcommand(sub => sub.setName('status').setDescription('View current world boss'))
      .addSubcommand(sub => sub.setName('attack').setDescription('Attack the world boss'))
      .addSubcommand(sub => sub.setName('spawn').setDescription('Force spawn a new boss. Manage Server required'))),

  async execute(interaction, config, client) {
    const deferred = await InteractionHelper.safeDefer(interaction, {});
    if (!deferred) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    try {
      if (!group && sub === 'help') return handleHelp(interaction);
      if (group === 'adventure') return handleAdventure(interaction, client, guildId, userId, sub);
      if (group === 'tcg') return handleTcg(interaction, client, guildId, userId, sub);
      if (group === 'pet') return handlePet(interaction, client, guildId, userId, sub);
      if (group === 'casino') return handleCasino(interaction, client, guildId, userId, sub);
      if (group === 'boss') return handleBoss(interaction, client, guildId, userId, sub);
      return replyError(interaction, 'Subcommand game tidak dikenal.');
    } catch (error) {
      logger.error('game command error:', error);
      return replyError(interaction, 'Terjadi error saat menjalankan game command.');
    }
  }
};

async function handleHelp(interaction) {
  const embed = createEmbed({
    title: '🎮 Game Pack Help',
    description: 'Pusat game server: Adventure RPG, TCG PvP, Pet Arena, Casino Arcade, Fishing, Mining, dan World Boss.',
    color: 'primary',
    fields: [
      { name: '🧭 Adventure RPG', value: '`/game adventure profile`\n`/game adventure explore`\n`/game adventure fight`\n`/game adventure heal`', inline: true },
      { name: '🃏 TCG PvP', value: '`/game tcg duel user:@player`\nMemakai deck/kartu dari fitur TCG.', inline: true },
      { name: '🐾 Pet Arena', value: '`/game pet duel`\n`/game pet duel user:@player`\nMemakai active pet Tamagotchi.', inline: true },
      { name: '🎰 Casino Arcade', value: '`/game casino slot`\n`/game casino coinflip`\n`/game casino roulette`\n`/game casino blackjack`\n`/game casino wheel`', inline: true },
      { name: '🐲 World Boss', value: '`/game boss status`\n`/game boss attack`', inline: true },
      { name: '🎣⛏️ Side Games', value: '`/fish cast` / `/fish sell`\n`/mine dig` / `/mine sell`', inline: true },
    ],
    footer: 'Catatan: file lama /gamble diubah menjadi /game agar tidak menambah jumlah command.'
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleAdventure(interaction, client, guildId, userId, sub) {
  if (sub === 'profile') {
    const result = await GamePackService.adventureProfile(client, guildId, userId);
    const embed = createEmbed({
      title: '🧭 Adventure RPG Profile',
      description: result.line,
      color: 'primary',
      image: 'attachment://adventure-profile.svg',
      fields: [
        { name: '🏰 Dungeon Floor', value: `${result.user.floor}`, inline: true },
        { name: '⚔️ Wins', value: `${result.user.wins}`, inline: true },
        { name: '💀 Losses', value: `${result.user.losses}`, inline: true },
      ]
    });
    return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
  }

  if (sub === 'explore') {
    const result = await GamePackService.adventureExplore(client, guildId, userId);
    if (!result.success) return replyError(interaction, result.message);
    const embed = createEmbed({
      title: '🧭 Dungeon Explore',
      description: `${result.description}\n\nXP +**${result.xp}**${result.reward ? `\nReward: **${money(result.reward)}**` : ''}${result.itemText ? `\nItem: ${result.itemText}` : ''}${result.leveled ? `\n🎉 Level up +${result.leveled}!` : ''}`,
      color: 'info',
      image: 'attachment://adventure-explore.svg',
    });
    return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
  }

  if (sub === 'fight') {
    const result = await GamePackService.adventureFight(client, guildId, userId);
    if (!result.success) return replyError(interaction, result.message);
    const embed = createEmbed({
      title: `${result.win ? '🏆 Victory' : '💀 Defeat'} vs ${result.monster.emoji} ${result.monster.name}`,
      description: result.win
        ? `Kamu menang battle dan mendapat **${money(result.reward)}** + **${result.xp} XP**.${result.leveled ? `\n🎉 Level up +${result.leveled}!` : ''}`
        : `Kamu kalah dan menerima **${result.damage} damage**, tapi tetap mendapat **${result.xp} XP**.`,
      color: result.win ? 'success' : 'error',
      image: 'attachment://adventure-fight.svg',
    });
    return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
  }

  if (sub === 'heal') {
    const result = await GamePackService.adventureHeal(client, guildId, userId);
    if (!result.success) return replyError(interaction, result.message);
    return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(result.message, '🧪 Adventure Heal')] });
  }

  if (sub === 'inventory') {
    const result = await GamePackService.adventureProfile(client, guildId, userId);
    const inv = result.user.inventory || {};
    const embed = createEmbed({
      title: '🎒 Adventure Inventory',
      description: Object.entries(inv).map(([k, v]) => `**${k}** x${Number(v || 0).toLocaleString()}`).join('\n') || 'Inventory kosong.',
      color: 'primary',
      fields: [{ name: 'Status', value: result.line }]
    });
    return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  }

  if (sub === 'leaderboard') {
    const rows = await GamePackService.adventureLeaderboard(client, guildId);
    const embed = createEmbed({
      title: '🏆 Adventure Leaderboard',
      description: leaderboardText(rows, (row, index) => `**${index + 1}.** <@${row.userId}> • Lv.${row.level} • Floor ${row.floor} • ${row.wins} wins`),
      color: 'warning'
    });
    return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  }
}

async function handleTcg(interaction, client, guildId, userId, sub) {
  if (sub !== 'duel') return replyError(interaction, 'Subcommand TCG tidak dikenal.');
  const target = interaction.options.getUser('user', true);
  if (target.bot) return replyError(interaction, 'Tidak bisa duel melawan bot.');
  const result = await GamePackService.tcgDuel(client, guildId, userId, target.id);
  if (!result.success) return replyError(interaction, result.message);
  const embed = createEmbed({
    title: `🃏 TCG Duel: ${boolWinText(result.win)}`,
    description: `<@${userId}> vs ${target}\nScore: **${result.aScore.toLocaleString()}** vs **${result.bScore.toLocaleString()}**\nReward: **${money(result.reward)}**`,
    color: result.win ? 'success' : 'error',
    image: 'attachment://tcg-duel.svg'
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
}

async function handlePet(interaction, client, guildId, userId, sub) {
  if (sub !== 'duel') return replyError(interaction, 'Subcommand pet tidak dikenal.');
  const target = interaction.options.getUser('user');
  if (target?.bot) return replyError(interaction, 'Tidak bisa duel melawan bot. Kosongkan opsi user untuk battle NPC.');
  const result = await GamePackService.petDuel(client, guildId, userId, target?.id || null);
  if (!result.success) return replyError(interaction, result.message);
  const enemyName = target ? `${target}` : 'Arena NPC';
  const embed = createEmbed({
    title: `🐾 Pet Arena: ${boolWinText(result.win)}`,
    description: `<@${userId}> vs ${enemyName}\nScore: **${result.aScore.toLocaleString()}** vs **${result.bScore.toLocaleString()}**\nReward: **${money(result.reward)}**`,
    color: result.win ? 'success' : 'error',
    image: 'attachment://pet-arena.svg'
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
}

async function handleCasino(interaction, client, guildId, userId, sub) {
  const bet = interaction.options.getInteger('bet', true);
  const choice = interaction.options.getString('choice') || null;
  const result = await GamePackService.casinoPlay(client, guildId, userId, sub, bet, { choice });
  if (!result.success) return replyError(interaction, result.message);
  const embed = createEmbed({
    title: result.title,
    description: `${result.description}\n\nWallet sekarang: **${money(result.wallet)}**`,
    color: result.win ? 'success' : 'error',
    image: `attachment://casino-${sub}.svg`
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
}

async function handleBoss(interaction, client, guildId, userId, sub) {
  if (sub === 'status') {
    const result = await GamePackService.bossStatus(client, guildId);
    const top = Object.entries(result.boss.participants || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, dmg], i) => `**${i + 1}.** <@${id}> • ${Number(dmg).toLocaleString()} dmg`)
      .join('\n') || 'Belum ada attacker.';
    const embed = createEmbed({
      title: `${result.boss.emoji} ${result.boss.name}`,
      description: `HP: **${Math.max(0, result.boss.hp).toLocaleString()} / ${result.boss.maxHp.toLocaleString()}** (${result.percent}%)\nEnds: <t:${Math.floor(result.boss.endsAt / 1000)}:R>`,
      color: 'error',
      fields: [{ name: '🏆 Top Damage', value: top }],
      image: 'attachment://world-boss.svg'
    });
    return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
  }

  if (sub === 'attack') {
    const result = await GamePackService.bossAttack(client, guildId, userId);
    if (!result.success) return replyError(interaction, result.message);
    const embed = createEmbed({
      title: result.defeated ? '🏆 World Boss Defeated!' : '⚔️ World Boss Attack',
      description: `Damage: **${result.damage.toLocaleString()}**\nReward: **${money(result.reward)}** + **${result.xp} XP**${result.leveled ? `\n🎉 Level up +${result.leveled}!` : ''}\nBoss HP: **${Math.max(0, result.boss.hp).toLocaleString()} / ${result.boss.maxHp.toLocaleString()}**`,
      color: result.defeated ? 'warning' : 'primary',
      image: 'attachment://boss-attack.svg'
    });
    return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
  }

  if (sub === 'spawn') {
    const member = interaction.member;
    const allowed = member?.permissions?.has(PermissionFlagsBits.ManageGuild) || member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (!allowed) return replyError(interaction, 'Command ini butuh permission **Manage Server**.');
    const boss = await GamePackService.bossSpawn(client, guildId);
    return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`Boss baru muncul: ${boss.emoji} **${boss.name}** dengan HP **${boss.maxHp.toLocaleString()}**.`, '🐲 World Boss Spawned')] });
  }
}
