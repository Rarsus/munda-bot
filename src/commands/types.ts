import { Message, EmbedBuilder } from 'discord.js';
import { Command } from './base';

/**
 * Parse command arguments from message
 */
export function parseCommandArgs(
  message: Message,
  prefix: string = '!'
): {
  command: string;
  args: string[];
} {
  const content = message.content.slice(prefix.length).trim();
  const [command, ...args] = content.split(/\s+/);

  return { command: command.toLowerCase(), args };
}

/**
 * Create a help embed for a command
 */
export function createCommandHelpEmbed(command: Command): EmbedBuilder {
  const info = command.getInfo();

  const embed = new EmbedBuilder()
    .setTitle(`📚 Help: ${info.name}`)
    .setDescription(info.description)
    .setColor(0x0099ff);

  if (info.usage) {
    embed.addFields([{ name: 'Usage', value: `!\`${info.usage}\`` }]);
  }

  if (info.aliases && info.aliases.length > 0) {
    embed.addFields([{ name: 'Aliases', value: info.aliases.map((a) => `\`${a}\``).join(', ') }]);
  }

  if (info.examples && info.examples.length > 0) {
    embed.addFields([
      { name: 'Examples', value: info.examples.map((e) => `\`!${e}\``).join('\n') },
    ]);
  }

  if (info.requiredPermissions && info.requiredPermissions.length > 0) {
    embed.addFields([{ name: 'Required Permissions', value: info.requiredPermissions.join(', ') }]);
  }

  return embed;
}
