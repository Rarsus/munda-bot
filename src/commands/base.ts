import { Message, ChatInputCommandInteraction } from 'discord.js';
import { ICommand } from '../interfaces/ICommand';
import { handleError } from '../middleware/errorHandler';

/**
 * Abstract base class for commands
 * Provides common functionality and error handling
 */
export abstract class Command implements ICommand {
  abstract name: string;
  abstract description: string;

  aliases?: string[];
  requiredPermissions?: string[];
  requiresAuth?: boolean;
  usage?: string;
  examples?: string[];

  /**
   * Execute the command - implement in subclass
   */
  abstract execute(args: Message | ChatInputCommandInteraction, ...params: unknown[]): Promise<void>;

  /**
   * Safe execute wrapper with error handling
   */
  async safeExecute(args: Message | ChatInputCommandInteraction, ...params: unknown[]): Promise<void> {
    try {
      await this.execute(args, ...params);
    } catch (error) {
      await handleError(error, args);
    }
  }

  /**
   * Get command info
   */
  getInfo(): Omit<ICommand, 'execute'> {
    return {
      name: this.name,
      description: this.description,
      aliases: this.aliases,
      requiredPermissions: this.requiredPermissions,
      requiresAuth: this.requiresAuth,
      usage: this.usage,
      examples: this.examples,
    };
  }
}
