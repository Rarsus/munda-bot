import { Collection } from 'discord.js';
import { ICommand } from '../interfaces/ICommand';
import { logger } from '../services/logger';
import { getPool } from '../services/database';

// Import all commands
import { PingCommand } from '../commands/examples/ping';
import { HelpCommand } from '../commands/examples/help';
import { GDPRDataAccessCommand } from '../commands/gdpr/GDPRDataAccessCommand';
import { GDPRDataExportCommand } from '../commands/gdpr/GDPRDataExportCommand';
import { GDPRDataDeletionCommand } from '../commands/gdpr/GDPRDataDeletionCommand';
import { GDPRStatusCommand } from '../commands/gdpr/GDPRStatusCommand';
import { GDPRAdminCommand } from '../commands/gdpr/GDPRAdminCommand';

// Import services
import { GDPRService } from '../services/gdpr';

/**
 * Registry for all bot commands
 * Centralizes command instantiation and registration
 */
export class CommandRegistry {
  private commands: Collection<string, ICommand> = new Collection();
  private aliases: Collection<string, string> = new Collection();

  /**
   * Initialize all commands
   */
  async initialize(): Promise<{ commands: Collection<string, ICommand>; aliases: Collection<string, string> }> {
    try {
      const pool = getPool();

      // Initialize GDPR service
      const gdprService = new GDPRService(pool);

      // Register example commands
      this.registerCommand(new PingCommand());
      this.registerCommand(new HelpCommand());

      // Register GDPR commands
      this.registerCommand(new GDPRDataAccessCommand(gdprService));
      this.registerCommand(new GDPRDataExportCommand(gdprService));
      this.registerCommand(new GDPRDataDeletionCommand(gdprService));
      this.registerCommand(new GDPRStatusCommand(gdprService));
      this.registerCommand(new GDPRAdminCommand(gdprService));

      logger.info('CommandRegistry initialized', {
        service: 'CommandRegistry',
        totalCommands: this.commands.size,
        commands: Array.from(this.commands.keys()),
      });

      return {
        commands: this.commands,
        aliases: this.aliases,
      };
    } catch (error) {
      logger.error('Failed to initialize CommandRegistry', {
        service: 'CommandRegistry',
        error,
      });
      throw error;
    }
  }

  /**
   * Register a single command
   */
  private registerCommand(command: ICommand): void {
    this.commands.set(command.name, command);

    if (command.aliases) {
      command.aliases.forEach((alias) => {
        this.aliases.set(alias, command.name);
      });
    }

    logger.debug(`Command registered: ${command.name}`, {
      service: 'CommandRegistry',
      aliases: command.aliases || [],
    });
  }
}
