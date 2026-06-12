import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import TamagotchiService from '../../services/tamagotchiService.js';

import shopBrowse from './modules/shop_browse.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';
import shopPet from './modules/shop_pet.js';

const speciesChoices = TamagotchiService.getSpeciesChoices();
const foodChoices = TamagotchiService.getFoodChoices();

function addPetIdOption(subcommand, description = 'Pet ID dari koleksi kamu') {
    return subcommand.addStringOption(option =>
        option
            .setName('pet_id')
            .setDescription(description)
            .setRequired(true),
    );
}

function addListingIdOption(subcommand, description = 'Listing ID dari market') {
    return subcommand.addStringOption(option =>
        option
            .setName('listing_id')
            .setDescription(description)
            .setRequired(true),
    );
}

function addFoodOption(subcommand, required = true) {
    return subcommand.addStringOption(option =>
        option
            .setName('food')
            .setDescription('Pilih makanan pet')
            .setRequired(required)
            .addChoices(...foodChoices),
    );
}

function addAmountOption(subcommand, required = false, min = 1, max = 99) {
    return subcommand.addIntegerOption(option =>
        option
            .setName('amount')
            .setDescription(`Jumlah (${min}-${max})`)
            .setRequired(required)
            .setMinValue(min)
            .setMaxValue(max),
    );
}

function addPriceOption(subcommand) {
    return subcommand.addIntegerOption(option =>
        option
            .setName('price')
            .setDescription('Harga jual ke player')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(999999999),
    );
}

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Economy shop commands.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('browse')
                .setDescription('Browse the economy shop.'),
        )
        .addSubcommandGroup(group =>
            group
                .setName('config')
                .setDescription('Configure shop settings. (Manage Server required)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('setrole')
                        .setDescription('Set the Discord role granted when the Premium Role shop item is purchased.')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('The role to grant for Premium Role purchases.')
                                .setRequired(true),
                        ),
                ),
        )
        .addSubcommandGroup(group =>
            group
                .setName('pet')
                .setDescription('Tamagotchi pet, food, and market commands.')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('shop')
                        .setDescription('Lihat pet yang bisa dibeli dari server.'),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('adopt')
                        .setDescription('Beli pet dari server.')
                        .addStringOption(option =>
                            option
                                .setName('species')
                                .setDescription('Pilih jenis pet')
                                .setRequired(true)
                                .addChoices(...speciesChoices),
                        )
                        .addStringOption(option =>
                            option
                                .setName('nickname')
                                .setDescription('Nama panggilan pet, opsional')
                                .setRequired(false)
                                .setMaxLength(24),
                        ),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('Lihat status pet aktif beserta visual animasinya.')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('User yang ingin dicek, opsional')
                                .setRequired(false),
                        ),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('pets')
                        .setDescription('Lihat semua pet milikmu.'),
                )
                .addSubcommand(subcommand =>
                    addPetIdOption(
                        subcommand
                            .setName('select')
                            .setDescription('Jadikan salah satu pet sebagai pet aktif.'),
                    ),
                )
                .addSubcommand(subcommand =>
                    addAmountOption(
                        addFoodOption(
                            subcommand
                                .setName('feed')
                                .setDescription('Beri makan pet aktif.'),
                            false,
                        ),
                        false,
                        1,
                        10,
                    ),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('play')
                        .setDescription('Main dengan pet agar happiness naik.'),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('nap')
                        .setDescription('Biarkan pet tidur agar energy naik.'),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('train')
                        .setDescription('Latih pet untuk menaikkan XP dan level.'),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('collect')
                        .setDescription('Ambil reward cash dari pet aktif.'),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('foodshop')
                        .setDescription('Lihat makanan pet dan harga server dinamis.'),
                )
                .addSubcommand(subcommand =>
                    addAmountOption(
                        addFoodOption(
                            subcommand
                                .setName('buyfood')
                                .setDescription('Beli makanan dari server.'),
                            true,
                        ),
                        false,
                        1,
                        99,
                    ),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('foodbag')
                        .setDescription('Lihat makanan yang kamu punya.'),
                )
                .addSubcommand(subcommand =>
                    addAmountOption(
                        addFoodOption(
                            subcommand
                                .setName('sellserver')
                                .setDescription('Jual makanan ke server mengikuti harga server.'),
                            true,
                        ),
                        false,
                        1,
                        99,
                    ),
                )
                .addSubcommand(subcommand =>
                    addPriceOption(
                        addAmountOption(
                            addFoodOption(
                                subcommand
                                    .setName('sellfood')
                                    .setDescription('Jual makanan ke player melalui market.'),
                                true,
                            ),
                            true,
                            1,
                            99,
                        ),
                    ),
                )
                .addSubcommand(subcommand =>
                    addListingIdOption(
                        subcommand
                            .setName('buyfoodlisting')
                            .setDescription('Beli makanan dari player market.'),
                    ),
                )
                .addSubcommand(subcommand =>
                    addPriceOption(
                        addPetIdOption(
                            subcommand
                                .setName('sellpet')
                                .setDescription('Jual pet ke player melalui market.'),
                        ),
                    ),
                )
                .addSubcommand(subcommand =>
                    addListingIdOption(
                        subcommand
                            .setName('buypet')
                            .setDescription('Beli pet dari player market.'),
                    ),
                )
                .addSubcommand(subcommand =>
                    addPetIdOption(
                        subcommand
                            .setName('sellpetserver')
                            .setDescription('Jual pet ke server mengikuti harga server.'),
                    ),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('market')
                        .setDescription('Lihat pet dan makanan yang dijual player.')
                        .addStringOption(option =>
                            option
                                .setName('type')
                                .setDescription('Filter market')
                                .setRequired(false)
                                .addChoices(
                                    { name: 'All', value: 'all' },
                                    { name: 'Pets', value: 'pets' },
                                    { name: 'Food', value: 'food' },
                                ),
                        ),
                )
                .addSubcommand(subcommand =>
                    addListingIdOption(
                        subcommand
                            .setName('cancel')
                            .setDescription('Batalkan listing pet/food milikmu.'),
                    ),
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('prices')
                        .setDescription('Cek harga server makanan yang sedang naik/turun.'),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'browse') {
                return await shopBrowse.execute(interaction, config, client);
            }

            if (subcommandGroup === 'config' && subcommand === 'setrole') {
                return await shopConfigSetrole.execute(interaction, config, client);
            }

            if (subcommandGroup === 'pet') {
                return await shopPet.execute(interaction, config, client);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Error', 'Unknown subcommand.')],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('shop command error:', error);
            await InteractionHelper.safeReply(interaction, {
                content: '❌ An error occurred while running the shop command.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};
