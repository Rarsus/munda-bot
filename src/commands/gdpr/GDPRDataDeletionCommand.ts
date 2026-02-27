import { EmbedBuilder } from '@discordjs/builders';
import { Message, CommandInteraction } from 'discord.js';
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

  async execute(context: Message | CommandInteraction): Promise<void> {
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
        .setColor(0x)
        .setTitle('⚠️ Data Deletion Request Initiated')
        .setDescription('Your request to delete all personal data has been submitted.')
        .addField('Request ID', erasureRequest.id, false)
        .addField('Status', 'PENDING', true)
        .addField('Submitted At', new Date().toISOString(), true)
        .addField(
          'What will be deleted',
          '- Personal profile data\n- Guild membership records\n- Consent history\n- Bot interaction history'
        )
        .addField('What is retained', '- Audit logs (required by law)', false)
        .addField(
          'Important',
          'This action is permanent and cannot be undone. You have 30 days to cancel this request before processing begins.',
          false
        )
        .setFooter(
          'Keep this Request ID for your records. You will need it to track your deletion.'
        );

      if (context instanceof Message) {
        await context.reply({ embeds: [confirmEmbed] });
      } else {
        await context.reply({ embeds: [confirmEmbed], ephemeral: true });
      }

      // Send follow-up with next steps
      const nextStepsEmbed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('📋 Next Steps')
        .setDescription("Your deletion request has been queued. Here's what happens next:")
        .addField('1. Review', 'Our team will review your request (usually within 24 hours)', false)
        .addField('2. Confirmation', 'We will send you a confirmation message via DM', false)
        .addField('3. Execution', 'Your data will be permanently deleted within 30 days', false)
        .addField(
          '4. Report',
          'You will receive a deletion completion certificate for your records',
          false
        )
        .setFooter('Questions? Contact our privacy team with your Request ID');

      if (context instanceof Message) {
        await context.channel.send({ embeds: [nextStepsEmbed] });
      } else {
        await (context as CommandInteraction).followUp({
          embeds: [nextStepsEmbed],
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error(`Error in GDPRDataDeletionCommand for user ${userId}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('❌ Error Submitting Deletion Request')
        .setDescription(error instanceof Error ? error.message : 'An unexpected error occurred')
        .addField(
          'Troubleshooting',
          'Please ensure:\n- You are sending this command as a direct message or in a guild where the bot is active\n- You have the latest version of Discord\n- Try again in a few moments'
        )
        .setFooter('Error Code: ' + Date.now());

      if (context instanceof Message) {
        await context.reply({ embeds: [errorEmbed] });
      } else {
        await context.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
}
