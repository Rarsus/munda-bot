import { EmbedBuilder } from '@discordjs/builders';
import { Message, CommandInteraction } from 'discord.js';
import { Command } from '../base';
import { GDPRService } from '../../services/gdpr';
import { logger } from '../../services/logger';

/**
 * GDPR Request Status Command
 * Allows users to check the status of their deletion requests
 */
export class GDPRStatusCommand extends Command {
  private gdprService: GDPRService;

  constructor(gdprService: GDPRService) {
    super();
    this.gdprService = gdprService;
  }

  name = 'gdprstatus';
  description = 'Check the status of your GDPR deletion request';
  aliases = ['deletestatus', 'erasurestatus', 'gdpr-status'];
  usage = 'gdprstatus <request-id>';
  examples = ['gdprstatus erasure_694535322012483644_1709024400000'];
  requiredPermissions: string[] = [];

  async execute(context: Message | CommandInteraction): Promise<void> {
    const userId = context instanceof Message ? context.author.id : context.user.id;

    try {
      // Extract request ID from command
      let requestId: string | undefined;
      if (context instanceof Message) {
        const args = context.content.split(/\s+/).slice(1);
        requestId = args[0];
      } else {
        requestId = (context.options as any).getString?.('request-id') || 
                   context.options?.data?.[0]?.value as string;
      }

      if (!requestId) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0x)
          .setTitle('❌ Missing Request ID')
          .setDescription('Please provide your deletion request ID')
          .addField('Usage', '`/gdprstatus <request-id>`', false)
          .addField('Example', '`/gdprstatus erasure_694535322012483644_1709024400000`', false)
          .setFooter('You can find your request ID in the confirmation message');

        if (context instanceof Message) {
          await context.reply({ embeds: [errorEmbed] });
        } else {
          await context.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        return;
      }

      // Get request status
      const status = await this.gdprService.getErasureRequestStatus(requestId);

      if (!status) {
        const notFoundEmbed = new EmbedBuilder()
          .setColor(0x)
          .setTitle('⚠️ Request Not Found')
          .setDescription(`No deletion request found with ID: ${requestId}`)
          .addField('What to do', 'Double-check the request ID and try again', false)
          .setFooter('Request IDs start with "erasure_"');

        if (context instanceof Message) {
          await context.reply({ embeds: [notFoundEmbed] });
        } else {
          await context.reply({ embeds: [notFoundEmbed], ephemeral: true });
        }

        // Log the attempt
        await this.gdprService.logAuditEvent({
          event_type: 'STATUS_CHECK_FAILED',
          subject_user_id: userId,
          resource_type: 'erasure_request',
          resource_id: requestId,
          action: 'User attempted to check status of non-existent request',
        });

        return;
      }

      // Verify ownership
      if (status.user_id !== userId) {
        const unauthorizedEmbed = new EmbedBuilder()
          .setColor(0x)
          .setTitle('❌ Unauthorized')
          .setDescription('You can only view your own deletion requests')
          .setFooter('If you need help, contact support');

        if (context instanceof Message) {
          await context.reply({ embeds: [unauthorizedEmbed] });
        } else {
          await context.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
        }

        logger.warn(`User ${userId} attempted to access erasure request ${requestId} belonging to ${status.user_id}`);
        return;
      }

      // Build status embed
      const statusColor = this.getStatusColor(status.status);
      const statusEmoji = this.getStatusEmoji(status.status);
      const timelineText = this.buildTimeline(status);

      const statusEmbed = new EmbedBuilder()
        .setColor(statusColor as any)
        .setTitle(`${statusEmoji} Deletion Request Status`)
        .addField('Request ID', status.request_id, false)
        .addField('Status', `\`${status.status.toUpperCase()}\``, true)
        .addField('Submitted', new Date(status.requested_at).toISOString(), true);

      if (status.approved_at) {
        statusEmbed.addField('Approved', new Date(status.approved_at).toISOString(), true);
      }

      if (status.denied_at) {
        statusEmbed.addField('Denied', new Date(status.denied_at).toISOString(), true);
        if (status.denied_reason) {
          statusEmbed.addField('Denial Reason', status.denied_reason, false);
        }
      }

      if (status.restored_at) {
        statusEmbed.addField('Restored', new Date(status.restored_at).toISOString(), true);
        if (status.restore_reason) {
          statusEmbed.addField('Restoration Reason', status.restore_reason, false);
        }
      }

      if (status.completed_at) {
        statusEmbed.addField('Completed', new Date(status.completed_at).toISOString(), true);
      }

      statusEmbed.addField('Timeline', timelineText, false);

      if (status.expires_at && !status.completed_at && !status.denied_at && !status.restored_at) {
        const daysRemaining = Math.ceil(
          (new Date(status.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        statusEmbed.addField(
          'Expires In',
          daysRemaining > 0 ? `${daysRemaining} days` : 'Expired - scheduled for cleanup',
          false
        );
      }

      statusEmbed.setFooter('All times are in UTC');

      if (context instanceof Message) {
        await context.reply({ embeds: [statusEmbed] });
      } else {
        await context.reply({ embeds: [statusEmbed], ephemeral: true });
      }

      // Log the status check
      await this.gdprService.logAuditEvent({
        event_type: 'STATUS_CHECKED',
        subject_user_id: userId,
        resource_type: 'erasure_request',
        resource_id: requestId,
        action: 'User checked deletion request status',
      });
    } catch (error) {
      logger.error(`Error in GDPRStatusCommand for user ${userId}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('❌ Error Checking Status')
        .setDescription('An error occurred while checking your request status')
        .setFooter('Please try again in a moment');

      if (context instanceof Message) {
        await context.reply({ embeds: [errorEmbed] });
      } else {
        await context.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }

  private getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending':
        return '#ffff00'; // Yellow
      case 'approved':
        return '#0099ff'; // Blue
      case 'denied':
        return '#ff0000'; // Red
      case 'completed':
        return '#00ff00'; // Green
      case 'restored':
        return '#00ccff'; // Cyan
      default:
        return '#cccccc'; // Gray
    }
  }

  private getStatusEmoji(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending':
        return '⏳';
      case 'approved':
        return '✅';
      case 'denied':
        return '❌';
      case 'completed':
        return '🗑️';
      case 'restored':
        return '💾';
      default:
        return '❓';
    }
  }

  private buildTimeline(status: any): string {
    const steps = [];

    steps.push(`1. 📝 Submitted: ${new Date(status.requested_at).toLocaleDateString()}`);

    if (status.approved_at) {
      steps.push(`2. ✅ Approved: ${new Date(status.approved_at).toLocaleDateString()}`);
    } else if (status.denied_at) {
      steps.push(`2. ❌ Denied: ${new Date(status.denied_at).toLocaleDateString()}`);
    } else {
      steps.push(`2. ⏳ Awaiting Review`);
    }

    if (status.approved_at && !status.restored_at && !status.completed_at) {
      const expiryDate = new Date(status.expires_at);
      steps.push(`3. 🗑️ Scheduled for Deletion: ${expiryDate.toLocaleDateString()}`);
    } else if (status.completed_at) {
      steps.push(`3. ✔️ Deleted: ${new Date(status.completed_at).toLocaleDateString()}`);
    } else if (status.restored_at) {
      steps.push(`3. 💾 Restored: ${new Date(status.restored_at).toLocaleDateString()}`);
    }

    return steps.join('\n');
  }
}
