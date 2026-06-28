import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  Interaction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { PrismaClient } from './prisma.js';

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const RACE_COLORS: Record<string, number> = {
  humains: 0xf59e0b,
  elfes: 0x22c55e,
  'hommes-betes': 0xe74c3c,
  titans: 0x94a3b8,
  demons: 0xdc143c,
  vampires: 0x8b008b,
  dragons: 0xd4af37,
  fees: 0xa78bfa,
};

const RANK_LABELS: Record<string, string> = {
  F: 'Novice',
  E: 'Apprenti',
  D: 'Initié',
  C: 'Compétent',
  B: 'Expert',
  A: 'Élite',
  S: 'Maître',
  'S+': 'Souverain',
  EX: 'Transcendant',
};

const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'S+', 'EX'];

const RANK_COLORS: Record<string, number> = {
  F: 0x808080,
  E: 0x6b7280,
  D: 0x22c55e,
  C: 0x3b82f6,
  B: 0xa855f7,
  A: 0xf59e0b,
  S: 0xef4444,
  'S+': 0xe8b830,
  EX: 0xff69b4,
};

const RARITY_EMOJIS: Record<string, string> = {
  common: '⚪',
  rare: '🔵',
  epic: '🟣',
  legendary: '🟡',
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

const TYPE_LABELS: Record<string, string> = {
  banner: 'Bannières',
  frame: 'Cadres',
  badge: 'Badges',
  background: 'Arrière-plans',
  effect: 'Effets',
  title_style: 'Styles de titre',
};

const SITE_URL = 'https://ascension.example.com';

// ──────────────────────────────────────────────────────────────
// Database
// ──────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function getRankIndex(rank: string): number {
  const idx = RANK_ORDER.indexOf(rank);
  return idx >= 0 ? idx : 0;
}

function getRankEmoji(rank: string): string {
  const idx = getRankIndex(rank);
  if (idx <= 1) return '⚪';
  if (idx <= 3) return '🟢';
  if (idx <= 5) return '🔵';
  if (idx <= 7) return '🟣';
  return '🟡';
}

function buildProgressBar(current: number, max: number, filled: string = '🟩', empty: string = '⬜'): string {
  const totalBlocks = 10;
  const ratio = Math.min(current / max, 1);
  const filledCount = Math.round(ratio * totalBlocks);
  return filled.repeat(filledCount) + empty.repeat(totalBlocks - filledCount);
}

function formatEther(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} ᛝ`;
}

function getRaceLabel(raceId: string | null | undefined): string {
  if (!raceId) return 'Inconnu';
  const labels: Record<string, string> = {
    humains: 'Humains',
    elfes: 'Elfes',
    'hommes-betes': 'Hommes-Bêtes',
    titans: 'Titans',
    demons: 'Démons',
    vampires: 'Vampires',
    dragons: 'Dragons',
    fees: 'Fées',
  };
  return labels[raceId] ?? raceId;
}

async function findProfile(discordId: string) {
  return prisma.user.findUnique({
    where: { discordId },
    include: {
      profile: {
        include: {
          inventory: {
            where: { equipped: true },
            include: { item: true },
          },
        },
      },
    },
  });
}

// ──────────────────────────────────────────────────────────────
// Slash Commands Definitions
// ──────────────────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Affiche la carte UUI d'un personnage")
    .addUserOption((opt) =>
      opt.setName('user').setDescription("Utilisateur Discord (par défaut : vous-même)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Affiche votre rang actuel et la progression"),
  new SlashCommandBuilder()
    .setName('ether')
    .setDescription("Affiche votre solde d'Éther et les transactions récentes"),
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription("Parcourez la boutique d'articles"),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription("Affiche toutes les commandes disponibles"),
].map((c) => c.toJSON());

// ──────────────────────────────────────────────────────────────
// Command Handlers
// ──────────────────────────────────────────────────────────────

async function handleProfile(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;

  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const discordId = targetUser.id;

  try {
    const data = await findProfile(discordId);

    if (!data?.profile) {
      await interaction.reply({
        content: `❌ Ce joueur n'a pas encore créé son profil sur le wiki.`,
        ephemeral: true,
      });
      return;
    }

    const { profile, image: discordAvatar } = data;
    const raceColor = RACE_COLORS[profile.race ?? ''] ?? 0x5865f2;
    const rankLabel = RANK_LABELS[profile.rank] ?? profile.rank;
    const rankEmoji = getRankEmoji(profile.rank);
    const avatarUrl = profile.avatarUrl ?? discordAvatar ?? undefined;
    const bannerUrl = profile.bannerUrl ? `${SITE_URL}${profile.bannerUrl}` : undefined;

    // Build equipped items text
    const equippedItems = profile.inventory
      .sort((a, b) => (a.slot ?? '').localeCompare(b.slot ?? ''))
      .map((inv) => {
        const label = TYPE_LABELS[inv.item.type] ?? inv.item.type;
        return `**${label}** — ${inv.item.name} ${RARITY_EMOJIS[inv.item.rarity] ?? ''}`;
      });

    const embed = new EmbedBuilder()
      .setColor(raceColor)
      .setAuthor({
        name: `${profile.characterName ?? targetUser.username}${profile.characterTitle ? ` — ${profile.characterTitle}` : ''}`,
        iconURL: avatarUrl,
      })
      .setThumbnail(avatarUrl)
      .addFields(
        { name: '🎭 Race', value: getRaceLabel(profile.race), inline: true },
        { name: '⭐ Rang', value: `${rankEmoji} ${rankLabel} (${profile.rank})`, inline: true },
        { name: 'ᛝ Éther', value: formatEther(profile.ether), inline: true }
      );

    if (profile.description) {
      embed.addFields({ name: '📖 Description', value: profile.description });
    }

    if (equippedItems.length > 0) {
      embed.addFields({ name: '🎒 Équipement', value: equippedItems.join('\n') });
    }

    embed.setFooter({ text: 'ASCENSION ノミステリ RP' });

    if (bannerUrl) {
      embed.setImage(bannerUrl);
    }

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[/profile] Error:', err);
    await interaction.reply({
      content: '❌ Une erreur est survenue lors du chargement du profil.',
      ephemeral: true,
    });
  }
}

async function handleRank(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;

  const discordId = interaction.user.id;

  try {
    const data = await findProfile(discordId);

    if (!data?.profile) {
      await interaction.reply({
        content: "❌ Vous n'avez pas encore créé de profil. Utilisez le wiki pour commencer.",
        ephemeral: true,
      });
      return;
    }

    const { profile } = data;
    const currentRank = profile.rank;
    const currentIdx = getRankIndex(currentRank);
    const currentLabel = RANK_LABELS[currentRank] ?? currentRank;
    const currentColor = RANK_COLORS[currentRank] ?? 0x808080;
    const currentEmoji = getRankEmoji(currentRank);

    // Build visual progress bar across all ranks
    const progressBar = RANK_ORDER.map((r, i) => {
      if (i < currentIdx) return '🟩';
      if (i === currentIdx) return '🟨';
      return '⬜';
    }).join(' ');

    const rankList = RANK_ORDER.map((r, i) => {
      const label = RANK_LABELS[r] ?? r;
      const emoji = getRankEmoji(r);
      const prefix = i === currentIdx ? '▸ ' : '  ';
      const suffix = i === currentIdx ? ' ◂' : '';
      return `${prefix}${emoji} **${r}** — ${label}${suffix}`;
    });

    // Next rank info
    let nextRankField = '';
    if (currentIdx < RANK_ORDER.length - 1) {
      const nextRank = RANK_ORDER[currentIdx + 1];
      const nextLabel = RANK_LABELS[nextRank] ?? nextRank;
      const nextEmoji = getRankEmoji(nextRank);
      nextRankField = `${nextEmoji} **Prochain rang** : ${nextLabel} (${nextRank})\nContinuez à progresser pour débloquer de nouvelles capacités !`;
    } else {
      nextRankField = '🏆 Vous avez atteint le rang maximum !';
    }

    const embed = new EmbedBuilder()
      .setColor(currentColor)
      .setTitle(`${currentEmoji} Rang — ${currentLabel}`)
      .setDescription(`**Rang actuel : ${currentRank} — ${currentLabel}**`)
      .addFields(
        { name: 'Progression', value: progressBar, inline: false },
        { name: 'Échelle des rangs', value: rankList.join('\n'), inline: false },
        { name: 'Prochaine étape', value: nextRankField, inline: false }
      )
      .setFooter({ text: 'ASCENSION ノミステリ RP' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[/rank] Error:', err);
    await interaction.reply({
      content: '❌ Une erreur est survenue lors du chargement du rang.',
      ephemeral: true,
    });
  }
}

async function handleEther(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;

  const discordId = interaction.user.id;

  try {
    const data = await findProfile(discordId);

    if (!data?.profile) {
      await interaction.reply({
        content: "❌ Vous n'avez pas encore créé de profil.",
        ephemeral: true,
      });
      return;
    }

    const { profile } = data;

    const transactions = await prisma.transaction.findMany({
      where: { userId: profile.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const txLines = transactions.length > 0
      ? transactions.map((tx) => {
          const sign = tx.amount >= 0 ? '+ᛝ' : '-ᛝ';
          const absAmount = Math.abs(tx.amount).toLocaleString('fr-FR');
          const date = tx.createdAt.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          const reasonLabel = tx.reason ?? tx.type;
          return `${sign} **${absAmount}** — ${reasonLabel} *(${date})*`;
        })
      : ['Aucune transaction récente.'];

    const embed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle('ᛝ Portefeuille d\'Éther')
      .setDescription(`**Solde actuel :** ${formatEther(profile.ether)}`)
      .addFields({ name: '📜 Transactions récentes', value: txLines.join('\n') })
      .setFooter({ text: 'ASCENSION ノミステリ RP' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[/ether] Error:', err);
    await interaction.reply({
      content: "❌ Une erreur est survenue lors du chargement de l'Éther.",
      ephemeral: true,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// Shop — pagination + category filter
// ──────────────────────────────────────────────────────────────

const SHOP_CATEGORIES = ['all', 'banner', 'frame', 'badge'];

const ITEMS_PER_PAGE = 5;

async function buildShopEmbed(category: string, page: number) {
  const where: Record<string, unknown> = { active: true };
  if (category !== 'all') {
    where.type = category;
  }

  const [items, total] = await Promise.all([
    prisma.shopItem.findMany({
      where,
      skip: page * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
      orderBy: { price: 'asc' },
    }),
    prisma.shopItem.count({ where }),
  ]);

  const maxPage = Math.max(0, Math.ceil(total / ITEMS_PER_PAGE) - 1);
  const categoryLabel = category === 'all' ? 'Tous les articles' : TYPE_LABELS[category] ?? category;

  const itemLines = items.length > 0
    ? items.map((item, i) => {
        const rarityEmoji = RARITY_EMOJIS[item.rarity] ?? '⚪';
        const rarityLabel = RARITY_LABELS[item.rarity] ?? item.rarity;
        return `**${i + 1 + page * ITEMS_PER_PAGE}.** ${item.name} ${rarityEmoji}\n` +
          `   ${item.description.slice(0, 80)}${item.description.length > 80 ? '…' : ''}\n` +
          `   💰 ${formatEther(item.price)} · ${rarityLabel}`;
      })
    : ['Aucun article dans cette catégorie.'];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🛒 Boutique — ASCENSION')
    .setDescription(`**Catégorie :** ${categoryLabel}\n**Page ${page + 1} / ${maxPage + 1}** (${total} articles)`)
    .addFields({ name: 'Articles', value: itemLines.join('\n\n') })
    .setFooter({ text: 'ASCENSION ノミステリ RP' })
    .setTimestamp();

  return { embed, maxPage };
}

function buildShopButtons(category: string, page: number, maxPage: number) {
  const row = new ActionRowBuilder<ButtonBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`shop:prev:${category}:${page}`)
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0)
  );

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`shop:next:${category}:${page}`)
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage)
  );

  for (const cat of ['banner', 'frame', 'badge'] as const) {
    const label = TYPE_LABELS[cat] ?? cat;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop:cat:${cat}`)
        .setLabel(label)
        .setStyle(category === cat ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  }

  return row;
}

async function handleShop(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { embed, maxPage } = await buildShopEmbed('all', 0);
    const row = buildShopButtons('all', 0, maxPage);

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    console.error('[/shop] Error:', err);
    await interaction.reply({
      content: '❌ Une erreur est survenue lors du chargement de la boutique.',
      ephemeral: true,
    });
  }
}

async function handleShopButton(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith('shop:')) return;

  try {
    const parts = customId.split(':');
    const action = parts[1];

    let category = 'all';
    let page = 0;

    if (action === 'prev') {
      category = parts[2];
      page = Math.max(0, parseInt(parts[3], 10) - 1);
    } else if (action === 'next') {
      category = parts[2];
      page = parseInt(parts[3], 10) + 1;
    } else if (action === 'cat') {
      category = parts[2];
      page = 0;
    }

    const { embed, maxPage } = await buildShopEmbed(category, page);
    const row = buildShopButtons(category, page, maxPage);

    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    console.error('[shop button] Error:', err);
    await interaction.reply({
      content: '❌ Une erreur est survenue.',
      ephemeral: true,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// Help
// ──────────────────────────────────────────────────────────────

async function handleHelp(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🆘 Aide — ASCENSION Bot')
    .setDescription('Voici toutes les commandes disponibles :')
    .addFields(
      { name: '/profile [user]', value: "Affiche la carte UUI d'un personnage. Si aucun utilisateur n'est mentionné, affiche votre profil.", inline: false },
      { name: '/rank', value: 'Affiche votre rang actuel avec une barre de progression et le prochain palier.', inline: false },
      { name: '/ether', value: "Affiche votre solde d'Éther et les 5 dernières transactions.", inline: false },
      { name: '/shop', value: 'Parcourez la boutique d\'articles (bannières, cadres, badges) avec pagination.', inline: false },
      { name: '/help', value: 'Affiche ce message d\'aide.', inline: false },
    )
    .setFooter({ text: 'ASCENSION ノミステリ RP' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
// Bot Initialization
// ──────────────────────────────────────────────────────────────

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ DISCORD_TOKEN is not set. Please set it in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

client.once('ready', async () => {
  console.log(`✅ Bot connecté en tant que ${client.user?.tag}`);

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('📝 Enregistrement des commandes slash...');
    await rest.put(
      Routes.applicationCommands(client.user!.id),
      { body: commands }
    );
    console.log('✅ Commandes slash enregistrées avec succès.');
  } catch (err) {
    console.error('❌ Erreur lors de l\'enregistrement des commandes :', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    switch (interaction.commandName) {
      case 'profile':
        await handleProfile(interaction);
        break;
      case 'rank':
        await handleRank(interaction);
        break;
      case 'ether':
        await handleEther(interaction);
        break;
      case 'shop':
        await handleShop(interaction);
        break;
      case 'help':
        await handleHelp(interaction);
        break;
      default:
        await interaction.reply({
          content: '❌ Commande inconnue.',
          ephemeral: true,
        });
    }
    return;
  }

  // Handle button interactions (shop)
  if (interaction.isButton()) {
    await handleShopButton(interaction);
    return;
  }
});

client.on('error', (err) => {
  console.error('❌ Erreur Discord :', err);
});

// Keep-alive: prevent process from exiting on idle
const keepalive = setInterval(() => {
  if (client.ws?.ping !== undefined) {
    // WebSocket is alive, all good
  }
}, 30_000);

process.on('SIGINT', async () => {
  console.log('\n🛑 Arrêt du bot...');
  clearInterval(keepalive);
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Arrêt du bot (SIGTERM)...');
  clearInterval(keepalive);
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

// Auto-restart on unhandled errors
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
});

client.login(TOKEN);