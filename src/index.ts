import { Client, Collection, Intents } from 'discord.js';
import dotenv from 'dotenv';
import logger from './services/logger.js';
import { initializeDatabase, closeDatabase } from './services/database.js';

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DISCORD_TOKEN) {
  logger.error('DISCORD_TOKEN environment variable is not set');
  process.exit(1);
}

if (!DATABASE_URL) {
  logger.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Initialize Discord client
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.MESSAGE_CONTENT,
    Intents.FLAGS.DIRECT_MESSAGES,
  ],
});

// Store commands for the bot
export const commands = new Collection<string, any>();

// Initialize database connection
initializeDatabase(DATABASE_URL);

// Ready event
client.on('ready', () => {
  logger.info(`Bot logged in as ${client.user?.tag}`);
});

// Message create event - example
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!ping') {
    message.reply({
      content: `Pong! Latency is ${Math.round(client.ws.ping)}ms.`
    });
  }
});

// Guild create event
client.on('guildCreate', async (guild) => {
  logger.info(`Bot joined guild: ${guild.name} (${guild.id})`);
  
  try {
    // Optional: Store guild info in database
    // await saveGuild(guild.id, guild.name);
  } catch (error) {
    logger.error('Error handling guild create event', { error });
  }
});

// Error handling
client.on('error', (error) => {
  logger.error('Discord client error', { error });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at', { promise, reason });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down bot...');
  client.destroy();
  await closeDatabase();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the bot
client.login(DISCORD_TOKEN).catch((error) => {
  logger.error('Failed to login', { error });
  process.exit(1);
});

export default client;
