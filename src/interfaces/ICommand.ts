import { Message, CommandInteraction } from 'discord.js';

export interface Subcommand {
  name: string;
  description: string;
  usage?: string;
}

export interface ICommand {
  name: string;
  description: string;
  aliases?: string[];
  requiredPermissions?: string[];
  requiresAuth?: boolean;
  usage?: string;
  examples?: string[];
  subcommands?: Subcommand[];

  /**
   * Execute the command
   * @param args Message arguments or interaction
   * @returns Promise<void>
   */
  execute(args: Message | CommandInteraction, ...params: unknown[]): Promise<void>;
}
