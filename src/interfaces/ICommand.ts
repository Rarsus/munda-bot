import { Message, ChatInputCommandInteraction } from 'discord.js';

export interface ICommand {
  name: string;
  description: string;
  aliases?: string[];
  requiredPermissions?: string[];
  requiresAuth?: boolean;
  usage?: string;
  examples?: string[];

  /**
   * Execute the command
   * @param args Message arguments or interaction
   * @returns Promise<void>
   */
  execute(args: Message | ChatInputCommandInteraction, ...params: unknown[]): Promise<void>;
}
