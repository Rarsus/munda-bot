import { EmbedBuilder } from '@discordjs/builders';
import { Message, CommandInteraction } from 'discord.js';
import { Command } from '../base';
import { GDPRService } from '../../services/gdpr';
import { logger } from '../../services/logger';
import { AuditEventType } from '../../interfaces/gdpr';

/**
 * GDPR Admin Management Command
 * Allows admins to approve, deny, execute, and restore deletion requests
 */
export class GDPRAdminCommand extends Command {
  private gdprService: GDPRService;

  constructor(gdprService: GDPRService) {
    super();
    this.gdprService = gdprService;
  }

  name = 'gdpr-admin';
  description = 'Manage GDPR deletion requests (Admin only)';
  aliases = ['gdpradmin'];
  usage = 'gdpr-admin list|approve|deny|execute|restore [request-id]';
  examples = [
    'gdpr-admin list',
    'gdpr-admin approve erasure_694535322012483644_1709024400000',
    'gdpr-admin deny erasure_694535322012483644_1709024400000 User requested cancellation',
    'gdpr-admin execute erasure_694535322012483644_1709024400000',
    'gdpr-admin restore erasure_694535322012483644_1709024400000 User changed mind',
  ];
  requiredPermissions: string[] = ['ADMINISTRATOR'];

  async execute(context: Message | CommandInteraction): Promise<void> {
    const userId = context instanceof Message ? context.author.id : context.user.id;

    // Check admin permission
    const isAdmin = context instanceof Message
      ? context.member?.permissions.has('ADMINISTRATOR')
      : context.memberPermissions?.has('ADMINISTRATOR');

    if (!isAdmin) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('❌ Permission Denied')
        .setDescription('Only administrators can use this command')
        .setFooter('Required permission: ADMINISTRATOR');

      if (context instanceof Message) {
        await context.reply({ embeds: [errorEmbed] });
      } else {
        await context.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      logger.warn(`Non-admin user ${userId} attempted to use GDPR admin command`);
      return;
    }

    try {
      // Parse command arguments
      let subcommand: string | undefined;
      let requestId: string | undefined;
      let reason: string | undefined;

      if (context instanceof Message) {
        const args = context.content.split(/\s+/).slice(1);
        subcommand = args[0]?.toLowerCase();
        requestId = args[1];
        reason = args.slice(2).join(' ') || undefined;
      } else {
        const options = context.options as any;
        subcommand = options.getSubcommand?.() || options.data?.[0]?.name;
        requestId = options.getString?.('request-id') || options.data?.[1]?.value;
        reason = options.getString?.('reason') || options.data?.[2]?.value;
      }

      switch (subcommand) {
        case 'list':
          await this.handleList(context, userId);
          break;
        case 'approve':
          await this.handleApprove(context, userId, requestId);
          break;
        case 'deny':
          await this.handleDeny(context, userId, requestId, reason);
          break;
        case 'execute':
          await this.handleExecute(context, userId, requestId);
          break;
        case 'restore':
          await this.handleRestore(context, userId, requestId, reason);
          break;
        default:
          const helpEmbed = new EmbedBuilder()
            .setColor(0x)
            .setTitle('📖 GDPR Admin Commands')
            .addField('list', 'Show all pending deletion requests', false)
            .addField('approve <request-id>', 'Approve a deletion request', false)
            .addField('deny <request-id> [reason]', 'Deny a deletion request', false)
            .addField('execute <request-id>', 'Immediately execute deletion', false)
            .addField('restore <request-id> [reason]', 'Restore deleted data', false);

          if (context instanceof Message) {
            await context.reply({ embeds: [helpEmbed] });
          } else {
            await context.reply({ embeds: [helpEmbed], ephemeral: true });
          }
      }
    } catch (error) {
      logger.error(`Error in GDPRAdminCommand for admin ${userId}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('❌ Error')
        .setDescription('An error occurred processing your request')
        .setFooter('Check logs for details');

      if (context instanceof Message) {
        await context.reply({ embeds: [errorEmbed] });
      } else {
        await context.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }

  private async handleList(context: Message | CommandInteraction, adminId: string): Promise<void> {
    const requests = await this.gdprService.getPendingErasureRequests();

    if (requests.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('✅ No Pending Requests')
        .setDescription('All deletion requests have been processed')
        .setFooter('Last updated: ' + new Date().toISOString());

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }

      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x)
      .setTitle(`⏳ Pending Deletion Requests (${requests.length})`)
      .setDescription('Use `/gdpr-admin approve|deny|execute|restore <request-id>` to manage');

    for (const req of requests.slice(0, 10)) {
      const daysOld = Math.floor((Date.now() - new Date(req.requested_at).getTime()) / (1000 * 60 * 60 * 24));
      embed.addField(
        `${req.id}`,
        `User: ${req.user_id}\nSubmitted: ${daysOld}d ago\nStatus: ${req.status}`,
        false
      );
    }

    if (requests.length > 10) {
      embed.addField('⚠️ Note', `Showing 10 of ${requests.length} requests`, false);
    }

    embed.setFooter('Last updated: ' + new Date().toISOString());

    if (context instanceof Message) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed], ephemeral: true });
    }

    await this.gdprService.logAuditEvent({
      event_type: 'ADMIN_LIST_REQUESTS',
      subject_user_id: adminId,
      resource_type: 'erasure_request',
      resource_id: 'all',
      action: 'Admin viewed pending deletion requests',
    });
  }

  private async handleApprove(
    context: Message | CommandInteraction,
    adminId: string,
    requestId?: string
  ): Promise<void> {
    if (!requestId) {
      const embed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('❌ Missing Request ID')
        .setDescription('Usage: `/gdpr-admin approve <request-id>`');

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }
      return;
    }

    const result = await this.gdprService.approveErasureRequest(requestId, adminId);

    const embed = new EmbedBuilder()
      .setColor(0x)
      .setTitle('✅ Deletion Request Approved')
      .addField('Request ID', result.id, false)
      .addField('User', result.user_id, false)
      .addField('Expires At', new Date(result.expires_at).toISOString(), false)
      .addField('Action', 'Data will be automatically deleted in 30 days', false)
      .setFooter('Approval logged in audit trail');

    if (context instanceof Message) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed], ephemeral: true });
    }

    await this.gdprService.logAuditEvent({
      event_type: 'ERASURE_APPROVED',
      subject_user_id: result.user_id,
      requesting_user_id: adminId,
      resource_type: 'erasure_request',
      resource_id: requestId,
      action: `Admin ${adminId} approved deletion request`,
    });
  }

  private async handleDeny(
    context: Message | CommandInteraction,
    adminId: string,
    requestId?: string,
    reason?: string
  ): Promise<void> {
    if (!requestId) {
      const embed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('❌ Missing Request ID')
        .setDescription('Usage: `/gdpr-admin deny <request-id> [reason]`');

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }
      return;
    }

    const result = await this.gdprService.denyErasureRequest(requestId, adminId, reason);

    const embed = new EmbedBuilder()
      .setColor(0x)
      .setTitle('❌ Deletion Request Denied')
      .addField('Request ID', result.id, false)
      .addField('User', result.user_id, false);

    if (result.denied_reason) {
      embed.addField('Reason', result.denied_reason, false);
    }

    embed.setFooter('Denial logged in audit trail');

    if (context instanceof Message) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed], ephemeral: true });
    }

    await this.gdprService.logAuditEvent({
      event_type: 'ERASURE_DENIED',
      subject_user_id: result.user_id,
      requesting_user_id: adminId,
      resource_type: 'erasure_request',
      resource_id: requestId,
      action: `Admin ${adminId} denied deletion request: ${reason || 'No reason provided'}`,
    });
  }

  private async handleExecute(
    context: Message | CommandInteraction,
    adminId: string,
    requestId?: string
  ): Promise<void> {
    if (!requestId) {
      const embed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('❌ Missing Request ID')
        .setDescription('Usage: `/gdpr-admin execute <request-id>`');

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }
      return;
    }

    const result = await this.gdprService.executeErasure(requestId, adminId);

    const embed = new EmbedBuilder()
      .setColor(0x)
      .setTitle('🗑️ Data Deletion Executed')
      .addField('Request ID', result.request_id, false)
      .addField('User', result.user_id, false)
      .addField('Deleted At', new Date().toISOString(), false)
      .addField('Status', 'COMPLETED', false)
      .setFooter('Deletion logged in audit trail');

    if (context instanceof Message) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed], ephemeral: true });
    }

    await this.gdprService.logAuditEvent({
      event_type: AuditEventType.ERASURE_COMPLETED,
      subject_user_id: result.user_id,
      requesting_user_id: adminId,
      resource_type: 'erasure_request',
      resource_id: requestId,
      action: `Admin ${adminId} manually executed data deletion`,
    });
  }

  private async handleRestore(
    context: Message | CommandInteraction,
    adminId: string,
    requestId?: string,
    reason?: string
  ): Promise<void> {
    if (!requestId) {
      const embed = new EmbedBuilder()
        .setColor(0x)
        .setTitle('❌ Missing Request ID')
        .setDescription('Usage: `/gdpr-admin restore <request-id> [reason]`');

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }
      return;
    }

    const result = await this.gdprService.restoreErasureRequest(requestId, adminId, reason);

    const embed = new EmbedBuilder()
      .setColor(0x)
      .setTitle('💾 Deletion Request Restored')
      .addField('Request ID', result.id, false)
      .addField('User', result.user_id, false)
      .addField('Status', 'RESTORED', false);

    if (result.restore_reason) {
      embed.addField('Reason', result.restore_reason, false);
    }

    embed.setFooter('Restoration logged in audit trail');

    if (context instanceof Message) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed], ephemeral: true });
    }

    await this.gdprService.logAuditEvent({
      event_type: 'ERASURE_RESTORED',
      subject_user_id: result.user_id,
      requesting_user_id: adminId,
      resource_type: 'erasure_request',
      resource_id: requestId,
      action: `Admin ${adminId} restored deletion request: ${reason || 'No reason provided'}`,
    });
  }
}
