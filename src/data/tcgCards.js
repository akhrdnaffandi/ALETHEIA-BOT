export const RARITY = {
  common: { label: 'Common', emoji: '⚪', order: 1, color: '#9CA3AF', frame: 'Basic' },
  uncommon: { label: 'Uncommon', emoji: '🟢', order: 2, color: '#22C55E', frame: 'Growth' },
  rare: { label: 'Rare', emoji: '🔵', order: 3, color: '#3B82F6', frame: 'Rare' },
  epic: { label: 'Epic', emoji: '🟣', order: 4, color: '#A855F7', frame: 'Elite' },
  legendary: { label: 'Legendary', emoji: '🟡', order: 5, color: '#F59E0B', frame: 'Mythic' },
};

export const ELEMENT_META = {
  Fire: { emoji: '🔥', color: '#EF4444', weakTo: 'Water', strongAgainst: 'Grass' },
  Water: { emoji: '💧', color: '#38BDF8', weakTo: 'Electric', strongAgainst: 'Fire' },
  Grass: { emoji: '🌿', color: '#22C55E', weakTo: 'Fire', strongAgainst: 'Water' },
  Electric: { emoji: '⚡', color: '#FACC15', weakTo: 'Earth', strongAgainst: 'Water' },
  Psychic: { emoji: '🔮', color: '#D946EF', weakTo: 'Shadow', strongAgainst: 'Metal' },
  Earth: { emoji: '🪨', color: '#A16207', weakTo: 'Grass', strongAgainst: 'Electric' },
  Ice: { emoji: '❄️', color: '#7DD3FC', weakTo: 'Fire', strongAgainst: 'Dragon' },
  Shadow: { emoji: '🌑', color: '#6B21A8', weakTo: 'Metal', strongAgainst: 'Psychic' },
  Dragon: { emoji: '🐉', color: '#F97316', weakTo: 'Ice', strongAgainst: 'Shadow' },
  Metal: { emoji: '⚙️', color: '#94A3B8', weakTo: 'Psychic', strongAgainst: 'Shadow' },
};

export const ELEMENT_EMOJI = Object.fromEntries(
  Object.entries(ELEMENT_META).map(([element, meta]) => [element, meta.emoji]),
);

export const CARD_CATALOG = [
  { id: 'sparkchu', name: 'Sparkchu', element: 'Electric', rarity: 'common', stage: 'Basic', hp: 60, attack: 22, defense: 10, skill: 'Static Zap', flavor: 'A tiny storm spirit that stores sparks in its cheeks.' },
  { id: 'leaflit', name: 'Leaflit', element: 'Grass', rarity: 'common', stage: 'Basic', hp: 65, attack: 18, defense: 14, skill: 'Vine Nudge', flavor: 'It hides under broad leaves and heals under moonlight.' },
  { id: 'bubblin', name: 'Bubblin', element: 'Water', rarity: 'common', stage: 'Basic', hp: 62, attack: 19, defense: 13, skill: 'Bubble Shot', flavor: 'Its bubbles pop with a soft splash and a loud surprise.' },
  { id: 'embercub', name: 'Embercub', element: 'Fire', rarity: 'common', stage: 'Basic', hp: 58, attack: 24, defense: 9, skill: 'Tiny Flame', flavor: 'Small paws, warm heart, dangerous tail flame.' },
  { id: 'pebblehorn', name: 'Pebblehorn', element: 'Earth', rarity: 'common', stage: 'Basic', hp: 70, attack: 16, defense: 18, skill: 'Rock Guard', flavor: 'It sleeps standing up and looks exactly like a boulder.' },
  { id: 'snowpuff', name: 'Snowpuff', element: 'Ice', rarity: 'common', stage: 'Basic', hp: 57, attack: 20, defense: 12, skill: 'Cold Touch', flavor: 'A fluffy creature that leaves frost on everything it hugs.' },
  { id: 'cogkit', name: 'Cogkit', element: 'Metal', rarity: 'common', stage: 'Basic', hp: 64, attack: 17, defense: 16, skill: 'Gear Tap', flavor: 'Its tail clicks whenever danger is nearby.' },
  { id: 'shadeling', name: 'Shadeling', element: 'Shadow', rarity: 'common', stage: 'Basic', hp: 55, attack: 25, defense: 8, skill: 'Night Scratch', flavor: 'It only appears in the corner of your vision.' },
  { id: 'mossprout', name: 'Mossprout', element: 'Grass', rarity: 'uncommon', stage: 'Stage 1', hp: 78, attack: 27, defense: 20, skill: 'Healing Root', flavor: 'Its roots can stitch cracked stone back together.' },
  { id: 'voltpup', name: 'Voltpup', element: 'Electric', rarity: 'uncommon', stage: 'Stage 1', hp: 74, attack: 31, defense: 16, skill: 'Charge Bite', flavor: 'It runs faster when thunderclouds are near.' },
  { id: 'aquaryu', name: 'Aquaryu', element: 'Water', rarity: 'uncommon', stage: 'Stage 1', hp: 82, attack: 28, defense: 22, skill: 'Tidal Push', flavor: 'Its fins draw small waves even on dry land.' },
  { id: 'flametail', name: 'Flametail', element: 'Fire', rarity: 'uncommon', stage: 'Stage 1', hp: 76, attack: 34, defense: 15, skill: 'Blaze Dash', flavor: 'It leaves glowing pawprints for a few seconds.' },
  { id: 'mindmewl', name: 'Mindmewl', element: 'Psychic', rarity: 'uncommon', stage: 'Stage 1', hp: 72, attack: 33, defense: 14, skill: 'Mind Flicker', flavor: 'It wins staring contests before they even begin.' },
  { id: 'ironfin', name: 'Ironfin', element: 'Metal', rarity: 'uncommon', stage: 'Stage 1', hp: 84, attack: 25, defense: 26, skill: 'Steel Splash', flavor: 'Its scales ring like tiny bells underwater.' },
  { id: 'shadowkit', name: 'Shadowkit', element: 'Shadow', rarity: 'uncommon', stage: 'Stage 1', hp: 70, attack: 35, defense: 13, skill: 'Dark Scratch', flavor: 'Its shadow moves a little slower than its body.' },
  { id: 'terramole', name: 'Terramole', element: 'Earth', rarity: 'uncommon', stage: 'Stage 1', hp: 86, attack: 26, defense: 28, skill: 'Tunnel Bash', flavor: 'It knows every secret tunnel under the arena.' },
  { id: 'thundra', name: 'Thundra', element: 'Electric', rarity: 'rare', stage: 'Stage 2', hp: 95, attack: 45, defense: 24, skill: 'Thunder Rush', flavor: 'Its roar sounds like lightning splitting the sky.' },
  { id: 'pyrofang', name: 'Pyrofang', element: 'Fire', rarity: 'rare', stage: 'Stage 2', hp: 92, attack: 49, defense: 20, skill: 'Inferno Bite', flavor: 'Every bite leaves an ember mark.' },
  { id: 'tidalodon', name: 'Tidalodon', element: 'Water', rarity: 'rare', stage: 'Stage 2', hp: 105, attack: 41, defense: 29, skill: 'Aqua Crash', flavor: 'It charges like a living wave.' },
  { id: 'psyflora', name: 'Psyflora', element: 'Psychic', rarity: 'rare', stage: 'Stage 2', hp: 90, attack: 47, defense: 21, skill: 'Petal Vision', flavor: 'Its petals show possible futures.' },
  { id: 'glaciron', name: 'Glaciron', element: 'Ice', rarity: 'rare', stage: 'Stage 2', hp: 100, attack: 39, defense: 32, skill: 'Frozen Armor', flavor: 'Its armor never melts, even beside lava.' },
  { id: 'rockmaw', name: 'Rockmaw', element: 'Earth', rarity: 'rare', stage: 'Stage 2', hp: 112, attack: 36, defense: 35, skill: 'Mountain Crush', flavor: 'It eats gemstones to sharpen its teeth.' },
  { id: 'starwyrm', name: 'Starwyrm', element: 'Dragon', rarity: 'rare', stage: 'Stage 2', hp: 108, attack: 44, defense: 30, skill: 'Comet Tail', flavor: 'It follows falling stars across the night.' },
  { id: 'solaraptor', name: 'Solaraptor', element: 'Fire', rarity: 'epic', stage: 'Elite', hp: 130, attack: 63, defense: 36, skill: 'Solar Wing', flavor: 'Its wings shine brighter during the final turn.' },
  { id: 'stormeon', name: 'Stormeon', element: 'Electric', rarity: 'epic', stage: 'Elite', hp: 118, attack: 70, defense: 28, skill: 'Chain Lightning', flavor: 'One spark from its mane can wake a city.' },
  { id: 'abysswhale', name: 'Abysswhale', element: 'Water', rarity: 'epic', stage: 'Elite', hp: 145, attack: 55, defense: 42, skill: 'Deep Sea Roar', flavor: 'Its song is heard only by lost sailors.' },
  { id: 'nightlance', name: 'Nightlance', element: 'Shadow', rarity: 'epic', stage: 'Elite', hp: 120, attack: 74, defense: 25, skill: 'Eclipse Pierce', flavor: 'It strikes from places where light refuses to stay.' },
  { id: 'mechagryph', name: 'Mechagryph', element: 'Metal', rarity: 'epic', stage: 'Elite', hp: 134, attack: 60, defense: 45, skill: 'Rocket Talon', flavor: 'Built by ancient engineers, awakened by battle.' },
  { id: 'crystalbloom', name: 'Crystalbloom', element: 'Grass', rarity: 'epic', stage: 'Elite', hp: 132, attack: 58, defense: 43, skill: 'Prism Garden', flavor: 'Its flowers reflect attacks as colorful sparks.' },
  { id: 'auroragon', name: 'Auroragon', element: 'Dragon', rarity: 'legendary', stage: 'Legend', hp: 180, attack: 88, defense: 55, skill: 'Aurora Nova', flavor: 'A dragon said to paint the sky after every victory.' },
  { id: 'volcanox', name: 'Volcanox', element: 'Fire', rarity: 'legendary', stage: 'Legend', hp: 170, attack: 96, defense: 46, skill: 'Magma Cataclysm', flavor: 'Its steps are recorded as volcanic events.' },
  { id: 'leviaqua', name: 'Leviaqua', element: 'Water', rarity: 'legendary', stage: 'Legend', hp: 188, attack: 82, defense: 60, skill: 'Ocean Judgment', flavor: 'It judges battles from below the deepest sea.' },
  { id: 'celestine', name: 'Celestine', element: 'Psychic', rarity: 'legendary', stage: 'Legend', hp: 160, attack: 102, defense: 40, skill: 'Starfall Mind', flavor: 'It bends starlight into thoughts.' },
  { id: 'drakoshade', name: 'Drakoshade', element: 'Shadow', rarity: 'legendary', stage: 'Legend', hp: 172, attack: 99, defense: 44, skill: 'Void Dragon', flavor: 'No record of its first appearance survived.' },
  { id: 'titangear', name: 'Titangear', element: 'Metal', rarity: 'legendary', stage: 'Legend', hp: 190, attack: 84, defense: 66, skill: 'Core Overdrive', flavor: 'A walking fortress powered by a tiny glowing core.' },
];

export const PACKS = {
  starter: {
    id: 'starter', name: 'Starter Pack', emoji: '🎒', color: '#22C55E', price: 500, cardCount: 3, holoChance: 0.03,
    description: 'Cheap beginner pack. Good for filling your first collection.',
    chances: { common: 0.74, uncommon: 0.21, rare: 0.05, epic: 0, legendary: 0 },
  },
  great: {
    id: 'great', name: 'Great Pack', emoji: '📦', color: '#3B82F6', price: 2000, cardCount: 5, holoChance: 0.07,
    description: 'Balanced pack with a real chance at rare cards.',
    chances: { common: 0.50, uncommon: 0.28, rare: 0.17, epic: 0.045, legendary: 0.005 },
  },
  ultra: {
    id: 'ultra', name: 'Ultra Pack', emoji: '💎', color: '#A855F7', price: 7500, cardCount: 7, holoChance: 0.12,
    description: 'Premium pack for collectors chasing epic and legendary pulls.',
    chances: { common: 0.35, uncommon: 0.30, rare: 0.22, epic: 0.09, legendary: 0.04 },
  },
  master: {
    id: 'master', name: 'Master Pack', emoji: '👑', color: '#F59E0B', price: 20000, cardCount: 10, holoChance: 0.20,
    description: 'High-end pack with the best legendary odds.',
    chances: { common: 0.18, uncommon: 0.24, rare: 0.30, epic: 0.20, legendary: 0.08 },
  },
};

export const TCG_GAME = {
  deckSize: 6,
  maxPackBuyAmount: 20,
  maxPackOpenAmount: 10,
  marketTaxRate: 0.05,
  tradeOfferTtlHours: 24,
};
