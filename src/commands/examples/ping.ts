import { Message, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
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

  async execute(context: Message | ChatInputCommandInteraction): Promise<void> {
    if (context instanceof Message) {
      const sent = await context.reply({ content: 'Pinging...' });
      const latency = sent.createdTimestamp - context.createdTimestamp;
      const apiLatency = context.client.ws.ping;

      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0x00ff00)
        .addFields([
          { name: 'Message Latency', value: `${latency}ms`, inline: true },
          { name: 'API Latency', value: `${apiLatency}ms`, inline: true },
        ])
        .setTimestamp();

      await sent.edit({ content: '', embeds: [embed] });
    } else {
      const latency = context.client.ws.ping;

      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0x00ff00)
        .addFields([{ name: 'API Latency', value: `${latency}ms`, inline: true }])
        .setTimestamp();

      await context.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
