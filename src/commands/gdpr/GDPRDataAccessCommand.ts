import { EmbedBuilder } from '@discordjs/builders';
import { Message, CommandInteraction } from 'discord.js';
import { Command } from '../base';
import { GDPRService } from '../../services/gdpr';
import { verifyDataOwnership, logDataAccess } from '../../middleware/gdpr';
import { logger } from '../../services/logger';

/**
 * GDPR Data Access Command
 * Allows users to view their own data stored by the bot
 * Right to Access (GDPR Article 15)
 */
export class GDPRDataAccessCommand extends Command {
  private gdprService: GDPRService;

  constructor(gdprService: GDPRService) {
    super();
    this.gdprService = gdprService;
  }

  name = 'gdprdata';
  description = 'View your personal data stored with the bot (GDPR Right to Access)';
  aliases = ['mydata', 'viewdata'];
  usage = 'gdprdata';
  examples = ['gdprdata'];
  requiredPermissions: string[] = [];

  async execute(context: Message | CommandInteraction): Promise<void> {
    const userId = context instanceof Message ? context.author.id : context.user.id;

    try {
      // Verify data ownership
      const hasAccess = await verifyDataOwnership(userId, userId);
      if (!hasAccess) {
        throw new Error('You can only access your own data');
      }

      // Get user data
      const userData = await this.gdprService.getUserData(userId);

      if (!userData) {
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('⚠️ No Data Found')
          .setDescription("We don't have any data stored for you in our system.")
          .setFooter({ text: 'Data: ' + new Date().toISOString() });

        if (context instanceof Message) {
          await context.reply({ embeds: [embed] });
        } else {
          await context.reply({ embeds: [embed], ephemeral: true });
        }
        return;
      }

      // Log data access
      await logDataAccess(
        this.gdprService,
        userId,
        'user',
        userId,
        'User accessed their own data via gdprdata command'
      );

      // Create data summary embed
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📋 Your Personal Data Summary')
        .addFields(
          { name: 'Discord ID', value: userData.user_id, inline: false },
          { name: 'Username', value: userData.username, inline: true },
          { name: 'Discriminator', value: userData.discriminator, inline: true },
          { name: 'Email', value: userData.email || 'Not provided', inline: true },
          { name: 'Avatar', value: userData.avatar_url ? 'Stored' : 'Not stored', inline: true },
          { name: 'Bio', value: userData.bio || 'Not provided', inline: false },
          { name: 'Account Created', value: userData.created_at.toISOString(), inline: false },
          { name: 'Last Updated', value: userData.updated_at.toISOString(), inline: false }
        )
        .setFooter({
          text: 'Use /gdprexport to get a full data portability package or /gdpdelete to request deletion'
        })
        .setTimestamp();

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (error) {
      logger.error(`Error in GDPRDataAccessCommand for user ${userId}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('❌ Error Retrieving Your Data')
        .setDescription(error instanceof Error ? error.message : 'An unexpected error occurred')
        .setFooter({ text: 'If this persists, please contact support' });

      if (context instanceof Message) {
        await context.reply({ embeds: [errorEmbed] });
      } else {
        await context.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
}
