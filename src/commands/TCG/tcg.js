import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData } from '../../utils/economy.js';
import {
  acceptTradeOffer,
  addCardToDeck,
  autoBuildDeck,
  battleNpc,
  buildCardSvg,
  buildPackSvg,
  buyListing,
  buyPackListing,
  buyPacksFromShop,
  calculateDeckStats,
  cancelListing,
  cancelPackListing,
  createTradeOffer,
  declineTradeOffer,
  formatCardLine,
  formatListingLine,
  formatPackListingLine,
  getCard,
  getCollection,
  getDeckCards,
  getElementText,
  getMarket,
  getPackMarket,
  getPacks,
  getRarityText,
  getTradeOffersForUser,
  openPack,
  paginate,
  removeCardFromDeck,
  sellCard,
  sellPackListing,
  sortCollectionCards,
  TCG_LIMITS,
} from '../../services/tcgService.js';

function buildPackChoices(option) {
  return option
    .setName('pack')
    .setDescription('Pack type')
    .setRequired(true)
    .addChoices(
      { name: 'Starter Pack - 500 coins', value: 'starter' },
      { name: 'Great Pack - 2,000 coins', value: 'great' },
      { name: 'Ultra Pack - 7,500 coins', value: 'ultra' },
      { name: 'Master Pack - 20,000 coins', value: 'master' },
    );
}

function addAmountOption(subcommand, description = 'Amount', max = 100) {
  return subcommand.addIntegerOption(option => option.setName('amount').setDescription(description).setRequired(false).setMinValue(1).setMaxValue(max));
}

function formatCoins(amount) { return `${Number(amount || 0).toLocaleString()} coins`; }

function ensureHumanUser(user, message = 'Bots cannot use TCG features.') {
  if (user?.bot) throw createError('Bot user used in TCG command', ErrorTypes.VALIDATION, message);
}

function visualFile(name, svg) {
  return new AttachmentBuilder(Buffer.from(svg, 'utf8'), { name });
}

function packInventoryText(packs = {}) {
  const lines = getPacks().map(pack => `${pack.emoji} **${pack.name}**: **${Number(packs[pack.id] || 0)}x**`);
  return lines.join('\n');
}

function packRatesText(pack) {
  return Object.entries(pack.chances)
    .filter(([, chance]) => chance > 0)
    .map(([rarity, chance]) => `${getRarityText(rarity)} ${(chance * 100).toFixed(chance < 0.01 ? 1 : 0)}%`)
    .join(' • ');
}

function summarizeCards(cards = [], limit = 12) {
  const text = cards.slice(0, limit).map(card => formatCardLine(card)).join('\n');
  const remaining = cards.length > limit ? `\n...and **${cards.length - limit}** more cards.` : '';
  return `${text}${remaining}`;
}

function offerLine(offer, currentUserId, index) {
  const direction = offer.toUserId === currentUserId ? `Incoming from <@${offer.fromUserId}>` : `Outgoing to <@${offer.toUserId}>`;
  return `**${index}.** \`${offer.id}\` • ${direction}\nOffer: ${formatCardLine(offer.offeredSnapshot, false)}\nRequest: ${formatCardLine(offer.requestedSnapshot, false)}\nExpires: <t:${Math.floor(new Date(offer.expiresAt).getTime() / 1000)}:R>`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('tcg')
    .setDescription('Play a visual monster-card TCG with packs, market, trade, deck, and battles')
    .addSubcommand(subcommand => subcommand.setName('profile').setDescription('View TCG profile and collection stats').addUserOption(option => option.setName('user').setDescription('User to view').setRequired(false)))
    .addSubcommand(subcommand => subcommand.setName('packs').setDescription('View the official TCG pack shop'))
    .addSubcommand(subcommand => addAmountOption(subcommand.setName('packbuy').setDescription('Buy sealed packs from the system shop').addStringOption(buildPackChoices), `Amount, max ${TCG_LIMITS.MAX_PACK_BUY_AMOUNT}`, TCG_LIMITS.MAX_PACK_BUY_AMOUNT))
    .addSubcommand(subcommand => subcommand.setName('packbag').setDescription('View your sealed pack inventory'))
    .addSubcommand(subcommand => addAmountOption(subcommand.setName('open').setDescription('Open sealed packs from your inventory').addStringOption(buildPackChoices), `Amount, max ${TCG_LIMITS.MAX_PACK_OPEN_AMOUNT}`, TCG_LIMITS.MAX_PACK_OPEN_AMOUNT))
    .addSubcommand(subcommand => subcommand.setName('packmarket').setDescription('View sealed pack listings from other players').addIntegerOption(option => option.setName('page').setDescription('Market page').setRequired(false).setMinValue(1)))
    .addSubcommand(subcommand => subcommand.setName('packsell').setDescription('Sell sealed packs to the player market').addStringOption(buildPackChoices).addIntegerOption(option => option.setName('amount').setDescription('Amount to sell').setRequired(true).setMinValue(1).setMaxValue(100)).addIntegerOption(option => option.setName('price').setDescription('Total listing price').setRequired(true).setMinValue(1)))
    .addSubcommand(subcommand => subcommand.setName('packbuylisting').setDescription('Buy sealed packs from the player market').addStringOption(option => option.setName('listing_id').setDescription('Pack listing ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('packcancel').setDescription('Cancel your sealed pack listing').addStringOption(option => option.setName('listing_id').setDescription('Pack listing ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('collection').setDescription('View a card collection').addUserOption(option => option.setName('user').setDescription('User to view').setRequired(false)).addIntegerOption(option => option.setName('page').setDescription('Collection page').setRequired(false).setMinValue(1)))
    .addSubcommand(subcommand => subcommand.setName('card').setDescription('View a visual card detail').addStringOption(option => option.setName('id').setDescription('Card instance ID from /tcg collection').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('sell').setDescription('Sell one card to the player card market').addStringOption(option => option.setName('id').setDescription('Card instance ID').setRequired(true)).addIntegerOption(option => option.setName('price').setDescription('Card price').setRequired(true).setMinValue(1)))
    .addSubcommand(subcommand => subcommand.setName('market').setDescription('View the player card market').addIntegerOption(option => option.setName('page').setDescription('Market page').setRequired(false).setMinValue(1)))
    .addSubcommand(subcommand => subcommand.setName('buy').setDescription('Buy a card from the player card market').addStringOption(option => option.setName('listing_id').setDescription('Card listing ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('cancel').setDescription('Cancel your card market listing').addStringOption(option => option.setName('listing_id').setDescription('Card listing ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('trade').setDescription('Create a card trade offer').addUserOption(option => option.setName('user').setDescription('User to trade with').setRequired(true)).addStringOption(option => option.setName('your_card').setDescription('Your offered card ID').setRequired(true)).addStringOption(option => option.setName('their_card').setDescription('Requested card ID from target collection').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('offers').setDescription('View your pending trade offers'))
    .addSubcommand(subcommand => subcommand.setName('tradeaccept').setDescription('Accept an incoming trade offer').addStringOption(option => option.setName('offer_id').setDescription('Trade offer ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('tradedecline').setDescription('Decline or cancel a trade offer').addStringOption(option => option.setName('offer_id').setDescription('Trade offer ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('deck').setDescription('View your active battle deck'))
    .addSubcommand(subcommand => subcommand.setName('deckadd').setDescription('Add a card to your battle deck').addStringOption(option => option.setName('id').setDescription('Card instance ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('deckremove').setDescription('Remove a card from your battle deck').addStringOption(option => option.setName('id').setDescription('Card instance ID').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('deckauto').setDescription('Automatically build a deck from your strongest cards'))
    .addSubcommand(subcommand => subcommand.setName('battle').setDescription('Battle an NPC trainer with your active deck').addStringOption(option => option.setName('difficulty').setDescription('NPC difficulty').setRequired(false).addChoices({ name: 'Easy', value: 'easy' }, { name: 'Normal', value: 'normal' }, { name: 'Hard', value: 'hard' }))),

  execute: withErrorHandling(async (interaction, config, client) => {
    const deferred = await InteractionHelper.safeDefer(interaction, {});
    if (!deferred) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'profile': {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        ensureHumanUser(targetUser, 'Bots do not have TCG profiles.');
        const [collection, economy] = await Promise.all([getCollection(client, guildId, targetUser.id), getEconomyData(client, guildId, targetUser.id)]);
        const cards = collection.cards || [];
        const listedCount = cards.filter(card => card.listed).length;
        const deck = getDeckCards(collection);
        const rarityCounts = cards.reduce((acc, card) => { acc[card.rarity] = (acc[card.rarity] || 0) + 1; return acc; }, {});
        const rarityText = ['legendary', 'epic', 'rare', 'uncommon', 'common'].map(rarity => `${getRarityText(rarity)}: **${rarityCounts[rarity] || 0}**`).join('\n');
        const embed = createEmbed({ title: `🎴 ${targetUser.username}'s TCG Profile`, description: cards.length ? `This player has collected **${cards.length}** cards and owns sealed packs.` : 'This player has not collected any cards yet.', thumbnail: targetUser.displayAvatarURL(), color: '#7C3AED' })
          .addFields(
            { name: '💰 Cash', value: formatCoins(economy.wallet || 0), inline: true },
            { name: '🃏 Cards', value: `${cards.length}/${TCG_LIMITS.MAX_COLLECTION_SIZE}`, inline: true },
            { name: '⚔️ Deck', value: `${deck.length}/${TCG_LIMITS.DECK_SIZE}`, inline: true },
            { name: '📦 Sealed Packs', value: packInventoryText(collection.packs), inline: false },
            { name: '📊 Rarity Collection', value: rarityText || 'No cards yet.', inline: false },
            { name: '🏷️ Market', value: `Cards Listed: **${listedCount}**\nCards Sold: **${collection.stats.cardsSold}**\nCards Bought: **${collection.stats.cardsBought}**`, inline: true },
            { name: '🤝 Trade / Battle', value: `Trades: **${collection.stats.tradesCompleted}**\nWins: **${collection.stats.battlesWon}**\nLosses: **${collection.stats.battlesLost}**`, inline: true },
            { name: '💸 Economy', value: `Spent: **${formatCoins(collection.stats.coinsSpent)}**\nEarned: **${formatCoins(collection.stats.coinsEarned)}**`, inline: true },
          );
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'packs': {
        const packs = getPacks();
        const description = packs.map(pack => `${pack.emoji} **${pack.name}** — **${formatCoins(pack.price)}**\n${pack.description}\nCards: **${pack.cardCount}** • Holo: **${Math.round(pack.holoChance * 100)}%**\n${packRatesText(pack)}`).join('\n\n');
        const embed = createEmbed({ title: '🎴 Official TCG Pack Shop', description, color: '#F59E0B' }).setFooter({ text: 'Use /tcg packbuy to buy sealed packs. Use /tcg open to open packs from your pack bag.' });
        const firstPack = packs[0];
        const fileName = 'tcg-pack-shop.svg';
        embed.setImage(`attachment://${fileName}`);
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [visualFile(fileName, buildPackSvg(firstPack))] });
      }

      case 'packbuy': {
        const packId = interaction.options.getString('pack');
        const amount = interaction.options.getInteger('amount') || 1;
        const result = await buyPacksFromShop(client, guildId, userId, packId, amount);
        const fileName = `tcg-pack-${result.pack.id}.svg`;
        const embed = createEmbed({ title: `${result.pack.emoji} Pack Purchased`, description: `You bought **${result.amount}x ${result.pack.name}** for **${formatCoins(result.totalPrice)}**.`, color: result.pack.color })
          .addFields({ name: '📦 In Your Pack Bag', value: `You now have **${result.packs[result.pack.id]}x ${result.pack.name}**.`, inline: true }, { name: '💰 Remaining Cash', value: formatCoins(result.wallet), inline: true })
          .setFooter({ text: 'Use /tcg open to open the sealed pack, or /tcg packsell to sell it to other players.' })
          .setImage(`attachment://${fileName}`);
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [visualFile(fileName, buildPackSvg(result.pack))] });
      }

      case 'packbag': {
        const collection = await getCollection(client, guildId, userId);
        const totalPacks = Object.values(collection.packs).reduce((sum, amount) => sum + Number(amount || 0), 0);
        const embed = createEmbed({ title: `📦 ${interaction.user.username}'s Pack Bag`, description: totalPacks ? packInventoryText(collection.packs) : 'You do not own any sealed packs yet. Use `/tcg packbuy` or `/tcg packmarket`.', thumbnail: interaction.user.displayAvatarURL(), color: '#3B82F6' })
          .addFields({ name: 'Total Sealed Packs', value: `${totalPacks}`, inline: true })
          .setFooter({ text: 'Sealed packs can be opened, sold, or bought from other players.' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'open': {
        const packId = interaction.options.getString('pack');
        const amount = interaction.options.getInteger('amount') || 1;
        const result = await openPack(client, guildId, userId, packId, amount);
        const bestCard = result.cards[0];
        const fileName = `tcg-card-${bestCard.instanceId}.svg`;
        const embed = createEmbed({ title: `${result.pack.emoji} ${interaction.user.username} opened ${result.amount}x ${result.pack.name}!`, description: summarizeCards(result.cards), color: '#A855F7' })
          .addFields({ name: '🏆 Best Pull', value: formatCardLine(bestCard), inline: false }, { name: '📦 Packs Left', value: `${result.packsLeft}x ${result.pack.name}`, inline: true })
          .setFooter({ text: 'The visual below shows your best pull from this opening.' })
          .setImage(`attachment://${fileName}`);
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [visualFile(fileName, buildCardSvg(bestCard, interaction.user.username))] });
      }

      case 'packmarket': {
        const page = interaction.options.getInteger('page') || 1;
        const market = await getPackMarket(client, guildId);
        const sorted = [...market.listings].sort((a, b) => b.price - a.price);
        const result = paginate(sorted, page, 10);
        const description = result.items.length ? result.items.map((listing, index) => formatPackListingLine(listing, ((result.page - 1) * 10) + index + 1)).join('\n') : 'No sealed packs are listed right now. Use `/tcg packsell` to list one.';
        const embed = createEmbed({ title: '📦 TCG Sealed Pack Market', description, color: '#F59E0B' }).addFields({ name: 'Active Listings', value: `${market.listings.length}/${TCG_LIMITS.MAX_PACK_MARKET_LISTINGS}`, inline: true }, { name: 'Page', value: `${result.page}/${result.totalPages}`, inline: true }).setFooter({ text: 'Use /tcg packbuylisting listing_id:<id> to buy.' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'packsell': {
        const packId = interaction.options.getString('pack');
        const amount = interaction.options.getInteger('amount');
        const price = interaction.options.getInteger('price');
        const listing = await sellPackListing(client, guildId, userId, packId, amount, price);
        const embed = createEmbed({ title: '🏷️ Sealed Pack Listed', description: formatPackListingLine(listing), color: '#F59E0B' })
          .addFields({ name: 'Listing ID', value: `\`${listing.id}\``, inline: true }, { name: 'Market Tax', value: `${Math.round(TCG_LIMITS.MARKET_TAX_RATE * 100)}% on sale`, inline: true });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'packbuylisting': {
        const listingId = interaction.options.getString('listing_id');
        const result = await buyPackListing(client, guildId, userId, listingId);
        const embed = createEmbed({ title: '✅ Sealed Pack Purchased', description: `You bought **${result.listing.amount}x ${result.pack?.name || result.listing.packId}** from <@${result.listing.sellerId}>.`, color: '#22C55E' })
          .addFields({ name: 'Price', value: formatCoins(result.listing.price), inline: true }, { name: 'Market Tax', value: formatCoins(result.tax), inline: true }, { name: 'Your Cash', value: formatCoins(result.buyerWallet), inline: true })
          .setFooter({ text: 'Use /tcg packbag to see your packs. Use /tcg open to open them.' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'packcancel': {
        const listingId = interaction.options.getString('listing_id');
        const listing = await cancelPackListing(client, guildId, userId, listingId);
        const embed = createEmbed({ title: '✅ Pack Listing Canceled', description: `${formatPackListingLine(listing, null)} has been returned to your pack bag.`, color: '#22C55E' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'collection': {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        ensureHumanUser(targetUser, 'Bots do not have TCG collections.');
        const page = interaction.options.getInteger('page') || 1;
        const collection = await getCollection(client, guildId, targetUser.id);
        const sortedCards = sortCollectionCards(collection.cards || []);
        const result = paginate(sortedCards, page, 10);
        const description = result.items.length ? result.items.map(card => formatCardLine(card)).join('\n') : 'No cards yet. Buy packs with `/tcg packbuy`, then open them with `/tcg open`.';
        const embed = createEmbed({ title: `🎴 ${targetUser.username}'s Collection`, description, thumbnail: targetUser.displayAvatarURL(), color: '#7C3AED' })
          .addFields({ name: 'Total Cards', value: `${collection.cards.length}/${TCG_LIMITS.MAX_COLLECTION_SIZE}`, inline: true }, { name: 'Page', value: `${result.page}/${result.totalPages}`, inline: true })
          .setFooter({ text: 'Use /tcg card id:<card_id> for visual card detail.' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'card': {
        const cardId = interaction.options.getString('id');
        const { card } = await getCard(client, guildId, userId, cardId);
        if (!card) throw createError('TCG card not found', ErrorTypes.VALIDATION, 'Card not found in your collection. Check the ID from `/tcg collection`.');
        const fileName = `tcg-card-${card.instanceId}.svg`;
        const embed = createEmbed({ title: `${card.holo ? '✨ ' : ''}${card.name}`, description: formatCardLine(card), color: '#7C3AED' })
          .addFields(
            { name: '🆔 Card ID', value: `\`${card.instanceId}\``, inline: true },
            { name: '⭐ Rarity', value: getRarityText(card.rarity), inline: true },
            { name: '🧬 Element', value: getElementText(card.element), inline: true },
            { name: '❤️ HP', value: `${card.hp}`, inline: true },
            { name: '⚔️ Attack', value: `${card.attack}`, inline: true },
            { name: '🛡️ Defense', value: `${card.defense}`, inline: true },
            { name: '💥 Skill', value: card.skill || 'Unknown', inline: true },
            { name: '🔥 Power', value: `${card.power}`, inline: true },
            { name: '🏷️ Market', value: card.listed ? `Listed as \`${card.listed}\`` : 'Not listed', inline: true },
          )
          .setFooter({ text: card.pulledAt ? `Pulled at ${new Date(card.pulledAt).toLocaleString()}` : 'TCG Card' })
          .setImage(`attachment://${fileName}`);
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [visualFile(fileName, buildCardSvg(card, interaction.user.username))] });
      }

      case 'sell': {
        const cardId = interaction.options.getString('id');
        const price = interaction.options.getInteger('price');
        const listing = await sellCard(client, guildId, userId, cardId, price);
        const embed = createEmbed({ title: '🏷️ Card Listed on Market', description: formatListingLine(listing), color: '#F59E0B' })
          .addFields({ name: 'Listing ID', value: `\`${listing.id}\``, inline: true }, { name: 'Price', value: formatCoins(listing.price), inline: true }, { name: 'Market Tax', value: `${Math.round(TCG_LIMITS.MARKET_TAX_RATE * 100)}% on sale`, inline: true });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'market': {
        const page = interaction.options.getInteger('page') || 1;
        const market = await getMarket(client, guildId);
        const sortedListings = [...market.listings].sort((a, b) => b.price - a.price);
        const result = paginate(sortedListings, page, 10);
        const description = result.items.length ? result.items.map((listing, index) => formatListingLine(listing, ((result.page - 1) * 10) + index + 1)).join('\n') : 'No cards are listed right now. Use `/tcg sell` to list one.';
        const embed = createEmbed({ title: '🛒 TCG Player Card Market', description, color: '#F59E0B' })
          .addFields({ name: 'Active Listings', value: `${market.listings.length}/${TCG_LIMITS.MAX_CARD_MARKET_LISTINGS}`, inline: true }, { name: 'Page', value: `${result.page}/${result.totalPages}`, inline: true })
          .setFooter({ text: 'Use /tcg buy listing_id:<id> to buy a card.' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'buy': {
        const listingId = interaction.options.getString('listing_id');
        const result = await buyListing(client, guildId, userId, listingId);
        const fileName = `tcg-card-${result.card.instanceId}.svg`;
        const embed = createEmbed({ title: '✅ Card Purchased!', description: `You bought ${formatCardLine(result.card, false)} from <@${result.listing.sellerId}>.`, color: '#22C55E' })
          .addFields({ name: 'Price', value: formatCoins(result.listing.price), inline: true }, { name: 'Market Tax', value: formatCoins(result.tax), inline: true }, { name: 'Your Cash', value: formatCoins(result.buyerWallet), inline: true })
          .setImage(`attachment://${fileName}`);
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [visualFile(fileName, buildCardSvg(result.card, interaction.user.username))] });
      }

      case 'cancel': {
        const listingId = interaction.options.getString('listing_id');
        const listing = await cancelListing(client, guildId, userId, listingId);
        const embed = createEmbed({ title: '✅ Listing Canceled', description: `${formatCardLine(listing.card, false)} has been removed from the market.`, color: '#22C55E' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'trade': {
        const targetUser = interaction.options.getUser('user');
        ensureHumanUser(targetUser, 'You cannot trade cards with a bot.');
        const yourCard = interaction.options.getString('your_card');
        const theirCard = interaction.options.getString('their_card');
        const offer = await createTradeOffer(client, guildId, userId, targetUser.id, yourCard, theirCard);
        const embed = createEmbed({ title: '🤝 Trade Offer Created', description: `<@${targetUser.id}> can accept with \`/tcg tradeaccept offer_id:${offer.id}\`.`, color: '#3B82F6' })
          .addFields({ name: 'Offer ID', value: `\`${offer.id}\``, inline: true }, { name: 'You Offer', value: formatCardLine(offer.offeredSnapshot, false), inline: false }, { name: 'You Request', value: formatCardLine(offer.requestedSnapshot, false), inline: false }, { name: 'Expires', value: `<t:${Math.floor(new Date(offer.expiresAt).getTime() / 1000)}:R>`, inline: true });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'offers': {
        const offers = await getTradeOffersForUser(client, guildId, userId);
        const result = paginate(offers, 1, 10);
        const description = result.items.length ? result.items.map((offer, index) => offerLine(offer, userId, index + 1)).join('\n\n') : 'You have no pending trade offers.';
        const embed = createEmbed({ title: '🤝 Pending TCG Trade Offers', description, color: '#3B82F6' }).setFooter({ text: 'Incoming offers can be accepted with /tcg tradeaccept or declined with /tcg tradedecline.' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'tradeaccept': {
        const offerId = interaction.options.getString('offer_id');
        const result = await acceptTradeOffer(client, guildId, userId, offerId);
        const embed = createEmbed({ title: '✅ Trade Accepted', description: `You received ${formatCardLine(result.yourNewCard, false)}.\n<@${result.offer.fromUserId}> received ${formatCardLine(result.theirNewCard, false)}.`, color: '#22C55E' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'tradedecline': {
        const offerId = interaction.options.getString('offer_id');
        const offer = await declineTradeOffer(client, guildId, userId, offerId);
        const embed = createEmbed({ title: '✅ Trade Offer Closed', description: `Trade offer \`${offer.id}\` has been declined/canceled.`, color: '#22C55E' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'deck': {
        const collection = await getCollection(client, guildId, userId);
        const deck = getDeckCards(collection);
        const stats = calculateDeckStats(deck);
        const description = deck.length ? deck.map((card, index) => `**${index + 1}.** ${formatCardLine(card)}`).join('\n') : 'Your deck is empty. Use `/tcg deckauto` or `/tcg deckadd`.';
        const embed = createEmbed({ title: `⚔️ ${interaction.user.username}'s Battle Deck`, description, thumbnail: interaction.user.displayAvatarURL(), color: '#EF4444' })
          .addFields({ name: 'Deck Size', value: `${stats.size}/${TCG_LIMITS.DECK_SIZE}`, inline: true }, { name: 'Total Power', value: `${stats.power}`, inline: true }, { name: 'Total HP', value: `${stats.hp}`, inline: true }, { name: 'Attack / Defense', value: `${stats.attack} / ${stats.defense}`, inline: true });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'deckadd': {
        const cardId = interaction.options.getString('id');
        const result = await addCardToDeck(client, guildId, userId, cardId);
        const embed = createEmbed({ title: '✅ Card Added to Deck', description: `${formatCardLine(result.card, false)} is now in your active battle deck.`, color: '#22C55E' }).addFields({ name: 'Deck Size', value: `${result.deck.length}/${TCG_LIMITS.DECK_SIZE}`, inline: true });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'deckremove': {
        const cardId = interaction.options.getString('id');
        const result = await removeCardFromDeck(client, guildId, userId, cardId);
        const embed = createEmbed({ title: '✅ Card Removed from Deck', description: `Card \`${cardId}\` was removed from your active deck.`, color: '#22C55E' }).addFields({ name: 'Deck Size', value: `${result.deck.length}/${TCG_LIMITS.DECK_SIZE}`, inline: true });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'deckauto': {
        const result = await autoBuildDeck(client, guildId, userId);
        const stats = calculateDeckStats(result.deck);
        const embed = createEmbed({ title: '⚔️ Auto Deck Built', description: result.deck.map((card, index) => `**${index + 1}.** ${formatCardLine(card)}`).join('\n'), color: '#EF4444' })
          .addFields({ name: 'Deck Size', value: `${result.deck.length}/${TCG_LIMITS.DECK_SIZE}`, inline: true }, { name: 'Total Power', value: `${stats.power}`, inline: true })
          .setFooter({ text: 'Listed cards are skipped automatically.' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      case 'battle': {
        const difficulty = interaction.options.getString('difficulty') || 'normal';
        const result = await battleNpc(client, guildId, userId, difficulty);
        const title = result.won ? '🏆 Battle Won!' : '💥 Battle Lost';
        const embed = createEmbed({ title, description: `You battled **${result.enemyName}** on **${difficulty}** difficulty.`, color: result.won ? '#22C55E' : '#EF4444' })
          .addFields(
            { name: 'Your Score', value: `${result.playerScore} = Deck ${result.deckStats.power} + Synergy ${result.synergyBonus} + Roll ${result.playerRoll}`, inline: false },
            { name: 'Enemy Score', value: `${result.enemyScore} = Base + Roll ${result.enemyRoll}`, inline: false },
            { name: 'Reward', value: result.won ? formatCoins(result.reward) : 'No reward this time.', inline: true },
            { name: 'Your Cash', value: formatCoins(result.wallet), inline: true },
          )
          .setFooter({ text: 'Build a stronger deck with rare/holo cards to win harder battles.' });
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      default:
        throw createError('Unknown TCG subcommand', ErrorTypes.VALIDATION, 'Unknown TCG subcommand.');
    }
  }, { command: 'tcg' }),
};
