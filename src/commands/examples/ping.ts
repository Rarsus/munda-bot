import { Message, CommandInteraction, MessageEmbed } from 'discord.js';
import { Command } from '../base';

/**
 * Ping command - check bot latency
 */
export class PingCommand extends Command {
  name = 'ping';
  description = 'Check the bot latency and Discord API latency';
  aliases = ['latency', 'pong'];
  usage = 'ping';
  examples = ['ping'];

  async execute(context: Message | CommandInteraction): Promise<void> {
    if (context instanceof Message) {
      const sent = await context.reply({ content: 'Pinging...' });
      const latency = sent.createdTimestamp - context.createdTimestamp;
      const apiLatency = context.client.ws.ping;

      const embed = new MessageEmbed()
        .setTitle('🏓 Pong!')
        .setColor('#00ff00')
        .addField('Message Latency', `${latency}ms`, true)
        .addField('API Latency', `${apiLatency}ms`, true)
        .setTimestamp();

      await sent.edit({ content: '', embeds: [embed] });
    } else {
      const latency = context.client.ws.ping;

      const embed = new MessageEmbed()
        .setTitle('🏓 Pong!')
        .setColor('#00ff00')
        .addField('API Latency', `${latency}ms`, true)
        .setTimestamp();

      await context.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
