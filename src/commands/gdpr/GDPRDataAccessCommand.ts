import { Message, CommandInteraction, MessageEmbed } from 'discord.js';
import { Command } from '../base';
import { GDPRService } from '../../services/gdpr';
import {
  verifyDataOwnership,
  logDataAccess,
} from '../../middleware/gdpr';
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
        const embed = new MessageEmbed()
          .setColor('#ff9900')
          .setTitle('⚠️ No Data Found')
          .setDescription('We don\'t have any data stored for you in our system.')
          .setFooter('Data: ' + new Date().toISOString());

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
      const embed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('📋 Your Personal Data Summary')
        .addField('Discord ID', userData.user_id, false)
        .addField('Username', userData.username, true)
        .addField('Discriminator', userData.discriminator, true)
        .addField('Email', userData.email || 'Not provided', true)
        .addField('Avatar', userData.avatar_url ? 'Stored' : 'Not stored', true)
        .addField('Bio', userData.bio || 'Not provided', false)
        .addField('Account Created', userData.created_at.toISOString(), false)
        .addField('Last Updated', userData.updated_at.toISOString(), false)
        .setFooter(
          'Use /gdprexport to get a full data portability package or /gdpdelete to request deletion'
        )
        .setTimestamp();

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (error) {
      logger.error(`Error in GDPRDataAccessCommand for user ${userId}:`, error);

      const errorEmbed = new MessageEmbed()
        .setColor('#ff0000')
        .setTitle('❌ Error Retrieving Your Data')
        .setDescription(
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
        )
        .setFooter('If this persists, please contact support');

      if (context instanceof Message) {
        await context.reply({ embeds: [errorEmbed] });
      } else {
        await context.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
}
