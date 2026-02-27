import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { logger } from '../services/logger';
import { ICommand } from '../interfaces/ICommand';

export class BotClient extends Client {
  public commands: Collection<string, ICommand> = new Collection();
  public aliases: Collection<string, string> = new Collection();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.setupErrorHandlers();
  }

  /**
   * Register a command
   */
  public registerCommand(command: ICommand): void {
    this.commands.set(command.name, command);

    if (command.aliases) {
      command.aliases.forEach((alias) => {
        this.aliases.set(alias, command.name);
      });
    }

    logger.info(`Command registered: ${command.name}`, { service: 'BotClient' });
  }

  /**
   * Get a command by name or alias
   */
  public getCommand(nameOrAlias: string): ICommand | undefined {
    const commandName = this.aliases.get(nameOrAlias) || nameOrAlias;
    return this.commands.get(commandName);
  }

  /**
   * Setup error handlers for the client
   */
  private setupErrorHandlers(): void {
    this.on('error', (error) => {
      logger.error('Discord client error', {
        service: 'BotClient',
        error,
      });
    });

    this.on('warn', (warn) => {
      logger.warn('Discord client warning', {
        service: 'BotClient',
        warn,
      });
    });
  }
}
