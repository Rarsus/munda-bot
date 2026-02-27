import { Message, ChatInputCommandInteraction, EmbedBuilder, Collection } from 'discord.js';
import { Command } from '../base';
import { ICommand } from '../../interfaces/ICommand';

/**
 * Help command - list all commands or get help for a specific command
 */
export class HelpCommand extends Command {
  name = 'help';
  description = 'Show help information for commands';
  aliases = ['h', 'commands'];
  usage = 'help [command]';
  examples = ['help', 'help ping'];

  async execute(
    context: Message | ChatInputCommandInteraction,
    commands?: Collection<string, ICommand>
  ): Promise<void> {
    if (!commands || commands.size === 0) {
      throw new Error('Commands collection not provided');
    }

    let commandName: string | undefined;

    if (context instanceof Message) {
      const args = context.content.split(/\s+/).slice(1);
      commandName = args[0] || undefined;
    } else {
      commandName = context.options.getString('command') || undefined;
    }

    if (commandName) {
      const command = commands.get(commandName.toLowerCase());
      if (!command) {
        throw new Error(`Command \`${commandName}\` not found`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`📚 Help: ${command.name}`)
        .setDescription(command.description)
        .setColor(0x0099ff);

      if (command.usage) {
        embed.addFields([{ name: 'Usage', value: `\`!${command.usage}\`` }]);
      }

      if (command.aliases && command.aliases.length > 0) {
        embed.addFields([
          { name: 'Aliases', value: command.aliases.map((a: string) => `\`${a}\``).join(', ') },
        ]);
      }

      if (command.examples && command.examples.length > 0) {
        embed.addFields([
          {
            name: 'Examples',
            value: command.examples.map((e: string) => `\`!${e}\``).join('\n'),
          },
        ]);
      }

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }
    } else {
      // List all commands
      const commandList = commands
        .map((cmd: ICommand) => `\`${cmd.name}\` - ${cmd.description}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setTitle('📚 Available Commands')
        .setDescription(commandList || 'No commands available')
        .setColor(0x0099ff)
        .setFooter({ text: 'Use !help [command] for more info on a specific command' });

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }
}
