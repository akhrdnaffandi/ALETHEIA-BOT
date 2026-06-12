import { createEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import TamagotchiService from '../../../services/tamagotchiService.js';
import { PET_FOODS, PET_SPECIES, TAMAGOTCHI_CONFIG, getFoodById, getSpeciesById } from '../../../data/tamagotchiData.js';

const money = (amount) => `$${Math.floor(Number(amount) || 0).toLocaleString()}`;
const limitText = (items, fallback = 'Tidak ada data.', max = 10) => items.length ? items.slice(0, max).join('\n') : fallback;

function statBar(value, size = 10) {
  const normalized = Math.max(0, Math.min(100, Number(value) || 0));
  const filled = Math.round((normalized / 100) * size);
  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)} ${Math.round(normalized)}%`;
}

async function replyError(interaction, message) {
  return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(message)] });
}

function getRequiredString(interaction, name) {
  return interaction.options.getString(name, true);
}

export default {
  async execute(interaction, config, client) {
    const deferred = await InteractionHelper.safeDefer(interaction, {});
    if (!deferred) return;

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    try {
      switch (subcommand) {
        case 'shop':
          return await handlePetShop(interaction, guildId);
        case 'adopt':
          return await handleAdopt(interaction, client, guildId, userId);
        case 'status':
          return await handleStatus(interaction, guildId, interaction.options.getUser('user')?.id || userId);
        case 'pets':
          return await handlePets(interaction, guildId, userId);
        case 'select':
          return await handleSelect(interaction, guildId, userId);
        case 'feed':
          return await handleFeed(interaction, guildId, userId);
        case 'play':
          return await handlePlay(interaction, guildId, userId);
        case 'nap':
          return await handleNap(interaction, guildId, userId);
        case 'train':
          return await handleTrain(interaction, guildId, userId);
        case 'collect':
          return await handleCollect(interaction, client, guildId, userId);
        case 'foodshop':
          return await handleFoodShop(interaction, guildId);
        case 'buyfood':
          return await handleBuyFood(interaction, client, guildId, userId);
        case 'foodbag':
          return await handleFoodBag(interaction, guildId, userId);
        case 'sellserver':
          return await handleSellFoodServer(interaction, client, guildId, userId);
        case 'sellfood':
          return await handleSellFood(interaction, guildId, userId);
        case 'buyfoodlisting':
          return await handleBuyFoodListing(interaction, client, guildId, userId);
        case 'sellpet':
          return await handleSellPet(interaction, guildId, userId);
        case 'buypet':
          return await handleBuyPet(interaction, client, guildId, userId);
        case 'sellpetserver':
          return await handleSellPetServer(interaction, client, guildId, userId);
        case 'market':
          return await handleMarket(interaction, guildId);
        case 'cancel':
          return await handleCancel(interaction, guildId, userId);
        case 'prices':
          return await handlePrices(interaction, guildId);
        default:
          return replyError(interaction, 'Subcommand Tamagotchi tidak dikenal.');
      }
    } catch (error) {
      logger.error('shop pet command error:', error);
      return replyError(interaction, 'Terjadi error saat menjalankan fitur Tamagotchi.');
    }
  }
};

async function handlePetShop(interaction, guildId) {
  const view = await TamagotchiService.getShopView(guildId);
  const lines = view.species.map((species) => {
    return `${species.emoji} **${species.name}** \`${species.id}\`\n${TamagotchiService.rarityLabel(species)} • Harga: **${money(species.basePrice)}** • Server sell: ±${Math.round(species.serverSellRate * 100)}%\n${species.description}`;
  });

  const embed = createEmbed({
    title: '🐾 Tamagotchi Pet Shop',
    description: `${lines.join('\n\n')}\n\nGunakan **/shop pet adopt species:<pet>** untuk membeli pet dari server.`,
    color: 'primary'
  });

  return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleAdopt(interaction, client, guildId, userId) {
  const speciesId = getRequiredString(interaction, 'species');
  const nickname = interaction.options.getString('nickname') || null;
  const result = await TamagotchiService.adoptPet(client, guildId, userId, speciesId, nickname);
  if (!result.success) return replyError(interaction, result.message);

  const embed = createEmbed({
    title: `${result.species.emoji} Pet Baru Diadopsi!`,
    description: `Kamu berhasil membeli **${result.pet.nickname}** (${result.species.name}) seharga **${money(result.species.basePrice)}**.\nKamu juga mendapat starter food **${result.starterFoodAmount}x Basic Kibble**.`,
    color: 'success',
    fields: [
      { name: 'Pet ID', value: `\`${result.pet.id}\``, inline: false },
      { name: 'Rarity', value: TamagotchiService.rarityLabel(result.species), inline: true },
      { name: 'Favorit Food', value: getFoodById(result.species.favoriteFood)?.name || '-', inline: true }
    ]
  });

  return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleStatus(interaction, guildId, targetUserId) {
  const result = await TamagotchiService.getStatus(guildId, targetUserId);
  if (!result.success) return replyError(interaction, result.message);

  const fileName = `tamagotchi-${result.pet.id}.svg`;
  const embed = createEmbed({
    title: `${result.species?.emoji || '🐾'} ${result.pet.nickname || result.species?.name}'s Status`,
    description: `${result.mood.emoji} Mood: **${result.mood.text}**\nLevel **${result.level}** • XP **${(result.pet.xp || 0).toLocaleString()} / ${result.nextXp.toLocaleString()}**`,
    color: 'info',
    fields: [
      { name: '🍖 Hunger', value: statBar(result.pet.hunger), inline: true },
      { name: '🎈 Happiness', value: statBar(result.pet.happiness), inline: true },
      { name: '⚡ Energy', value: statBar(result.pet.energy), inline: true },
      { name: '❤️ Health', value: statBar(result.pet.health), inline: true },
      { name: '⏰ Collect lagi', value: result.pet.lastCollect ? `<t:${Math.floor((result.pet.lastCollect + TAMAGOTCHI_CONFIG.collectCooldownMs) / 1000)}:R>` : 'Sekarang bisa', inline: true },
      { name: 'ID', value: `\`${result.pet.id}\``, inline: true }
    ],
    image: `attachment://${fileName}`
  });

  return InteractionHelper.safeEditReply(interaction, { embeds: [embed], files: [result.visual] });
}

async function handlePets(interaction, guildId, userId) {
  const result = await TamagotchiService.listPets(guildId, userId);
  if (!result.pets.length) return replyError(interaction, 'Kamu belum punya pet. Beli dulu lewat `/shop pet adopt`.');

  const lines = result.pets.map((pet) => `${pet.id === result.user.activePetId ? '⭐ ' : ''}${TamagotchiService.formatPetLine(pet)}`);
  const embed = createEmbed({
    title: '🐾 Koleksi Pet Kamu',
    description: `${limitText(lines, 'Tidak ada pet.', 12)}\n\nGunakan **/shop pet select pet_id:<id>** untuk mengganti pet aktif.`,
    color: 'primary'
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleSelect(interaction, guildId, userId) {
  const petId = getRequiredString(interaction, 'pet_id');
  const result = await TamagotchiService.selectPet(guildId, userId, petId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '⭐ Pet Aktif Diganti',
      description: `Sekarang pet aktif kamu adalah ${result.species?.emoji || '🐾'} **${result.pet.nickname || result.species?.name}**.`,
      color: 'success'
    })]
  });
}

async function handleFeed(interaction, guildId, userId) {
  const foodId = interaction.options.getString('food') || 'kibble_basic';
  const amount = interaction.options.getInteger('amount') || 1;
  const result = await TamagotchiService.feedPet(guildId, userId, foodId, amount);
  if (!result.success) return replyError(interaction, result.message);

  const bonusText = result.favoriteBonus > 1 ? '\n✨ Itu makanan favorit pet kamu! Bonus efek aktif.' : '';
  const embed = createEmbed({
    title: `${result.species?.emoji || '🐾'} Pet Diberi Makan`,
    description: `Kamu memberi **${amount}x ${result.food.name}** ke **${result.pet.nickname}**.${bonusText}`,
    color: 'success',
    fields: [
      { name: '🍖 Hunger', value: statBar(result.pet.hunger), inline: true },
      { name: '🎈 Happiness', value: statBar(result.pet.happiness), inline: true },
      { name: '❤️ Health', value: statBar(result.pet.health), inline: true }
    ]
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handlePlay(interaction, guildId, userId) {
  const result = await TamagotchiService.play(guildId, userId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '🎾 Play Time!',
      description: `${result.species?.emoji || '🐾'} **${result.pet.nickname}** bermain dan terlihat lebih senang.`,
      color: 'success',
      fields: [
        { name: '🎈 Happiness', value: statBar(result.pet.happiness), inline: true },
        { name: '⚡ Energy', value: statBar(result.pet.energy), inline: true },
        { name: '🍖 Hunger', value: statBar(result.pet.hunger), inline: true }
      ]
    })]
  });
}

async function handleNap(interaction, guildId, userId) {
  const result = await TamagotchiService.nap(guildId, userId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '💤 Pet Tidur Sebentar',
      description: `${result.species?.emoji || '🐾'} **${result.pet.nickname}** istirahat dan energinya naik.`,
      color: 'info',
      fields: [
        { name: '⚡ Energy', value: statBar(result.pet.energy), inline: true },
        { name: '❤️ Health', value: statBar(result.pet.health), inline: true },
        { name: '🍖 Hunger', value: statBar(result.pet.hunger), inline: true }
      ]
    })]
  });
}

async function handleTrain(interaction, guildId, userId) {
  const result = await TamagotchiService.train(guildId, userId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '🏋️ Training Selesai',
      description: `${result.species?.emoji || '🐾'} **${result.pet.nickname}** mendapat **${result.gainedXp} XP**.`,
      color: 'success',
      fields: [
        { name: 'XP Total', value: `${(result.pet.xp || 0).toLocaleString()} XP`, inline: true },
        { name: '⚡ Energy', value: statBar(result.pet.energy), inline: true },
        { name: '🍖 Hunger', value: statBar(result.pet.hunger), inline: true }
      ]
    })]
  });
}

async function handleCollect(interaction, client, guildId, userId) {
  const result = await TamagotchiService.collect(client, guildId, userId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '💰 Pet Reward Collected',
      description: `${result.species?.emoji || '🐾'} **${result.pet.nickname}** membantu kamu mendapatkan **${money(result.reward)}**.`,
      color: 'success',
      fields: [
        { name: 'Wallet Baru', value: money(result.economy.wallet), inline: true },
        { name: 'Collect lagi', value: `<t:${Math.floor((result.pet.lastCollect + TAMAGOTCHI_CONFIG.collectCooldownMs) / 1000)}:R>`, inline: true }
      ]
    })]
  });
}

async function handleFoodShop(interaction, guildId) {
  const view = await TamagotchiService.getShopView(guildId);
  const lines = PET_FOODS.map((food) => `${food.emoji} **${food.name}** \`${food.id}\` • Server price: **${money(view.prices[food.id])}**\n🍖 +${food.hunger} Hunger • 🎈 +${food.happiness} Happy • ${food.description}`);
  const embed = createEmbed({
    title: '🥣 Tamagotchi Food Shop',
    description: `${lines.join('\n\n')}\n\nHarga server bisa naik/turun otomatis. Update berikutnya <t:${Math.floor(view.nextUpdateAt / 1000)}:R>.`,
    color: 'primary'
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleBuyFood(interaction, client, guildId, userId) {
  const foodId = getRequiredString(interaction, 'food');
  const amount = interaction.options.getInteger('amount') || 1;
  const result = await TamagotchiService.buyFood(client, guildId, userId, foodId, amount);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '🛒 Makanan Dibeli',
      description: `Kamu membeli **${result.amount}x ${result.food.name}** dengan harga total **${money(result.total)}**.`,
      color: 'success',
      fields: [{ name: 'Harga satuan', value: money(result.price), inline: true }]
    })]
  });
}

async function handleFoodBag(interaction, guildId, userId) {
  const result = await TamagotchiService.getFoodBag(guildId, userId);
  const lines = Object.entries(result.foods)
    .filter(([, amount]) => amount > 0)
    .map(([foodId, amount]) => {
      const food = getFoodById(foodId);
      return `${food?.emoji || '🥣'} **${food?.name || foodId}** \`${foodId}\` • x${amount}`;
    });
  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '🎒 Food Bag',
      description: `${limitText(lines, 'Kamu belum punya makanan. Beli lewat `/shop pet buyfood`.')}`,
      color: 'info'
    })]
  });
}

async function handleSellFoodServer(interaction, client, guildId, userId) {
  const foodId = getRequiredString(interaction, 'food');
  const amount = interaction.options.getInteger('amount') || 1;
  const result = await TamagotchiService.sellFoodToServer(client, guildId, userId, foodId, amount);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '🏪 Makanan Dijual ke Server',
      description: `Kamu menjual **${result.amount}x ${result.food.name}** ke server dan mendapat **${money(result.total)}**.`,
      color: 'success',
      fields: [
        { name: 'Harga server / item', value: money(result.unitPrice), inline: true },
        { name: 'Wallet Baru', value: money(result.economy.wallet), inline: true }
      ]
    })]
  });
}

async function handleSellFood(interaction, guildId, userId) {
  const foodId = getRequiredString(interaction, 'food');
  const amount = interaction.options.getInteger('amount') || 1;
  const price = interaction.options.getInteger('price');
  const result = await TamagotchiService.createFoodListing(guildId, userId, foodId, amount, price);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '📦 Food Listing Dibuat',
      description: `Kamu menjual **${result.listing.amount}x ${result.food.name}** ke player dengan harga **${money(result.listing.price)}**.`,
      color: 'success',
      fields: [{ name: 'Listing ID', value: `\`${result.listing.id}\``, inline: false }]
    })]
  });
}

async function handleBuyFoodListing(interaction, client, guildId, userId) {
  const listingId = getRequiredString(interaction, 'listing_id');
  const result = await TamagotchiService.buyFoodListing(client, guildId, userId, listingId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '🛍️ Food Listing Dibeli',
      description: `Kamu membeli **${result.listing.amount}x ${result.food?.name || result.listing.foodId}** dengan harga **${money(result.listing.price)}**.`,
      color: 'success',
      fields: [{ name: 'Seller menerima', value: money(result.sellerIncome), inline: true }]
    })]
  });
}

async function handleSellPet(interaction, guildId, userId) {
  const petId = getRequiredString(interaction, 'pet_id');
  const price = interaction.options.getInteger('price');
  const result = await TamagotchiService.createPetListing(guildId, userId, petId, price);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '📦 Pet Listing Dibuat',
      description: `Kamu menjual ${result.species?.emoji || '🐾'} **${result.pet.nickname || result.species?.name}** ke player dengan harga **${money(result.listing.price)}**.`,
      color: 'success',
      fields: [{ name: 'Listing ID', value: `\`${result.listing.id}\``, inline: false }]
    })]
  });
}

async function handleBuyPet(interaction, client, guildId, userId) {
  const listingId = getRequiredString(interaction, 'listing_id');
  const result = await TamagotchiService.buyPetListing(client, guildId, userId, listingId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '🐾 Pet Listing Dibeli',
      description: `Kamu membeli ${result.species?.emoji || '🐾'} **${result.pet.nickname || result.species?.name}** dengan harga **${money(result.listing.price)}**.`,
      color: 'success',
      fields: [{ name: 'Seller menerima', value: money(result.sellerIncome), inline: true }]
    })]
  });
}

async function handleSellPetServer(interaction, client, guildId, userId) {
  const petId = getRequiredString(interaction, 'pet_id');
  const result = await TamagotchiService.sellPetToServer(client, guildId, userId, petId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '🏪 Pet Dijual ke Server',
      description: `Kamu menjual ${result.species?.emoji || '🐾'} **${result.pet.nickname || result.species?.name}** ke server dan mendapat **${money(result.total)}**.`,
      color: 'success',
      fields: [{ name: 'Wallet Baru', value: money(result.economy.wallet), inline: true }]
    })]
  });
}

async function handleMarket(interaction, guildId) {
  const type = interaction.options.getString('type') || 'all';
  const result = await TamagotchiService.getMarketView(guildId);
  if (!result.success) return replyError(interaction, result.message);

  const petLines = result.market.petListings.map((listing) => {
    const species = getSpeciesById(listing.pet.speciesId);
    return `\`${listing.id}\` ${species?.emoji || '🐾'} **${listing.pet.nickname || species?.name}** • ${money(listing.price)} • seller <@${listing.sellerId}>`;
  });
  const foodLines = result.market.foodListings.map((listing) => {
    const food = getFoodById(listing.foodId);
    return `\`${listing.id}\` ${food?.emoji || '🥣'} **${listing.amount}x ${food?.name || listing.foodId}** • ${money(listing.price)} • seller <@${listing.sellerId}>`;
  });

  const fields = [];
  if (type === 'all' || type === 'pets') fields.push({ name: '🐾 Pet Listings', value: limitText(petLines, 'Belum ada pet listing.'), inline: false });
  if (type === 'all' || type === 'food') fields.push({ name: '🥣 Food Listings', value: limitText(foodLines, 'Belum ada food listing.'), inline: false });

  const embed = createEmbed({
    title: '🏪 Tamagotchi Player Market',
    description: 'Market antar player. Harga ditentukan seller sendiri. Setiap transaksi kena tax 5%.',
    color: 'primary',
    fields
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleCancel(interaction, guildId, userId) {
  const listingId = getRequiredString(interaction, 'listing_id');
  const result = await TamagotchiService.cancelListing(guildId, userId, listingId);
  if (!result.success) return replyError(interaction, result.message);

  return InteractionHelper.safeEditReply(interaction, {
    embeds: [createEmbed({
      title: '↩️ Listing Dibatalkan',
      description: `Listing **${result.type}** berhasil dibatalkan dan item dikembalikan ke inventory kamu.`,
      color: 'success'
    })]
  });
}

async function handlePrices(interaction, guildId) {
  const view = await TamagotchiService.getShopView(guildId);
  const lines = PET_FOODS.map((food) => {
    const price = view.prices[food.id];
    const trend = price > food.basePrice ? '📈' : price < food.basePrice ? '📉' : '➖';
    return `${trend} ${food.emoji} **${food.name}**: **${money(price)}** | sell server ±**${money(Math.floor(price * 0.62))}**`;
  });

  const embed = createEmbed({
    title: '📈 Harga Server Food',
    description: `${lines.join('\n')}\n\nHarga server bisa naik/turun otomatis. Update berikutnya <t:${Math.floor(view.nextUpdateAt / 1000)}:R>.`,
    color: 'info'
  });
  return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}
