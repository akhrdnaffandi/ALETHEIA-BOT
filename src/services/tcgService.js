import { randomUUID } from 'crypto';
import { CARD_CATALOG, ELEMENT_EMOJI, ELEMENT_META, PACKS, RARITY, TCG_GAME } from '../data/tcgCards.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';

const MAX_COLLECTION_SIZE = 1500;
const MAX_CARD_MARKET_LISTINGS = 200;
const MAX_PACK_MARKET_LISTINGS = 200;
const MAX_TRADE_OFFERS = 120;
const MARKET_TAX_RATE = TCG_GAME.marketTaxRate || 0.05;
const MAX_PRICE = 1_000_000_000;
const PACK_LISTING_MAX_AMOUNT = 100;

function collectionKey(guildId, userId) { return `tcg:${guildId}:user:${userId}`; }
function cardMarketKey(guildId) { return `tcg:${guildId}:market`; }
function packMarketKey(guildId) { return `tcg:${guildId}:pack-market`; }
function tradeKey(guildId) { return `tcg:${guildId}:trades`; }
function historyKey(guildId) { return `tcg:${guildId}:history`; }

function nowIso() { return new Date().toISOString(); }
function makeShortId(prefix = '') { return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 8)}`; }
function clampInt(value, min, max) { return Math.min(Math.max(Math.trunc(Number(value || 0)), min), max); }

function normalizePackInventory(input = {}) {
  const packs = {};
  for (const pack of Object.values(PACKS)) {
    packs[pack.id] = Math.max(0, Math.trunc(Number(input?.[pack.id] || 0)));
  }
  return packs;
}

function normalizeCard(card = {}) {
  const base = CARD_CATALOG.find(item => item.id === card.cardId) || CARD_CATALOG.find(item => item.id === card.id);
  const normalized = {
    instanceId: card.instanceId || makeShortId('c'),
    cardId: card.cardId || base?.id || card.id || 'unknown',
    name: card.name || base?.name || 'Unknown Card',
    element: card.element || base?.element || 'Neutral',
    rarity: card.rarity || base?.rarity || 'common',
    stage: card.stage || base?.stage || RARITY[card.rarity]?.frame || 'Basic',
    hp: Number(card.hp || base?.hp || 50),
    attack: Number(card.attack || base?.attack || 10),
    defense: Number(card.defense || base?.defense || 10),
    skill: card.skill || base?.skill || 'Tackle',
    flavor: card.flavor || base?.flavor || 'A mysterious card from the collection.',
    holo: Boolean(card.holo),
    level: Number(card.level || 1),
    xp: Number(card.xp || 0),
    ownerId: card.ownerId || null,
    listed: card.listed || null,
    pulledAt: card.pulledAt || nowIso(),
    boughtAt: card.boughtAt || null,
    tradedAt: card.tradedAt || null,
    previousOwnerId: card.previousOwnerId || null,
  };
  normalized.power = calculatePower(normalized);
  return normalized;
}

function normalizeCollection(data = {}) {
  const cards = Array.isArray(data.cards) ? data.cards.map(normalizeCard) : [];
  const validCardIds = new Set(cards.map(card => card.instanceId));
  const deck = Array.isArray(data.deck) ? data.deck.filter(id => validCardIds.has(id)).slice(0, TCG_GAME.deckSize) : [];

  return {
    cards,
    packs: normalizePackInventory(data.packs),
    deck,
    stats: {
      packsOpened: Number(data.stats?.packsOpened || 0),
      packsBought: Number(data.stats?.packsBought || 0),
      packsSold: Number(data.stats?.packsSold || 0),
      packListingsBought: Number(data.stats?.packListingsBought || 0),
      packListingsSold: Number(data.stats?.packListingsSold || 0),
      cardsPulled: Number(data.stats?.cardsPulled || cards.length || 0),
      cardsSold: Number(data.stats?.cardsSold || 0),
      cardsBought: Number(data.stats?.cardsBought || 0),
      tradesCreated: Number(data.stats?.tradesCreated || 0),
      tradesCompleted: Number(data.stats?.tradesCompleted || 0),
      battlesWon: Number(data.stats?.battlesWon || 0),
      battlesLost: Number(data.stats?.battlesLost || 0),
      coinsSpent: Number(data.stats?.coinsSpent || 0),
      coinsEarned: Number(data.stats?.coinsEarned || 0),
      lastOpenedAt: data.stats?.lastOpenedAt || null,
      lastBattleAt: data.stats?.lastBattleAt || null,
    },
  };
}

function normalizeMarket(data = {}) {
  return {
    listings: Array.isArray(data.listings) ? data.listings : [],
    updatedAt: data.updatedAt || nowIso(),
  };
}

function normalizeTrades(data = {}) {
  return {
    offers: Array.isArray(data.offers) ? data.offers : [],
    updatedAt: data.updatedAt || nowIso(),
  };
}

function pickRarity(chances) {
  const roll = Math.random();
  let cursor = 0;
  for (const [rarity, chance] of Object.entries(chances)) {
    cursor += Number(chance || 0);
    if (roll <= cursor) return rarity;
  }
  return 'common';
}

function pickCardByRarity(rarity) {
  const pool = CARD_CATALOG.filter(card => card.rarity === rarity);
  const fallbackPool = CARD_CATALOG.filter(card => card.rarity === 'common');
  const cards = pool.length ? pool : fallbackPool;
  return cards[Math.floor(Math.random() * cards.length)];
}

export function calculatePower(card) {
  const rarityBonus = { common: 0, uncommon: 10, rare: 25, epic: 45, legendary: 75 }[card.rarity] || 0;
  const holoBonus = card.holo ? 20 : 0;
  const levelBonus = Math.max(0, Number(card.level || 1) - 1) * 4;
  return Math.round((Number(card.hp) * 0.35) + (Number(card.attack) * 1.25) + (Number(card.defense) * 0.9) + rarityBonus + holoBonus + levelBonus);
}

function createInstance(baseCard, ownerId, holoChance = 0) {
  return normalizeCard({
    instanceId: makeShortId('c'),
    cardId: baseCard.id,
    name: baseCard.name,
    element: baseCard.element,
    rarity: baseCard.rarity,
    stage: baseCard.stage,
    hp: baseCard.hp,
    attack: baseCard.attack,
    defense: baseCard.defense,
    skill: baseCard.skill,
    flavor: baseCard.flavor,
    holo: Math.random() < holoChance,
    ownerId,
    pulledAt: nowIso(),
  });
}

function sortCards(cards = []) {
  return [...cards].sort((a, b) => {
    const rarityDiff = (RARITY[b.rarity]?.order || 0) - (RARITY[a.rarity]?.order || 0);
    if (rarityDiff !== 0) return rarityDiff;
    return (b.power || 0) - (a.power || 0);
  });
}

function assertPrice(price) {
  if (!Number.isSafeInteger(price) || price < 1 || price > MAX_PRICE) {
    throw createError('Invalid TCG price', ErrorTypes.VALIDATION, `Price must be between **1** and **${MAX_PRICE.toLocaleString()}** coins.`);
  }
}

function assertAmount(amount, min, max, label = 'Amount') {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw createError('Invalid TCG amount', ErrorTypes.VALIDATION, `${label} must be between **${min}** and **${max}**.`);
  }
  return value;
}

async function addHistory(client, guildId, entry) {
  try {
    const key = historyKey(guildId);
    const current = await client.db.get(key, []);
    const history = Array.isArray(current) ? current : [];
    history.unshift({ id: makeShortId('h'), createdAt: nowIso(), ...entry });
    await client.db.set(key, history.slice(0, 75));
  } catch (error) {
    logger.warn('[TCG] Failed to save history entry', error);
  }
}

export function formatCardLine(card, includeId = true) {
  const normalized = normalizeCard(card);
  const rarity = RARITY[normalized.rarity] || RARITY.common;
  const element = ELEMENT_EMOJI[normalized.element] || '✨';
  const holo = normalized.holo ? ' ✨Holo' : '';
  const listed = normalized.listed ? ' 🏷️ Listed' : '';
  const id = includeId ? `\`${normalized.instanceId}\` ` : '';
  return `${id}${rarity.emoji} **${normalized.name}**${holo} ${element} • ${rarity.label} • PWR ${normalized.power}${listed}`;
}

export function formatListingLine(listing, index = null) {
  const prefix = index === null ? '' : `**${index}.** `;
  const seller = listing.sellerId ? `<@${listing.sellerId}>` : 'Unknown seller';
  return `${prefix}\`${listing.id}\` • ${formatCardLine(listing.card, false)} • **${Number(listing.price).toLocaleString()}** coins • Seller: ${seller}`;
}

export function formatPackListingLine(listing, index = null) {
  const pack = getPack(listing.packId);
  const prefix = index === null ? '' : `**${index}.** `;
  const seller = listing.sellerId ? `<@${listing.sellerId}>` : 'Unknown seller';
  return `${prefix}\`${listing.id}\` • ${pack?.emoji || '📦'} **${pack?.name || listing.packId}** x**${listing.amount}** • **${Number(listing.price).toLocaleString()}** coins • Seller: ${seller}`;
}

export async function getCollection(client, guildId, userId) {
  const data = await client.db.get(collectionKey(guildId, userId), {});
  return normalizeCollection(data);
}

export async function saveCollection(client, guildId, userId, collection) {
  await client.db.set(collectionKey(guildId, userId), normalizeCollection(collection));
  return true;
}

export async function getMarket(client, guildId) {
  const data = await client.db.get(cardMarketKey(guildId), {});
  return normalizeMarket(data);
}

async function saveMarket(client, guildId, market) {
  await client.db.set(cardMarketKey(guildId), { listings: Array.isArray(market.listings) ? market.listings : [], updatedAt: nowIso() });
  return true;
}

export async function getPackMarket(client, guildId) {
  const data = await client.db.get(packMarketKey(guildId), {});
  return normalizeMarket(data);
}

async function savePackMarket(client, guildId, market) {
  await client.db.set(packMarketKey(guildId), { listings: Array.isArray(market.listings) ? market.listings : [], updatedAt: nowIso() });
  return true;
}

export async function getTrades(client, guildId) {
  const data = await client.db.get(tradeKey(guildId), {});
  return normalizeTrades(data);
}

async function saveTrades(client, guildId, trades) {
  const now = Date.now();
  const cleaned = (Array.isArray(trades.offers) ? trades.offers : [])
    .filter(offer => offer.status !== 'pending' || new Date(offer.expiresAt).getTime() > now)
    .slice(0, MAX_TRADE_OFFERS);
  await client.db.set(tradeKey(guildId), { offers: cleaned, updatedAt: nowIso() });
  return true;
}

export function getPack(packId) { return PACKS[packId] || null; }
export function getPacks() { return Object.values(PACKS); }

export async function buyPacksFromShop(client, guildId, userId, packId, amount = 1) {
  const pack = getPack(packId);
  if (!pack) throw createError('Unknown TCG pack', ErrorTypes.VALIDATION, 'Pack not found. Use `/tcg packshop` to see available packs.');
  const qty = assertAmount(amount, 1, TCG_GAME.maxPackBuyAmount || 20, 'Pack amount');
  const totalPrice = pack.price * qty;

  const [economy, collection] = await Promise.all([
    getEconomyData(client, guildId, userId),
    getCollection(client, guildId, userId),
  ]);

  const wallet = Number(economy?.wallet || 0);
  if (wallet < totalPrice) {
    throw createError('Insufficient wallet for TCG pack', ErrorTypes.VALIDATION, `You need **${totalPrice.toLocaleString()}** coins in cash. Your cash: **${wallet.toLocaleString()}**.`);
  }

  economy.wallet = wallet - totalPrice;
  collection.packs[packId] = Number(collection.packs[packId] || 0) + qty;
  collection.stats.packsBought += qty;
  collection.stats.coinsSpent += totalPrice;

  await saveCollection(client, guildId, userId, collection);
  const savedEconomy = await setEconomyData(client, guildId, userId, economy);
  if (!savedEconomy) throw createError('Failed to save pack purchase', ErrorTypes.DATABASE, 'Failed to save pack purchase. Please try again.');

  await addHistory(client, guildId, { type: 'pack_bought_shop', userId, packId, amount: qty, totalPrice });
  return { pack, amount: qty, totalPrice, wallet: economy.wallet, packs: collection.packs };
}

export async function openPack(client, guildId, userId, packId, amount = 1) {
  const pack = getPack(packId);
  if (!pack) throw createError('Unknown TCG pack', ErrorTypes.VALIDATION, 'Pack not found. Use `/tcg packshop` to see available packs.');
  const qty = assertAmount(amount, 1, TCG_GAME.maxPackOpenAmount || 10, 'Open amount');

  const collection = await getCollection(client, guildId, userId);
  const ownedPacks = Number(collection.packs[packId] || 0);
  if (ownedPacks < qty) {
    throw createError('Not enough packs', ErrorTypes.VALIDATION, `You only have **${ownedPacks}x ${pack.name}**. Buy packs with \`/tcg packbuy\` or from player market with \`/tcg packmarket\`.`);
  }

  const totalCards = pack.cardCount * qty;
  if (collection.cards.length + totalCards > MAX_COLLECTION_SIZE) {
    throw createError('TCG collection limit reached', ErrorTypes.VALIDATION, `Your collection is almost full. Maximum collection size is **${MAX_COLLECTION_SIZE}** cards.`);
  }

  const pulledCards = [];
  for (let packIndex = 0; packIndex < qty; packIndex += 1) {
    for (let index = 0; index < pack.cardCount; index += 1) {
      const rarity = pickRarity(pack.chances);
      const baseCard = pickCardByRarity(rarity);
      pulledCards.push(createInstance(baseCard, userId, pack.holoChance));
    }
  }

  collection.packs[packId] = ownedPacks - qty;
  collection.cards.push(...pulledCards);
  collection.stats.packsOpened += qty;
  collection.stats.cardsPulled += pulledCards.length;
  collection.stats.lastOpenedAt = nowIso();

  await saveCollection(client, guildId, userId, collection);
  await addHistory(client, guildId, {
    type: 'pack_opened', userId, packId, amount: qty,
    cards: pulledCards.map(card => ({ instanceId: card.instanceId, name: card.name, rarity: card.rarity, holo: card.holo })),
  });

  return { pack, amount: qty, cards: sortCards(pulledCards), packsLeft: collection.packs[packId] };
}

export async function getCard(client, guildId, userId, instanceId) {
  const collection = await getCollection(client, guildId, userId);
  const card = collection.cards.find(item => item.instanceId === instanceId);
  return { collection, card };
}

export async function sellCard(client, guildId, sellerId, instanceId, price) {
  assertPrice(price);
  const [collection, market] = await Promise.all([getCollection(client, guildId, sellerId), getMarket(client, guildId)]);
  if (market.listings.length >= MAX_CARD_MARKET_LISTINGS) throw createError('TCG market is full', ErrorTypes.VALIDATION, `The card market already has **${MAX_CARD_MARKET_LISTINGS}** active listings.`);

  const card = collection.cards.find(item => item.instanceId === instanceId);
  if (!card) throw createError('TCG card not found', ErrorTypes.VALIDATION, 'Card not found in your collection.');
  if (card.listed) throw createError('TCG card already listed', ErrorTypes.VALIDATION, `This card is already listed as **${card.listed}**.`);
  if (collection.deck.includes(card.instanceId)) throw createError('Deck card cannot be listed', ErrorTypes.VALIDATION, 'Remove this card from your deck before listing it.');

  const listingId = makeShortId('m');
  card.listed = listingId;
  const listing = { id: listingId, guildId, sellerId, price, card: { ...card }, createdAt: nowIso() };
  market.listings.unshift(listing);
  await saveCollection(client, guildId, sellerId, collection);
  await saveMarket(client, guildId, market);
  await addHistory(client, guildId, { type: 'card_listed', sellerId, listingId, price, cardName: card.name });
  return listing;
}

export async function cancelListing(client, guildId, sellerId, listingId) {
  const [collection, market] = await Promise.all([getCollection(client, guildId, sellerId), getMarket(client, guildId)]);
  const listingIndex = market.listings.findIndex(listing => listing.id === listingId);
  if (listingIndex === -1) throw createError('TCG listing not found', ErrorTypes.VALIDATION, 'Listing not found.');
  const listing = market.listings[listingIndex];
  if (listing.sellerId !== sellerId) throw createError('Not listing owner', ErrorTypes.PERMISSION, 'You can only cancel your own listing.');

  market.listings.splice(listingIndex, 1);
  const card = collection.cards.find(item => item.instanceId === listing.card.instanceId);
  if (card) card.listed = null;
  await saveCollection(client, guildId, sellerId, collection);
  await saveMarket(client, guildId, market);
  await addHistory(client, guildId, { type: 'listing_canceled', sellerId, listingId, cardName: listing.card.name });
  return listing;
}

export async function buyListing(client, guildId, buyerId, listingId) {
  const market = await getMarket(client, guildId);
  const listingIndex = market.listings.findIndex(item => item.id === listingId);
  if (listingIndex === -1) throw createError('TCG listing not found', ErrorTypes.VALIDATION, 'Listing not found or already sold.');
  const listing = market.listings[listingIndex];
  if (listing.sellerId === buyerId) throw createError('Cannot buy own listing', ErrorTypes.VALIDATION, 'You cannot buy your own card listing.');

  const [buyerEconomy, sellerEconomy, buyerCollection, sellerCollection] = await Promise.all([
    getEconomyData(client, guildId, buyerId),
    getEconomyData(client, guildId, listing.sellerId),
    getCollection(client, guildId, buyerId),
    getCollection(client, guildId, listing.sellerId),
  ]);

  const buyerWallet = Number(buyerEconomy.wallet || 0);
  if (buyerWallet < listing.price) throw createError('Insufficient wallet for TCG purchase', ErrorTypes.VALIDATION, `You need **${listing.price.toLocaleString()}** coins in cash. Your cash: **${buyerWallet.toLocaleString()}**.`);
  if (buyerCollection.cards.length >= MAX_COLLECTION_SIZE) throw createError('TCG collection full', ErrorTypes.VALIDATION, `Your collection is full. Maximum collection size is **${MAX_COLLECTION_SIZE}** cards.`);

  const sellerCardIndex = sellerCollection.cards.findIndex(card => card.instanceId === listing.card.instanceId);
  if (sellerCardIndex === -1) {
    market.listings.splice(listingIndex, 1);
    await saveMarket(client, guildId, market);
    throw createError('Seller card missing', ErrorTypes.VALIDATION, 'This listing was invalid and has been removed from the market.');
  }

  const tax = Math.floor(listing.price * MARKET_TAX_RATE);
  const sellerReceives = listing.price - tax;
  const [soldCard] = sellerCollection.cards.splice(sellerCardIndex, 1);
  soldCard.ownerId = buyerId;
  soldCard.listed = null;
  soldCard.boughtAt = nowIso();
  soldCard.previousOwnerId = listing.sellerId;
  buyerCollection.cards.push(soldCard);

  buyerEconomy.wallet = buyerWallet - listing.price;
  sellerEconomy.wallet = Number(sellerEconomy.wallet || 0) + sellerReceives;
  buyerCollection.stats.cardsBought += 1;
  buyerCollection.stats.coinsSpent += listing.price;
  sellerCollection.stats.cardsSold += 1;
  sellerCollection.stats.coinsEarned += sellerReceives;
  market.listings.splice(listingIndex, 1);

  await saveCollection(client, guildId, listing.sellerId, sellerCollection);
  await saveCollection(client, guildId, buyerId, buyerCollection);
  await saveMarket(client, guildId, market);

  const buyerSaved = await setEconomyData(client, guildId, buyerId, buyerEconomy);
  const sellerSaved = await setEconomyData(client, guildId, listing.sellerId, sellerEconomy);
  if (!buyerSaved || !sellerSaved) throw createError('Failed to save TCG economy transfer', ErrorTypes.DATABASE, 'Card moved, but economy save failed. Please contact an admin.');

  await addHistory(client, guildId, { type: 'card_sold', listingId, buyerId, sellerId: listing.sellerId, price: listing.price, sellerReceives, tax, cardName: soldCard.name });
  return { listing, card: soldCard, buyerWallet: buyerEconomy.wallet, sellerReceives, tax };
}

export async function sellPackListing(client, guildId, sellerId, packId, amount, price) {
  const pack = getPack(packId);
  if (!pack) throw createError('Unknown TCG pack', ErrorTypes.VALIDATION, 'Pack not found.');
  const qty = assertAmount(amount, 1, PACK_LISTING_MAX_AMOUNT, 'Pack listing amount');
  assertPrice(price);

  const [collection, market] = await Promise.all([getCollection(client, guildId, sellerId), getPackMarket(client, guildId)]);
  if (market.listings.length >= MAX_PACK_MARKET_LISTINGS) throw createError('Pack market is full', ErrorTypes.VALIDATION, `The pack market already has **${MAX_PACK_MARKET_LISTINGS}** active listings.`);
  if (Number(collection.packs[packId] || 0) < qty) throw createError('Not enough packs', ErrorTypes.VALIDATION, `You only have **${collection.packs[packId] || 0}x ${pack.name}**.`);

  collection.packs[packId] -= qty;
  const listing = { id: makeShortId('p'), guildId, sellerId, packId, amount: qty, price, createdAt: nowIso() };
  market.listings.unshift(listing);
  await saveCollection(client, guildId, sellerId, collection);
  await savePackMarket(client, guildId, market);
  await addHistory(client, guildId, { type: 'pack_listed', sellerId, listingId: listing.id, packId, amount: qty, price });
  return listing;
}

export async function cancelPackListing(client, guildId, sellerId, listingId) {
  const [collection, market] = await Promise.all([getCollection(client, guildId, sellerId), getPackMarket(client, guildId)]);
  const listingIndex = market.listings.findIndex(listing => listing.id === listingId);
  if (listingIndex === -1) throw createError('Pack listing not found', ErrorTypes.VALIDATION, 'Pack listing not found.');
  const listing = market.listings[listingIndex];
  if (listing.sellerId !== sellerId) throw createError('Not listing owner', ErrorTypes.PERMISSION, 'You can only cancel your own pack listing.');

  market.listings.splice(listingIndex, 1);
  collection.packs[listing.packId] = Number(collection.packs[listing.packId] || 0) + Number(listing.amount || 0);
  await saveCollection(client, guildId, sellerId, collection);
  await savePackMarket(client, guildId, market);
  await addHistory(client, guildId, { type: 'pack_listing_canceled', sellerId, listingId, packId: listing.packId, amount: listing.amount });
  return listing;
}

export async function buyPackListing(client, guildId, buyerId, listingId) {
  const market = await getPackMarket(client, guildId);
  const listingIndex = market.listings.findIndex(item => item.id === listingId);
  if (listingIndex === -1) throw createError('Pack listing not found', ErrorTypes.VALIDATION, 'Pack listing not found or already sold.');
  const listing = market.listings[listingIndex];
  if (listing.sellerId === buyerId) throw createError('Cannot buy own listing', ErrorTypes.VALIDATION, 'You cannot buy your own pack listing.');

  const [buyerEconomy, sellerEconomy, buyerCollection, sellerCollection] = await Promise.all([
    getEconomyData(client, guildId, buyerId),
    getEconomyData(client, guildId, listing.sellerId),
    getCollection(client, guildId, buyerId),
    getCollection(client, guildId, listing.sellerId),
  ]);

  const buyerWallet = Number(buyerEconomy.wallet || 0);
  if (buyerWallet < listing.price) throw createError('Insufficient wallet for pack purchase', ErrorTypes.VALIDATION, `You need **${listing.price.toLocaleString()}** coins. Your cash: **${buyerWallet.toLocaleString()}**.`);

  const tax = Math.floor(listing.price * MARKET_TAX_RATE);
  const sellerReceives = listing.price - tax;
  buyerCollection.packs[listing.packId] = Number(buyerCollection.packs[listing.packId] || 0) + Number(listing.amount || 0);
  buyerEconomy.wallet = buyerWallet - listing.price;
  sellerEconomy.wallet = Number(sellerEconomy.wallet || 0) + sellerReceives;
  buyerCollection.stats.packListingsBought += Number(listing.amount || 0);
  buyerCollection.stats.coinsSpent += listing.price;
  sellerCollection.stats.packListingsSold += Number(listing.amount || 0);
  sellerCollection.stats.packsSold += Number(listing.amount || 0);
  sellerCollection.stats.coinsEarned += sellerReceives;
  market.listings.splice(listingIndex, 1);

  await saveCollection(client, guildId, listing.sellerId, sellerCollection);
  await saveCollection(client, guildId, buyerId, buyerCollection);
  await savePackMarket(client, guildId, market);
  const buyerSaved = await setEconomyData(client, guildId, buyerId, buyerEconomy);
  const sellerSaved = await setEconomyData(client, guildId, listing.sellerId, sellerEconomy);
  if (!buyerSaved || !sellerSaved) throw createError('Failed to save pack market transfer', ErrorTypes.DATABASE, 'Pack moved, but economy save failed. Please contact an admin.');

  await addHistory(client, guildId, { type: 'pack_listing_sold', listingId, buyerId, sellerId: listing.sellerId, packId: listing.packId, amount: listing.amount, price: listing.price, tax });
  return { listing, pack: getPack(listing.packId), buyerWallet: buyerEconomy.wallet, sellerReceives, tax };
}

export async function createTradeOffer(client, guildId, fromUserId, toUserId, offeredCardId, requestedCardId) {
  if (fromUserId === toUserId) throw createError('Cannot trade with self', ErrorTypes.VALIDATION, 'You cannot trade with yourself.');
  const [fromCollection, toCollection, trades] = await Promise.all([
    getCollection(client, guildId, fromUserId), getCollection(client, guildId, toUserId), getTrades(client, guildId),
  ]);

  const offered = fromCollection.cards.find(card => card.instanceId === offeredCardId);
  const requested = toCollection.cards.find(card => card.instanceId === requestedCardId);
  if (!offered) throw createError('Offered card not found', ErrorTypes.VALIDATION, 'Your offered card was not found.');
  if (!requested) throw createError('Requested card not found', ErrorTypes.VALIDATION, 'The requested card was not found in that user collection.');
  if (offered.listed || requested.listed) throw createError('Listed card cannot be traded', ErrorTypes.VALIDATION, 'Cancel market listings before trading cards.');
  if (fromCollection.deck.includes(offered.instanceId)) throw createError('Deck card cannot be traded', ErrorTypes.VALIDATION, 'Remove your offered card from deck before trading.');
  if (toCollection.deck.includes(requested.instanceId)) throw createError('Deck card cannot be traded', ErrorTypes.VALIDATION, 'The requested card is currently in that user deck.');

  const expiresAt = new Date(Date.now() + (TCG_GAME.tradeOfferTtlHours || 24) * 60 * 60 * 1000).toISOString();
  const offer = { id: makeShortId('t'), guildId, fromUserId, toUserId, offeredCardId, requestedCardId, offeredSnapshot: { ...offered }, requestedSnapshot: { ...requested }, status: 'pending', createdAt: nowIso(), expiresAt };
  trades.offers.unshift(offer);
  fromCollection.stats.tradesCreated += 1;
  await saveTrades(client, guildId, trades);
  await saveCollection(client, guildId, fromUserId, fromCollection);
  await addHistory(client, guildId, { type: 'trade_created', offerId: offer.id, fromUserId, toUserId, offeredCard: offered.name, requestedCard: requested.name });
  return offer;
}

export async function acceptTradeOffer(client, guildId, toUserId, offerId) {
  const trades = await getTrades(client, guildId);
  const offer = trades.offers.find(item => item.id === offerId && item.status === 'pending');
  if (!offer) throw createError('Trade offer not found', ErrorTypes.VALIDATION, 'Trade offer not found or already handled.');
  if (offer.toUserId !== toUserId) throw createError('Not your trade offer', ErrorTypes.PERMISSION, 'Only the target user can accept this trade.');
  if (new Date(offer.expiresAt).getTime() <= Date.now()) throw createError('Trade offer expired', ErrorTypes.VALIDATION, 'This trade offer has expired.');

  const [fromCollection, toCollection] = await Promise.all([getCollection(client, guildId, offer.fromUserId), getCollection(client, guildId, offer.toUserId)]);
  const fromIndex = fromCollection.cards.findIndex(card => card.instanceId === offer.offeredCardId);
  const toIndex = toCollection.cards.findIndex(card => card.instanceId === offer.requestedCardId);
  if (fromIndex === -1 || toIndex === -1) throw createError('Trade card missing', ErrorTypes.VALIDATION, 'One of the trade cards no longer exists.');

  const offered = fromCollection.cards[fromIndex];
  const requested = toCollection.cards[toIndex];
  if (offered.listed || requested.listed || fromCollection.deck.includes(offered.instanceId) || toCollection.deck.includes(requested.instanceId)) {
    throw createError('Trade cards locked', ErrorTypes.VALIDATION, 'One of the trade cards is listed or in a deck.');
  }

  fromCollection.cards[fromIndex] = { ...requested, ownerId: offer.fromUserId, previousOwnerId: offer.toUserId, tradedAt: nowIso() };
  toCollection.cards[toIndex] = { ...offered, ownerId: offer.toUserId, previousOwnerId: offer.fromUserId, tradedAt: nowIso() };
  fromCollection.stats.tradesCompleted += 1;
  toCollection.stats.tradesCompleted += 1;
  offer.status = 'accepted';
  offer.acceptedAt = nowIso();

  await saveCollection(client, guildId, offer.fromUserId, fromCollection);
  await saveCollection(client, guildId, offer.toUserId, toCollection);
  await saveTrades(client, guildId, trades);
  await addHistory(client, guildId, { type: 'trade_accepted', offerId, fromUserId: offer.fromUserId, toUserId: offer.toUserId, offeredCard: offered.name, requestedCard: requested.name });
  return { offer, yourNewCard: toCollection.cards[toIndex], theirNewCard: fromCollection.cards[fromIndex] };
}

export async function declineTradeOffer(client, guildId, toUserId, offerId) {
  const trades = await getTrades(client, guildId);
  const offer = trades.offers.find(item => item.id === offerId && item.status === 'pending');
  if (!offer) throw createError('Trade offer not found', ErrorTypes.VALIDATION, 'Trade offer not found or already handled.');
  if (offer.toUserId !== toUserId && offer.fromUserId !== toUserId) throw createError('Not your trade offer', ErrorTypes.PERMISSION, 'Only users involved in this trade can decline/cancel it.');
  offer.status = 'declined';
  offer.declinedAt = nowIso();
  await saveTrades(client, guildId, trades);
  await addHistory(client, guildId, { type: 'trade_declined', offerId, userId: toUserId });
  return offer;
}

export async function getTradeOffersForUser(client, guildId, userId) {
  const trades = await getTrades(client, guildId);
  const now = Date.now();
  const offers = trades.offers.filter(offer => offer.status === 'pending' && new Date(offer.expiresAt).getTime() > now && (offer.fromUserId === userId || offer.toUserId === userId));
  return offers;
}

export function getDeckCards(collection) {
  const cardsById = new Map((collection.cards || []).map(card => [card.instanceId, card]));
  return (collection.deck || []).map(id => cardsById.get(id)).filter(Boolean);
}

export async function addCardToDeck(client, guildId, userId, cardId) {
  const collection = await getCollection(client, guildId, userId);
  if (collection.deck.includes(cardId)) throw createError('Card already in deck', ErrorTypes.VALIDATION, 'This card is already in your deck.');
  if (collection.deck.length >= TCG_GAME.deckSize) throw createError('Deck is full', ErrorTypes.VALIDATION, `Your deck is full. Maximum deck size is **${TCG_GAME.deckSize}** cards.`);
  const card = collection.cards.find(item => item.instanceId === cardId);
  if (!card) throw createError('Card not found', ErrorTypes.VALIDATION, 'Card not found in your collection.');
  if (card.listed) throw createError('Listed card cannot be used', ErrorTypes.VALIDATION, 'Cancel this card listing before adding it to deck.');
  collection.deck.push(cardId);
  await saveCollection(client, guildId, userId, collection);
  return { collection, card, deck: getDeckCards(collection) };
}

export async function removeCardFromDeck(client, guildId, userId, cardId) {
  const collection = await getCollection(client, guildId, userId);
  const before = collection.deck.length;
  collection.deck = collection.deck.filter(id => id !== cardId);
  if (collection.deck.length === before) throw createError('Card not in deck', ErrorTypes.VALIDATION, 'This card is not in your deck.');
  await saveCollection(client, guildId, userId, collection);
  return { collection, deck: getDeckCards(collection) };
}

export async function autoBuildDeck(client, guildId, userId) {
  const collection = await getCollection(client, guildId, userId);
  const deckCards = sortCards(collection.cards.filter(card => !card.listed)).slice(0, TCG_GAME.deckSize);
  if (!deckCards.length) throw createError('No cards for deck', ErrorTypes.VALIDATION, 'You need at least one unlisted card to build a deck.');
  collection.deck = deckCards.map(card => card.instanceId);
  await saveCollection(client, guildId, userId, collection);
  return { collection, deck: deckCards };
}

export function calculateDeckStats(cards = []) {
  const safeCards = cards.map(normalizeCard);
  return {
    size: safeCards.length,
    power: safeCards.reduce((total, card) => total + (card.power || 0), 0),
    hp: safeCards.reduce((total, card) => total + (card.hp || 0), 0),
    attack: safeCards.reduce((total, card) => total + (card.attack || 0), 0),
    defense: safeCards.reduce((total, card) => total + (card.defense || 0), 0),
  };
}

function getElementSynergy(cards = []) {
  const elements = cards.map(card => card.element);
  let bonus = 0;
  for (const element of new Set(elements)) {
    const count = elements.filter(item => item === element).length;
    if (count >= 3) bonus += 25;
    if (count >= 5) bonus += 25;
  }
  return bonus;
}

export async function battleNpc(client, guildId, userId, difficulty = 'normal') {
  const configs = {
    easy: { name: 'Rookie Trainer', base: 280, spread: 120, reward: [100, 250] },
    normal: { name: 'Arena Trainer', base: 500, spread: 220, reward: [300, 700] },
    hard: { name: 'Elite Trainer', base: 850, spread: 350, reward: [850, 1600] },
  };
  const config = configs[difficulty] || configs.normal;
  const [collection, economy] = await Promise.all([getCollection(client, guildId, userId), getEconomyData(client, guildId, userId)]);
  const deck = getDeckCards(collection);
  if (!deck.length) throw createError('No deck built', ErrorTypes.VALIDATION, 'Build a deck first with `/tcg deckauto` or `/tcg deckadd`.');

  const deckStats = calculateDeckStats(deck);
  const synergyBonus = getElementSynergy(deck);
  const playerRoll = Math.floor(Math.random() * 151);
  const enemyRoll = Math.floor(Math.random() * config.spread);
  const playerScore = deckStats.power + synergyBonus + playerRoll;
  const enemyScore = config.base + enemyRoll;
  const won = playerScore >= enemyScore;
  const reward = won ? Math.floor(config.reward[0] + Math.random() * (config.reward[1] - config.reward[0] + 1)) : 0;

  if (won) {
    economy.wallet = Number(economy.wallet || 0) + reward;
    collection.stats.battlesWon += 1;
    collection.stats.coinsEarned += reward;
  } else {
    collection.stats.battlesLost += 1;
  }
  collection.stats.lastBattleAt = nowIso();
  await saveCollection(client, guildId, userId, collection);
  if (won) await setEconomyData(client, guildId, userId, economy);
  await addHistory(client, guildId, { type: 'npc_battle', userId, difficulty, won, playerScore, enemyScore, reward });

  return { difficulty, enemyName: config.name, deck, deckStats, synergyBonus, playerRoll, enemyRoll, playerScore, enemyScore, won, reward, wallet: economy.wallet };
}

export function paginate(items, page = 1, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page || 1, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return { page: safePage, totalPages, items: items.slice(start, start + pageSize), totalItems: items.length };
}

export function sortCollectionCards(cards) { return sortCards(cards); }
export function getRarityText(rarity) { const item = RARITY[rarity] || RARITY.common; return `${item.emoji} ${item.label}`; }
export function getElementText(element) { return `${ELEMENT_EMOJI[element] || '✨'} ${element}`; }

function xmlEscape(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildCardSvg(card, ownerName = '') {
  const item = normalizeCard(card);
  const rarity = RARITY[item.rarity] || RARITY.common;
  const element = ELEMENT_META[item.element] || { emoji: '✨', color: '#64748B' };
  const holoOverlay = item.holo ? '<rect x="26" y="26" width="448" height="648" rx="34" fill="url(#holo)" opacity="0.28"/>' : '';
  const owner = ownerName ? `<text x="250" y="650" text-anchor="middle" fill="#94A3B8" font-size="16" font-family="Arial">Owner: ${xmlEscape(ownerName)}</text>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0F172A"/><stop offset="55%" stop-color="#111827"/><stop offset="100%" stop-color="#020617"/></linearGradient>
    <linearGradient id="rarity" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${rarity.color}"/><stop offset="100%" stop-color="${element.color}"/></linearGradient>
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="35%" stop-color="#60A5FA"/><stop offset="65%" stop-color="#F472B6"/><stop offset="100%" stop-color="#FDE68A"/></linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000000" flood-opacity="0.55"/></filter>
  </defs>
  <rect width="500" height="700" fill="#020617"/>
  <rect x="18" y="18" width="464" height="664" rx="42" fill="url(#rarity)" filter="url(#shadow)"/>
  <rect x="32" y="32" width="436" height="636" rx="32" fill="url(#bg)"/>
  ${holoOverlay}
  <text x="54" y="78" fill="#F8FAFC" font-size="33" font-weight="800" font-family="Arial">${xmlEscape(item.name)}</text>
  <text x="448" y="78" text-anchor="end" fill="#F8FAFC" font-size="32" font-weight="800" font-family="Arial">HP ${item.hp}</text>
  <rect x="54" y="98" width="392" height="264" rx="24" fill="#111827" stroke="${element.color}" stroke-width="4"/>
  <circle cx="250" cy="226" r="92" fill="${element.color}" opacity="0.18"/>
  <text x="250" y="252" text-anchor="middle" font-size="104" font-family="Arial">${xmlEscape(element.emoji)}</text>
  <text x="250" y="336" text-anchor="middle" fill="#CBD5E1" font-size="20" font-family="Arial">${xmlEscape(item.stage)} • ${xmlEscape(rarity.label)}${item.holo ? ' • HOLO' : ''}</text>
  <rect x="54" y="384" width="392" height="78" rx="16" fill="#020617" stroke="#334155"/>
  <text x="76" y="417" fill="#F8FAFC" font-size="24" font-weight="700" font-family="Arial">${xmlEscape(item.skill)}</text>
  <text x="76" y="445" fill="#CBD5E1" font-size="18" font-family="Arial">${xmlEscape(item.flavor).slice(0, 64)}</text>
  <rect x="54" y="486" width="118" height="76" rx="14" fill="#111827" stroke="#334155"/><text x="113" y="520" text-anchor="middle" fill="#FCA5A5" font-size="20" font-family="Arial">ATK</text><text x="113" y="550" text-anchor="middle" fill="#F8FAFC" font-size="26" font-weight="700" font-family="Arial">${item.attack}</text>
  <rect x="191" y="486" width="118" height="76" rx="14" fill="#111827" stroke="#334155"/><text x="250" y="520" text-anchor="middle" fill="#93C5FD" font-size="20" font-family="Arial">DEF</text><text x="250" y="550" text-anchor="middle" fill="#F8FAFC" font-size="26" font-weight="700" font-family="Arial">${item.defense}</text>
  <rect x="328" y="486" width="118" height="76" rx="14" fill="#111827" stroke="#334155"/><text x="387" y="520" text-anchor="middle" fill="#FDE68A" font-size="20" font-family="Arial">PWR</text><text x="387" y="550" text-anchor="middle" fill="#F8FAFC" font-size="26" font-weight="700" font-family="Arial">${item.power}</text>
  <text x="54" y="606" fill="${rarity.color}" font-size="20" font-weight="700" font-family="Arial">${xmlEscape(rarity.label)} • ${xmlEscape(item.element)} • ID ${xmlEscape(item.instanceId)}</text>
  ${owner}
</svg>`;
}

export function buildPackSvg(pack) {
  const item = pack || getPack('starter');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="360" viewBox="0 0 500 360">
  <defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${item.color || '#5865F2'}"/><stop offset="100%" stop-color="#020617"/></linearGradient></defs>
  <rect width="500" height="360" rx="32" fill="#020617"/><rect x="24" y="24" width="452" height="312" rx="26" fill="url(#p)"/>
  <text x="250" y="112" text-anchor="middle" font-size="82" font-family="Arial">${xmlEscape(item.emoji || '📦')}</text>
  <text x="250" y="172" text-anchor="middle" fill="#F8FAFC" font-size="38" font-weight="800" font-family="Arial">${xmlEscape(item.name)}</text>
  <text x="250" y="218" text-anchor="middle" fill="#CBD5E1" font-size="22" font-family="Arial">${item.cardCount} cards • ${Number(item.price).toLocaleString()} coins</text>
  <text x="250" y="258" text-anchor="middle" fill="#FDE68A" font-size="20" font-family="Arial">Holo chance ${Math.round((item.holoChance || 0) * 100)}%</text>
</svg>`;
}

export const TCG_LIMITS = {
  MAX_COLLECTION_SIZE,
  MAX_CARD_MARKET_LISTINGS,
  MAX_PACK_MARKET_LISTINGS,
  MAX_TRADE_OFFERS,
  MARKET_TAX_RATE,
  DECK_SIZE: TCG_GAME.deckSize,
  MAX_PACK_BUY_AMOUNT: TCG_GAME.maxPackBuyAmount,
  MAX_PACK_OPEN_AMOUNT: TCG_GAME.maxPackOpenAmount,
};
