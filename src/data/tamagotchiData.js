export const PET_SPECIES = [
  {
    id: 'fluffbit',
    name: 'Fluffbit',
    emoji: '🐰',
    rarity: 'Common',
    basePrice: 2500,
    serverSellRate: 0.55,
    description: 'Pet lucu yang cepat akrab dan cocok untuk pemula.',
    favoriteFood: 'berry_snack',
    incomeMin: 120,
    incomeMax: 280,
    color: '#ffb6d5',
    accent: '#fff1f7'
  },
  {
    id: 'mushpup',
    name: 'Mushpup',
    emoji: '🐶',
    rarity: 'Common',
    basePrice: 3200,
    serverSellRate: 0.55,
    description: 'Pet pekerja keras, reward collect-nya stabil.',
    favoriteFood: 'kibble_basic',
    incomeMin: 160,
    incomeMax: 340,
    color: '#d89b5f',
    accent: '#fff1d6'
  },
  {
    id: 'aquapuff',
    name: 'Aquapuff',
    emoji: '🦦',
    rarity: 'Uncommon',
    basePrice: 6500,
    serverSellRate: 0.58,
    description: 'Pet air yang santai, cocok untuk farming jangka panjang.',
    favoriteFood: 'fish_bento',
    incomeMin: 260,
    incomeMax: 520,
    color: '#5bc0eb',
    accent: '#e0f7ff'
  },
  {
    id: 'embercub',
    name: 'Embercub',
    emoji: '🦊',
    rarity: 'Rare',
    basePrice: 12500,
    serverSellRate: 0.62,
    description: 'Pet api kecil dengan bonus training tinggi.',
    favoriteFood: 'spicy_meal',
    incomeMin: 420,
    incomeMax: 850,
    color: '#ff7a45',
    accent: '#ffe3d6'
  },
  {
    id: 'starluma',
    name: 'Starluma',
    emoji: '🦄',
    rarity: 'Epic',
    basePrice: 32000,
    serverSellRate: 0.66,
    description: 'Pet premium dengan income besar dan visual langka.',
    favoriteFood: 'star_cookie',
    incomeMin: 900,
    incomeMax: 1800,
    color: '#8a5cf6',
    accent: '#eee7ff'
  },
  {
    id: 'drakeling',
    name: 'Drakeling',
    emoji: '🐉',
    rarity: 'Legendary',
    basePrice: 95000,
    serverSellRate: 0.7,
    description: 'Pet naga mini. Mahal, tapi sangat kuat untuk collect dan arena.',
    favoriteFood: 'dragon_feast',
    incomeMin: 2200,
    incomeMax: 4200,
    color: '#f54266',
    accent: '#ffe1e7'
  }
];

export const PET_FOODS = [
  {
    id: 'kibble_basic',
    name: 'Basic Kibble',
    emoji: '🥣',
    basePrice: 350,
    minPrice: 220,
    maxPrice: 650,
    hunger: 18,
    happiness: 3,
    description: 'Makanan standar untuk semua pet.'
  },
  {
    id: 'berry_snack',
    name: 'Berry Snack',
    emoji: '🍓',
    basePrice: 600,
    minPrice: 350,
    maxPrice: 1100,
    hunger: 24,
    happiness: 8,
    description: 'Snack manis yang bikin pet senang.'
  },
  {
    id: 'fish_bento',
    name: 'Fish Bento',
    emoji: '🍱',
    basePrice: 1200,
    minPrice: 800,
    maxPrice: 2300,
    hunger: 38,
    happiness: 10,
    description: 'Makanan mahal dengan efek kenyang tinggi.'
  },
  {
    id: 'spicy_meal',
    name: 'Spicy Meal',
    emoji: '🌶️',
    basePrice: 1800,
    minPrice: 1100,
    maxPrice: 3400,
    hunger: 45,
    happiness: 13,
    description: 'Favorit pet berenergi tinggi.'
  },
  {
    id: 'star_cookie',
    name: 'Star Cookie',
    emoji: '⭐',
    basePrice: 3600,
    minPrice: 2200,
    maxPrice: 7000,
    hunger: 55,
    happiness: 22,
    description: 'Cookie langka untuk pet epic.'
  },
  {
    id: 'dragon_feast',
    name: 'Dragon Feast',
    emoji: '🍖',
    basePrice: 9500,
    minPrice: 6000,
    maxPrice: 16000,
    hunger: 80,
    happiness: 35,
    description: 'Makanan super mahal untuk pet kelas atas.'
  }
];

export const TAMAGOTCHI_CONFIG = {
  collectCooldownMs: 45 * 60 * 1000,
  playCooldownMs: 20 * 60 * 1000,
  trainCooldownMs: 60 * 60 * 1000,
  napCooldownMs: 30 * 60 * 1000,
  priceUpdateMs: 60 * 60 * 1000,
  marketTaxRate: 0.05,
  maxPetsPerUser: 12,
  maxListingsPerUser: 8,
  starterFoodId: 'kibble_basic',
  starterFoodAmount: 3
};

export const RARITY_EMOJIS = {
  Common: '⚪',
  Uncommon: '🟢',
  Rare: '🔵',
  Epic: '🟣',
  Legendary: '🟠'
};

export function getSpeciesById(id) {
  return PET_SPECIES.find((species) => species.id === id) || null;
}

export function getFoodById(id) {
  return PET_FOODS.find((food) => food.id === id) || null;
}
