import { Message, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../base';
import { GDPRService } from '../../services/gdpr';
import { verifyDataOwnership } from '../../middleware/gdpr';
import { logger } from '../../services/logger';

/**
 * GDPR Data Deletion/Erasure Command
 * Allows users to request deletion of their data
 * Right to be Forgotten (GDPR Article 17)
 */
export class GDPRDataDeletionCommand extends Command {
  private gdprService: GDPRService;

  constructor(gdprService: GDPRService) {
    super();
    this.gdprService = gdprService;
  }

  name = 'gdprdelete';
  description = 'Request deletion of your personal data (GDPR Right to be Forgotten)';
  aliases = ['deletedata', 'erasure'];
  usage = 'gdprdelete [reason]';
  examples = ['gdprdelete', 'gdprdelete I no longer want my data stored'];
  requiredPermissions: string[] = [];

  async execute(context: Message | ChatInputCommandInteraction): Promise<void> {
    const userId = context instanceof Message ? context.author.id : context.user.id;

    try {
      // Verify data ownership
      const hasAccess = await verifyDataOwnership(userId, userId);
      if (!hasAccess) {
        throw new Error('You can only request deletion of your own data');
      }

      // Extract reason from command
      let reason: string | undefined;
      if (context instanceof Message) {
        const args = context.content.split(/\s+/).slice(1);
        reason = args.length > 0 ? args.join(' ') : undefined;
      }

      // Create erasure request
      const erasureRequest = await this.gdprService.requestErasure(userId, reason);

      // Create confirmation embed
      const confirmEmbed = new EmbedBuilder()
        .setColor(0xffcc00)
        .setTitle('⚠️ Data Deletion Request Initiated')
        .setDescription('Your request to delete all personal data has been submitted.')
        .addFields([
          { name: 'Request ID', value: erasureRequest.id, inline: false },
          { name: 'Status', value: 'PENDING', inline: true },
          { name: 'Submitted At', value: new Date().toISOString(), inline: true },
          {
            name: 'What will be deleted',
            value:
              '- Personal profile data\n- Guild membership records\n- Consent history\n- Bot interaction history',
          },
          { name: 'What is retained', value: '- Audit logs (required by law)', inline: false },
          {
            name: 'Important',
            value:
              'This action is permanent and cannot be undone. You have 30 days to cancel this request before processing begins.',
            inline: false,
          },
        ])
        .setFooter({
          text: 'Keep this Request ID for your records. You will need it to track your deletion.',
        });

      if (context instanceof Message) {
        await context.reply({ embeds: [confirmEmbed] });
      } else {
        await context.reply({ embeds: [confirmEmbed], ephemeral: true });
      }

      // Send follow-up with next steps
      const nextStepsEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📋 Next Steps')
        .setDescription("Your deletion request has been queued. Here's what happens next:")
        .addFields([
          {
            name: '1. Review',
            value: 'Our team will review your request (usually within 24 hours)',
            inline: false,
          },
          {
            name: '2. Confirmation',
            value: 'We will send you a confirmation message via DM',
            inline: false,
          },
          {
            name: '3. Execution',
            value: 'Your data will be permanently deleted within 30 days',
            inline: false,
          },
          {
            name: '4. Report',
            value: 'You will receive a deletion completion certificate for your records',
            inline: false,
          },
        ])
        .setFooter({ text: 'Questions? Contact our privacy team with your Request ID' });

      if (context instanceof Message) {
        if (context.channel && context.channel.isSendable()) {
          await context.channel.send({ embeds: [nextStepsEmbed] });
        }
      } else {
        await context.followUp({
          embeds: [nextStepsEmbed],
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error(`Error in GDPRDataDeletionCommand for user ${userId}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error Submitting Deletion Request')
        .setDescription(error instanceof Error ? error.message : 'An unexpected error occurred')
        .addFields([
          {
            name: 'Troubleshooting',
            value:
              'Please ensure:\n- You are sending this command as a direct message or in a guild where the bot is active\n- You have the latest version of Discord\n- Try again in a few moments',
          },
        ])
        .setFooter({ text: 'Error Code: ' + Date.now() });

      if (context instanceof Message) {
        await context.reply({ embeds: [errorEmbed] });
      } else {
        await context.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
}
