import { logger } from './services/logger';
import { config, validateConfig } from './core/config';
import { initializeDatabase, getDatabase, getPool, closeDatabase } from './services/database';
import { BotClient } from './core/client';
import { CommandHandler } from './commands/handler';
import { SlashCommandManager } from './core/slashCommandManager';
import { CommandRegistry } from './services/commandRegistry';
import { GDPRService } from './services/gdpr';
import { GDPRCleanupJob } from './jobs/GDPRCleanupJob';

/**
 * Main bot initialization and startup
 */
async function main(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();

    logger.info('Starting Discord bot...', { service: 'Main' });

    // Initialize database
    logger.info('Initializing database...', { service: 'Main' });
    initializeDatabase(config.database.url);
    const db = getDatabase();
    logger.info('Database initialized', { service: 'Main' });

    // Create bot client
    const client = new BotClient();

    // Initialize command registry
    const commandRegistry = new CommandRegistry();
    const { commands } = await commandRegistry.initialize();

    // Register commands with client
    for (const [, command] of commands) {
      client.registerCommand(command);
    }

    logger.info(`Registered ${commands.size} commands`, {
      service: 'Main',
      commands: Array.from(commands.keys()),
    });

    // Initialize GDPR cleanup job
    const gdprService = new GDPRService(getPool());
    const cleanupJob = new GDPRCleanupJob(gdprService);
    cleanupJob.start();

    // Create command handler
    const commandHandler = new CommandHandler('!', client.commands, client.aliases);

    // Create slash command manager
    const slashCommandManager = new SlashCommandManager(client, client.commands);

    // Event: Ready
    client.on('ready', async () => {
      logger.info(`Bot logged in as ${client.user?.tag}`, {
        service: 'Bot',
        userId: client.user?.id,
      });

      // Sync slash commands with Discord
      logger.info('Syncing slash commands on bot ready...', { service: 'Bot' });
      await slashCommandManager.syncSlashCommands();

      // Set bot status
      if (client.user) {
        client.user.setActivity('Discord bot service', { type: 'WATCHING' });
      }
    });

    // Event: Message create
    client.on('messageCreate', async (message) => {
      await commandHandler.handleMessage(message);
    });

    // Event: Interaction create
    client.on('interactionCreate', async (interaction) => {
      if (interaction.isCommand()) {
        await commandHandler.handleInteraction(interaction);
      }
    });

    // Event: Guild create
    client.on('guildCreate', async (guild) => {
      logger.info(`Bot joined guild: ${guild.name}`, {
        service: 'Bot',
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount,
      });

      try {
        // Optionally store guild in database
        await db.guilds.getOrCreate({
          discord_guild_id: guild.id,
          name: guild.name,
          icon_url: guild.iconURL() || undefined,
          owner_id: guild.ownerId,
        });

        // Log action
        await db.auditLogs.logAction({
          guild_id: guild.id,
          action: 'guild_created',
          details: {
            name: guild.name,
            memberCount: guild.memberCount,
          },
        });
      } catch (error) {
        logger.error('Error handling guild create event', {
          service: 'Bot',
          guildId: guild.id,
          error,
        });
      }
    });

    // Event: Guild member add
    client.on('guildMemberAdd', async (member) => {
      logger.info(`User joined guild: ${member.guild.name}`, {
        service: 'Bot',
        userId: member.id,
        guildId: member.guild.id,
      });

      try {
        // Store or update user
        const user = await db.users.getOrCreate({
          discord_id: member.id,
          username: member.user.username,
          avatar_url: member.user.avatarURL() || undefined,
        });

        // Add member to guild
        await db.guildMembers.getOrCreateMember({
          guild_id: member.guild.id,
          user_id: user.id,
        });

        // Log action
        await db.auditLogs.logAction({
          guild_id: member.guild.id,
          user_id: user.id,
          action: 'member_joined',
          details: {
            username: member.user.username,
          },
        });
      } catch (error) {
        logger.error('Error handling guild member add event', {
          service: 'Bot',
          userId: member.id,
          guildId: member.guild.id,
          error,
        });
      }
    });

    // Error handling
    client.on('error', (error) => {
      logger.error('Discord client error', {
        service: 'Bot',
        error,
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', {
        service: 'Process',
        reason,
        promise: String(promise),
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        service: 'Process',
        error,
      });
      process.exit(1);
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`, {
        service: 'Process',
      });

      // Stop cleanup job
      cleanupJob.stop();

      client.destroy();
      await closeDatabase();

      logger.info('Bot shut down successfully', { service: 'Process' });
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Log in to Discord
    logger.info('Logging into Discord...', { service: 'Bot' });
    await client.login(config.discord.token);
  } catch (error) {
    logger.error('Failed to start bot', {
      service: 'Main',
      error,
    });
    process.exit(1);
  }
}

// Start the bot
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
