import { Message, CommandInteraction, Collection } from 'discord.js';
import { logger } from '../services/logger';
import { ICommand } from '../interfaces/ICommand';
import { parseCommandArgs } from './types';

export class CommandHandler {
  private prefix: string;
  private commands: Collection<string, ICommand>;
  private aliases: Collection<string, string>;

  constructor(
    prefix: string,
    commands: Collection<string, ICommand>,
    aliases: Collection<string, string>
  ) {
    this.prefix = prefix;
    this.commands = commands;
    this.aliases = aliases;
  }

  /**
   * Handle message commands
   */
  async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if message starts with prefix
    if (!message.content.startsWith(this.prefix)) return;

    const { command: commandName, args } = parseCommandArgs(message, this.prefix);

    // Get command by name or alias
    const commandNameResolved = this.aliases.get(commandName) || commandName;
    const command = this.commands.get(commandNameResolved);

    if (!command) {
      logger.warn(`Unknown command: ${commandName}`, {
        service: 'CommandHandler',
        userId: message.author.id,
        guildId: message.guildId,
      });
      return;
    }

    try {
      logger.info(`Executing command: ${command.name}`, {
        service: 'CommandHandler',
        userId: message.author.id,
        guildId: message.guildId,
        args,
      });

      if ('safeExecute' in command) {
        await (
          command as unknown as { safeExecute(...args: unknown[]): Promise<void> }
        ).safeExecute(message, this.commands, ...args);
      } else {
        await command.execute(message, this.commands, ...args);
      }
    } catch (error) {
      logger.error(`Command execution failed: ${command.name}`, {
        service: 'CommandHandler',
        error,
      });
    }
  }

  /**
   * Handle interaction commands
   */
  async handleInteraction(interaction: CommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Unknown interaction command: ${interaction.commandName}`, {
        service: 'CommandHandler',
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      return;
    }

    try {
      logger.info(`Executing interaction command: ${command.name}`, {
        service: 'CommandHandler',
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      if ('safeExecute' in command) {
        await (
          command as unknown as { safeExecute(...args: unknown[]): Promise<void> }
        ).safeExecute(interaction, this.commands);
      } else {
        await command.execute(interaction, this.commands);
      }
    } catch (error) {
      logger.error(`Interaction command execution failed: ${command.name}`, {
        service: 'CommandHandler',
        error,
      });
    }
  }
}
