import { AttachmentBuilder } from 'discord.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { logger } from '../utils/logger.js';
import {
  PET_SPECIES,
  PET_FOODS,
  TAMAGOTCHI_CONFIG,
  RARITY_EMOJIS,
  getSpeciesById,
  getFoodById
} from '../data/tamagotchiData.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const now = () => Date.now();

function userKey(guildId, userId) {
  return `tamagotchi:${guildId}:user:${userId}`;
}

function marketKey(guildId) {
  return `tamagotchi:${guildId}:market`;
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultUserData() {
  return {
    activePetId: null,
    pets: [],
    foods: {},
    stats: {
      adopted: 0,
      fed: 0,
      played: 0,
      trained: 0,
      collected: 0,
      earned: 0,
      soldToServer: 0,
      marketSales: 0
    }
  };
}

function defaultMarketData() {
  const foodPrices = {};
  for (const food of PET_FOODS) {
    foodPrices[food.id] = food.basePrice;
  }

  return {
    petListings: [],
    foodListings: [],
    serverFoodPrices: foodPrices,
    lastPriceUpdate: 0
  };
}

function normalizeUserData(data) {
  const normalized = { ...defaultUserData(), ...(data || {}) };
  normalized.pets = Array.isArray(normalized.pets) ? normalized.pets : [];
  normalized.foods = normalized.foods && typeof normalized.foods === 'object' ? normalized.foods : {};
  normalized.stats = { ...defaultUserData().stats, ...(normalized.stats || {}) };
  return normalized;
}

function normalizeMarketData(data) {
  const normalized = { ...defaultMarketData(), ...(data || {}) };
  normalized.petListings = Array.isArray(normalized.petListings) ? normalized.petListings : [];
  normalized.foodListings = Array.isArray(normalized.foodListings) ? normalized.foodListings : [];
  normalized.serverFoodPrices = {
    ...defaultMarketData().serverFoodPrices,
    ...(normalized.serverFoodPrices || {})
  };
  return normalized;
}

function applyPetDecay(pet) {
  const current = now();
  const updatedAt = pet.updatedAt || current;
  const hours = Math.max(0, (current - updatedAt) / 3600000);

  if (hours <= 0.02) return pet;

  const hungerLoss = Math.floor(hours * 7);
  const happinessLoss = Math.floor(hours * 4);
  const energyGain = Math.floor(hours * 9);

  pet.hunger = clamp((pet.hunger ?? 80) - hungerLoss);
  pet.happiness = clamp((pet.happiness ?? 80) - happinessLoss);
  pet.energy = clamp((pet.energy ?? 80) + energyGain);

  if (pet.hunger < 15 || pet.happiness < 15) {
    pet.health = clamp((pet.health ?? 100) - Math.floor(hours * 4));
  } else if (pet.hunger > 55 && pet.happiness > 45) {
    pet.health = clamp((pet.health ?? 100) + Math.floor(hours * 2));
  }

  pet.updatedAt = current;
  return pet;
}

function levelFromXp(xp = 0) {
  return Math.max(1, Math.floor(Math.sqrt((Number(xp) || 0) / 100)) + 1);
}

function xpForNextLevel(level) {
  return Math.pow(level, 2) * 100;
}

function petMood(pet) {
  const average = ((pet.hunger || 0) + (pet.happiness || 0) + (pet.energy || 0) + (pet.health || 0)) / 4;
  if (pet.health <= 20) return { text: 'Sakit', emoji: '🤒' };
  if (pet.hunger <= 20) return { text: 'Lapar', emoji: '😢' };
  if (pet.happiness <= 20) return { text: 'Kesepian', emoji: '🥺' };
  if (pet.energy <= 20) return { text: 'Capek', emoji: '😴' };
  if (average >= 85) return { text: 'Bahagia banget', emoji: '🥰' };
  if (average >= 65) return { text: 'Senang', emoji: '😊' };
  if (average >= 40) return { text: 'Biasa saja', emoji: '😐' };
  return { text: 'Butuh perhatian', emoji: '😟' };
}

function conditionMultiplier(pet) {
  const average = ((pet.hunger || 0) + (pet.happiness || 0) + (pet.energy || 0) + (pet.health || 0)) / 4;
  if (average >= 90) return 1.35;
  if (average >= 75) return 1.15;
  if (average >= 50) return 1;
  if (average >= 30) return 0.7;
  return 0.45;
}

function getActivePet(userData) {
  if (!userData.activePetId && userData.pets.length > 0) {
    userData.activePetId = userData.pets[0].id;
  }
  const pet = userData.pets.find((item) => item.id === userData.activePetId) || null;
  if (pet) applyPetDecay(pet);
  return pet;
}

function sanitizeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createAnimatedPetSvg(pet, species) {
  const mood = petMood(pet);
  const level = levelFromXp(pet.xp);
  const bg = species?.color || '#5865F2';
  const accent = species?.accent || '#ffffff';
  const name = sanitizeSvgText(pet.nickname || species?.name || 'Pet');
  const rarity = sanitizeSvgText(species?.rarity || 'Unknown');
  const emoji = sanitizeSvgText(species?.emoji || '🐾');
  const moodText = sanitizeSvgText(`${mood.emoji} ${mood.text}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="430" viewBox="0 0 760 430">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="760" height="430" rx="34" fill="url(#bg)"/>
  <circle cx="105" cy="90" r="55" fill="${accent}" opacity="0.18">
    <animate attributeName="r" values="45;60;45" dur="3s" repeatCount="indefinite"/>
  </circle>
  <circle cx="665" cy="340" r="80" fill="#ffffff" opacity="0.12">
    <animate attributeName="r" values="70;90;70" dur="3.6s" repeatCount="indefinite"/>
  </circle>
  <g filter="url(#shadow)">
    <rect x="58" y="52" width="644" height="326" rx="28" fill="#ffffff" opacity="0.16"/>
    <rect x="78" y="72" width="604" height="286" rx="24" fill="#0f172a" opacity="0.48"/>
  </g>
  <g transform="translate(380 178)">
    <animateTransform attributeName="transform" type="translate" values="380 178;380 155;380 178;380 190;380 178" dur="2.2s" repeatCount="indefinite"/>
    <text x="0" y="48" text-anchor="middle" font-size="112">${emoji}</text>
  </g>
  <text x="380" y="82" text-anchor="middle" fill="#ffffff" font-size="38" font-family="Arial, sans-serif" font-weight="800">${name}</text>
  <text x="380" y="116" text-anchor="middle" fill="#e5e7eb" font-size="20" font-family="Arial, sans-serif">${rarity} • Level ${level} • ${moodText}</text>
  <g font-family="Arial, sans-serif" font-size="18" font-weight="700">
    <text x="115" y="300" fill="#ffffff">🍖 Hunger ${Math.round(pet.hunger || 0)}%</text>
    <text x="305" y="300" fill="#ffffff">🎈 Happy ${Math.round(pet.happiness || 0)}%</text>
    <text x="500" y="300" fill="#ffffff">⚡ Energy ${Math.round(pet.energy || 0)}%</text>
    <text x="300" y="334" fill="#ffffff">❤️ Health ${Math.round(pet.health || 0)}%</text>
  </g>
  <text x="380" y="395" text-anchor="middle" fill="#f9fafb" font-size="16" font-family="Arial, sans-serif" opacity="0.9">Animated Tamagotchi Visual • pet id: ${sanitizeSvgText(pet.id)}</text>
</svg>`;
}

function createAttachmentFromSvg(svg, fileName = 'tamagotchi.svg') {
  return new AttachmentBuilder(Buffer.from(svg, 'utf8'), { name: fileName });
}

async function getUser(guildId, userId) {
  return normalizeUserData(await getFromDb(userKey(guildId, userId), defaultUserData()));
}

async function saveUser(guildId, userId, data) {
  return setInDb(userKey(guildId, userId), normalizeUserData(data));
}

async function getMarket(guildId) {
  const market = normalizeMarketData(await getFromDb(marketKey(guildId), defaultMarketData()));
  const current = now();
  if (!market.lastPriceUpdate || current - market.lastPriceUpdate >= TAMAGOTCHI_CONFIG.priceUpdateMs) {
    for (const food of PET_FOODS) {
      const currentPrice = Number(market.serverFoodPrices[food.id] || food.basePrice);
      const movement = randomInt(-14, 16) / 100;
      const nextPrice = Math.round(currentPrice * (1 + movement));
      market.serverFoodPrices[food.id] = Math.max(food.minPrice, Math.min(food.maxPrice, nextPrice));
    }
    market.lastPriceUpdate = current;
    await setInDb(marketKey(guildId), market);
  }
  return market;
}

async function saveMarket(guildId, data) {
  return setInDb(marketKey(guildId), normalizeMarketData(data));
}

async function chargeWallet(client, guildId, userId, amount) {
  const economy = await getEconomyData(client, guildId, userId);
  if ((economy.wallet || 0) < amount) {
    return { success: false, message: `Cash tidak cukup. Kamu butuh **$${amount.toLocaleString()}**, saldo kamu **$${(economy.wallet || 0).toLocaleString()}**.` };
  }
  economy.wallet = (economy.wallet || 0) - amount;
  await setEconomyData(client, guildId, userId, economy);
  return { success: true, economy };
}

async function addWallet(client, guildId, userId, amount) {
  const economy = await getEconomyData(client, guildId, userId);
  economy.wallet = (economy.wallet || 0) + amount;
  await setEconomyData(client, guildId, userId, economy);
  return economy;
}

export class TamagotchiService {
  static getSpeciesChoices() {
    return PET_SPECIES.map((species) => ({ name: `${species.emoji} ${species.name}`, value: species.id })).slice(0, 25);
  }

  static getFoodChoices() {
    return PET_FOODS.map((food) => ({ name: `${food.emoji} ${food.name}`, value: food.id })).slice(0, 25);
  }

  static formatPetLine(pet) {
    const species = getSpeciesById(pet.speciesId);
    const mood = petMood(pet);
    return `\`${pet.id}\` ${species?.emoji || '🐾'} **${pet.nickname || species?.name || 'Pet'}** • Lv.${levelFromXp(pet.xp)} • ${mood.emoji} ${mood.text}`;
  }

  static async getShopView(guildId) {
    const market = await getMarket(guildId);
    return {
      species: PET_SPECIES,
      foods: PET_FOODS,
      prices: market.serverFoodPrices,
      nextUpdateAt: market.lastPriceUpdate + TAMAGOTCHI_CONFIG.priceUpdateMs
    };
  }

  static async adoptPet(client, guildId, userId, speciesId, nickname = null) {
    const species = getSpeciesById(speciesId);
    if (!species) return { success: false, message: 'Jenis pet tidak ditemukan.' };

    const user = await getUser(guildId, userId);
    if (user.pets.length >= TAMAGOTCHI_CONFIG.maxPetsPerUser) {
      return { success: false, message: `Kandang kamu penuh. Maksimal **${TAMAGOTCHI_CONFIG.maxPetsPerUser} pet**.` };
    }

    const payment = await chargeWallet(client, guildId, userId, species.basePrice);
    if (!payment.success) return payment;

    const pet = {
      id: createId('pet'),
      speciesId,
      nickname: nickname?.trim()?.slice(0, 24) || species.name,
      hunger: 78,
      happiness: 80,
      energy: 82,
      health: 100,
      xp: 0,
      createdAt: now(),
      updatedAt: now(),
      lastCollect: 0,
      lastPlay: 0,
      lastTrain: 0,
      lastNap: 0
    };

    user.pets.push(pet);
    user.activePetId = user.activePetId || pet.id;
    user.foods[TAMAGOTCHI_CONFIG.starterFoodId] = (user.foods[TAMAGOTCHI_CONFIG.starterFoodId] || 0) + TAMAGOTCHI_CONFIG.starterFoodAmount;
    user.stats.adopted += 1;
    await saveUser(guildId, userId, user);

    logger.info('[TAMAGOTCHI] Pet adopted', { guildId, userId, speciesId, petId: pet.id });
    return { success: true, pet, species, starterFoodAmount: TAMAGOTCHI_CONFIG.starterFoodAmount };
  }

  static async getStatus(guildId, userId) {
    const user = await getUser(guildId, userId);
    const pet = getActivePet(user);
    if (!pet) return { success: false, message: 'Kamu belum punya pet. Beli dulu lewat `/shop pet adopt`.' };
    await saveUser(guildId, userId, user);

    const species = getSpeciesById(pet.speciesId);
    const visual = createAttachmentFromSvg(createAnimatedPetSvg(pet, species), `tamagotchi-${pet.id}.svg`);
    return { success: true, user, pet, species, mood: petMood(pet), level: levelFromXp(pet.xp), nextXp: xpForNextLevel(levelFromXp(pet.xp)), visual };
  }

  static async listPets(guildId, userId) {
    const user = await getUser(guildId, userId);
    for (const pet of user.pets) applyPetDecay(pet);
    await saveUser(guildId, userId, user);
    return { success: true, user, pets: user.pets };
  }

  static async selectPet(guildId, userId, petId) {
    const user = await getUser(guildId, userId);
    const pet = user.pets.find((item) => item.id === petId);
    if (!pet) return { success: false, message: 'Pet ID tidak ditemukan di koleksi kamu.' };
    user.activePetId = pet.id;
    await saveUser(guildId, userId, user);
    return { success: true, pet, species: getSpeciesById(pet.speciesId) };
  }

  static async buyFood(client, guildId, userId, foodId, amount = 1) {
    const food = getFoodById(foodId);
    if (!food) return { success: false, message: 'Makanan tidak ditemukan.' };
    amount = Math.max(1, Math.min(99, Number(amount) || 1));

    const market = await getMarket(guildId);
    const price = market.serverFoodPrices[food.id] || food.basePrice;
    const total = price * amount;
    const payment = await chargeWallet(client, guildId, userId, total);
    if (!payment.success) return payment;

    const user = await getUser(guildId, userId);
    user.foods[food.id] = (user.foods[food.id] || 0) + amount;
    await saveUser(guildId, userId, user);
    return { success: true, food, amount, total, price };
  }

  static async feedPet(guildId, userId, foodId, amount = 1) {
    const food = getFoodById(foodId);
    if (!food) return { success: false, message: 'Makanan tidak ditemukan.' };
    amount = Math.max(1, Math.min(10, Number(amount) || 1));

    const user = await getUser(guildId, userId);
    const pet = getActivePet(user);
    if (!pet) return { success: false, message: 'Kamu belum punya pet aktif.' };
    if ((user.foods[food.id] || 0) < amount) return { success: false, message: `Stok **${food.name}** tidak cukup.` };

    user.foods[food.id] -= amount;
    if (user.foods[food.id] <= 0) delete user.foods[food.id];

    const species = getSpeciesById(pet.speciesId);
    const favoriteBonus = species?.favoriteFood === food.id ? 1.35 : 1;
    pet.hunger = clamp((pet.hunger || 0) + Math.round(food.hunger * amount * favoriteBonus));
    pet.happiness = clamp((pet.happiness || 0) + Math.round(food.happiness * amount * favoriteBonus));
    pet.health = clamp((pet.health || 0) + Math.round(2 * amount * favoriteBonus));
    pet.xp = (pet.xp || 0) + Math.round(10 * amount * favoriteBonus);
    pet.updatedAt = now();
    user.stats.fed += amount;

    await saveUser(guildId, userId, user);
    return { success: true, food, pet, species, amount, favoriteBonus };
  }

  static async play(guildId, userId) {
    const user = await getUser(guildId, userId);
    const pet = getActivePet(user);
    if (!pet) return { success: false, message: 'Kamu belum punya pet aktif.' };
    const current = now();
    const remaining = (pet.lastPlay || 0) + TAMAGOTCHI_CONFIG.playCooldownMs - current;
    if (remaining > 0) return { success: false, message: `Pet kamu masih capek main. Coba lagi <t:${Math.floor(((pet.lastPlay || 0) + TAMAGOTCHI_CONFIG.playCooldownMs) / 1000)}:R>.` };
    if ((pet.energy || 0) < 15) return { success: false, message: 'Energy pet terlalu rendah. Pakai `/shop pet nap` dulu.' };

    pet.energy = clamp((pet.energy || 0) - 14);
    pet.happiness = clamp((pet.happiness || 0) + 22);
    pet.hunger = clamp((pet.hunger || 0) - 7);
    pet.xp = (pet.xp || 0) + 25;
    pet.lastPlay = current;
    pet.updatedAt = current;
    user.stats.played += 1;
    await saveUser(guildId, userId, user);
    return { success: true, pet, species: getSpeciesById(pet.speciesId) };
  }

  static async nap(guildId, userId) {
    const user = await getUser(guildId, userId);
    const pet = getActivePet(user);
    if (!pet) return { success: false, message: 'Kamu belum punya pet aktif.' };
    const current = now();
    const remaining = (pet.lastNap || 0) + TAMAGOTCHI_CONFIG.napCooldownMs - current;
    if (remaining > 0) return { success: false, message: `Pet baru saja tidur. Coba lagi <t:${Math.floor(((pet.lastNap || 0) + TAMAGOTCHI_CONFIG.napCooldownMs) / 1000)}:R>.` };

    pet.energy = clamp((pet.energy || 0) + 35);
    pet.health = clamp((pet.health || 0) + 8);
    pet.hunger = clamp((pet.hunger || 0) - 5);
    pet.lastNap = current;
    pet.updatedAt = current;
    await saveUser(guildId, userId, user);
    return { success: true, pet, species: getSpeciesById(pet.speciesId) };
  }

  static async train(guildId, userId) {
    const user = await getUser(guildId, userId);
    const pet = getActivePet(user);
    if (!pet) return { success: false, message: 'Kamu belum punya pet aktif.' };
    const current = now();
    const remaining = (pet.lastTrain || 0) + TAMAGOTCHI_CONFIG.trainCooldownMs - current;
    if (remaining > 0) return { success: false, message: `Training masih cooldown. Coba lagi <t:${Math.floor(((pet.lastTrain || 0) + TAMAGOTCHI_CONFIG.trainCooldownMs) / 1000)}:R>.` };
    if ((pet.energy || 0) < 30 || (pet.hunger || 0) < 25) return { success: false, message: 'Pet butuh energy dan hunger minimal 30/25 untuk training.' };

    const gainedXp = randomInt(55, 110);
    pet.energy = clamp((pet.energy || 0) - 28);
    pet.hunger = clamp((pet.hunger || 0) - 16);
    pet.happiness = clamp((pet.happiness || 0) + 4);
    pet.xp = (pet.xp || 0) + gainedXp;
    pet.lastTrain = current;
    pet.updatedAt = current;
    user.stats.trained += 1;
    await saveUser(guildId, userId, user);
    return { success: true, pet, species: getSpeciesById(pet.speciesId), gainedXp };
  }

  static async collect(client, guildId, userId) {
    const user = await getUser(guildId, userId);
    const pet = getActivePet(user);
    if (!pet) return { success: false, message: 'Kamu belum punya pet aktif.' };
    const current = now();
    const remaining = (pet.lastCollect || 0) + TAMAGOTCHI_CONFIG.collectCooldownMs - current;
    if (remaining > 0) return { success: false, message: `Reward pet masih cooldown. Coba lagi <t:${Math.floor(((pet.lastCollect || 0) + TAMAGOTCHI_CONFIG.collectCooldownMs) / 1000)}:R>.` };

    const species = getSpeciesById(pet.speciesId);
    const level = levelFromXp(pet.xp);
    const base = randomInt(species?.incomeMin || 100, species?.incomeMax || 300);
    const reward = Math.max(1, Math.floor(base * conditionMultiplier(pet) * (1 + (level - 1) * 0.06)));
    pet.lastCollect = current;
    pet.hunger = clamp((pet.hunger || 0) - 8);
    pet.energy = clamp((pet.energy || 0) - 7);
    pet.xp = (pet.xp || 0) + 18;
    pet.updatedAt = current;
    user.stats.collected += 1;
    user.stats.earned += reward;
    await saveUser(guildId, userId, user);
    const economy = await addWallet(client, guildId, userId, reward);
    return { success: true, pet, species, reward, economy };
  }

  static async getFoodBag(guildId, userId) {
    const user = await getUser(guildId, userId);
    return { success: true, user, foods: user.foods };
  }

  static async sellFoodToServer(client, guildId, userId, foodId, amount = 1) {
    const food = getFoodById(foodId);
    if (!food) return { success: false, message: 'Makanan tidak ditemukan.' };
    amount = Math.max(1, Math.min(99, Number(amount) || 1));
    const user = await getUser(guildId, userId);
    if ((user.foods[food.id] || 0) < amount) return { success: false, message: `Stok **${food.name}** tidak cukup.` };

    const market = await getMarket(guildId);
    const serverPrice = market.serverFoodPrices[food.id] || food.basePrice;
    const unitPrice = Math.max(1, Math.floor(serverPrice * 0.62));
    const total = unitPrice * amount;

    user.foods[food.id] -= amount;
    if (user.foods[food.id] <= 0) delete user.foods[food.id];
    user.stats.soldToServer += total;
    await saveUser(guildId, userId, user);
    const economy = await addWallet(client, guildId, userId, total);
    return { success: true, food, amount, unitPrice, total, economy };
  }

  static async createFoodListing(guildId, userId, foodId, amount, price) {
    const food = getFoodById(foodId);
    if (!food) return { success: false, message: 'Makanan tidak ditemukan.' };
    amount = Math.max(1, Math.min(99, Number(amount) || 1));
    price = Math.max(1, Math.min(999999999, Math.floor(Number(price) || 0)));
    if (!price) return { success: false, message: 'Harga listing harus lebih dari 0.' };

    const user = await getUser(guildId, userId);
    if ((user.foods[food.id] || 0) < amount) return { success: false, message: `Stok **${food.name}** tidak cukup.` };

    const market = await getMarket(guildId);
    const listingCount = market.foodListings.filter((listing) => listing.sellerId === userId).length + market.petListings.filter((listing) => listing.sellerId === userId).length;
    if (listingCount >= TAMAGOTCHI_CONFIG.maxListingsPerUser) {
      return { success: false, message: `Listing kamu sudah penuh. Maksimal **${TAMAGOTCHI_CONFIG.maxListingsPerUser} listing**.` };
    }

    user.foods[food.id] -= amount;
    if (user.foods[food.id] <= 0) delete user.foods[food.id];
    const listing = { id: createId('food'), sellerId: userId, foodId, amount, price, createdAt: now() };
    market.foodListings.push(listing);
    await saveUser(guildId, userId, user);
    await saveMarket(guildId, market);
    return { success: true, listing, food };
  }

  static async buyFoodListing(client, guildId, buyerId, listingId) {
    const market = await getMarket(guildId);
    const index = market.foodListings.findIndex((listing) => listing.id === listingId);
    if (index < 0) return { success: false, message: 'Listing makanan tidak ditemukan.' };
    const listing = market.foodListings[index];
    if (listing.sellerId === buyerId) return { success: false, message: 'Kamu tidak bisa membeli listing sendiri.' };
    const payment = await chargeWallet(client, guildId, buyerId, listing.price);
    if (!payment.success) return payment;

    const buyer = await getUser(guildId, buyerId);
    buyer.foods[listing.foodId] = (buyer.foods[listing.foodId] || 0) + listing.amount;
    await saveUser(guildId, buyerId, buyer);

    const sellerIncome = Math.floor(listing.price * (1 - TAMAGOTCHI_CONFIG.marketTaxRate));
    await addWallet(client, guildId, listing.sellerId, sellerIncome);
    market.foodListings.splice(index, 1);
    await saveMarket(guildId, market);
    return { success: true, listing, food: getFoodById(listing.foodId), sellerIncome };
  }

  static async createPetListing(guildId, userId, petId, price) {
    price = Math.max(1, Math.min(999999999, Math.floor(Number(price) || 0)));
    if (!price) return { success: false, message: 'Harga listing harus lebih dari 0.' };
    const user = await getUser(guildId, userId);
    const petIndex = user.pets.findIndex((pet) => pet.id === petId);
    if (petIndex < 0) return { success: false, message: 'Pet ID tidak ditemukan di koleksi kamu.' };
    if (user.pets.length <= 1) return { success: false, message: 'Kamu harus punya minimal 2 pet sebelum menjual satu pet ke player.' };

    const market = await getMarket(guildId);
    const listingCount = market.foodListings.filter((listing) => listing.sellerId === userId).length + market.petListings.filter((listing) => listing.sellerId === userId).length;
    if (listingCount >= TAMAGOTCHI_CONFIG.maxListingsPerUser) {
      return { success: false, message: `Listing kamu sudah penuh. Maksimal **${TAMAGOTCHI_CONFIG.maxListingsPerUser} listing**.` };
    }

    const [pet] = user.pets.splice(petIndex, 1);
    if (user.activePetId === pet.id) user.activePetId = user.pets[0]?.id || null;
    const listing = { id: createId('pet'), sellerId: userId, pet, price, createdAt: now() };
    market.petListings.push(listing);
    await saveUser(guildId, userId, user);
    await saveMarket(guildId, market);
    return { success: true, listing, pet, species: getSpeciesById(pet.speciesId) };
  }

  static async buyPetListing(client, guildId, buyerId, listingId) {
    const market = await getMarket(guildId);
    const index = market.petListings.findIndex((listing) => listing.id === listingId);
    if (index < 0) return { success: false, message: 'Listing pet tidak ditemukan.' };
    const listing = market.petListings[index];
    if (listing.sellerId === buyerId) return { success: false, message: 'Kamu tidak bisa membeli listing sendiri.' };

    const buyer = await getUser(guildId, buyerId);
    if (buyer.pets.length >= TAMAGOTCHI_CONFIG.maxPetsPerUser) return { success: false, message: 'Kandang kamu sudah penuh.' };

    const payment = await chargeWallet(client, guildId, buyerId, listing.price);
    if (!payment.success) return payment;

    buyer.pets.push(listing.pet);
    buyer.activePetId = buyer.activePetId || listing.pet.id;
    await saveUser(guildId, buyerId, buyer);
    const sellerIncome = Math.floor(listing.price * (1 - TAMAGOTCHI_CONFIG.marketTaxRate));
    await addWallet(client, guildId, listing.sellerId, sellerIncome);
    market.petListings.splice(index, 1);
    await saveMarket(guildId, market);
    return { success: true, listing, pet: listing.pet, species: getSpeciesById(listing.pet.speciesId), sellerIncome };
  }

  static async sellPetToServer(client, guildId, userId, petId) {
    const user = await getUser(guildId, userId);
    const petIndex = user.pets.findIndex((pet) => pet.id === petId);
    if (petIndex < 0) return { success: false, message: 'Pet ID tidak ditemukan.' };
    if (user.pets.length <= 1) return { success: false, message: 'Kamu harus punya minimal 2 pet sebelum menjual satu pet ke server.' };
    const pet = user.pets[petIndex];
    const species = getSpeciesById(pet.speciesId);
    const level = levelFromXp(pet.xp);
    const base = species?.basePrice || 1000;
    const total = Math.floor(base * (species?.serverSellRate || 0.55) * (1 + (level - 1) * 0.04) * conditionMultiplier(pet));
    user.pets.splice(petIndex, 1);
    if (user.activePetId === pet.id) user.activePetId = user.pets[0]?.id || null;
    await saveUser(guildId, userId, user);
    const economy = await addWallet(client, guildId, userId, total);
    return { success: true, pet, species, total, economy };
  }

  static async cancelListing(guildId, userId, listingId) {
    const market = await getMarket(guildId);
    const petIndex = market.petListings.findIndex((listing) => listing.id === listingId && listing.sellerId === userId);
    if (petIndex >= 0) {
      const [listing] = market.petListings.splice(petIndex, 1);
      const user = await getUser(guildId, userId);
      user.pets.push(listing.pet);
      user.activePetId = user.activePetId || listing.pet.id;
      await saveUser(guildId, userId, user);
      await saveMarket(guildId, market);
      return { success: true, type: 'pet', listing };
    }

    const foodIndex = market.foodListings.findIndex((listing) => listing.id === listingId && listing.sellerId === userId);
    if (foodIndex >= 0) {
      const [listing] = market.foodListings.splice(foodIndex, 1);
      const user = await getUser(guildId, userId);
      user.foods[listing.foodId] = (user.foods[listing.foodId] || 0) + listing.amount;
      await saveUser(guildId, userId, user);
      await saveMarket(guildId, market);
      return { success: true, type: 'food', listing };
    }

    return { success: false, message: 'Listing tidak ditemukan atau bukan milik kamu.' };
  }

  static async getMarketView(guildId) {
    const market = await getMarket(guildId);
    return { success: true, market };
  }

  static async getLeaderboard(guildId) {
    const list = await getFromDb(`tamagotchi:${guildId}:leaderboard`, []);
    return Array.isArray(list) ? list : [];
  }

  static rarityLabel(species) {
    return `${RARITY_EMOJIS[species?.rarity] || '⚪'} ${species?.rarity || 'Unknown'}`;
  }
}

export default TamagotchiService;
