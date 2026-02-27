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
  requiredPermissions: string[] = ['Administrator'];
  subcommands = [
    { name: 'list', description: 'Show all pending deletion requests' },
    { name: 'approve', description: 'Approve a deletion request', usage: '[request-id]' },
    { name: 'deny', description: 'Deny a deletion request', usage: '[request-id]' },
    { name: 'execute', description: 'Immediately execute deletion', usage: '[request-id]' },
    { name: 'restore', description: 'Restore deleted data', usage: '[request-id]' },
  ];

  async execute(context: Message | CommandInteraction, _commands?: any, subcommandName?: string, subcommandArg?: string): Promise<void> {
    const userId = context instanceof Message ? context.author.id : context.user.id;

    // Check admin permission
    const isAdmin = context instanceof Message
      ? context.member?.permissions.has('Administrator')
      : context.memberPermissions?.has('Administrator');

    if (!isAdmin) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('❌ Permission Denied')
        .setDescription('Only administrators can use this command')
        .setFooter({ text: 'Required permission: ADMINISTRATOR' });

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
        // Handle slash command with subcommand passed from CommandHandler
        if (subcommandName) {
          subcommand = subcommandName;
          requestId = subcommandArg;
        } else if (context.isChatInputCommand?.()) {
          // Fallback: Try to parse from options
          const options = (context.options as any);
          subcommand = options.getSubcommand?.() || options.data?.[0]?.name;
          requestId = options.getString?.('request-id') || subcommandArg || options.data?.[1]?.value;
          reason = options.getString?.('reason') || options.data?.[2]?.value;
        }
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
            .setColor(0x0099ff)
            .setTitle('📖 GDPR Admin Commands')
            .addFields(
              { name: 'list', value: 'Show all pending deletion requests', inline: false },
              { name: 'approve <request-id>', value: 'Approve a deletion request', inline: false },
              { name: 'deny <request-id> [reason]', value: 'Deny a deletion request', inline: false },
              { name: 'execute <request-id>', value: 'Immediately execute deletion', inline: false },
              { name: 'restore <request-id> [reason]', value: 'Restore deleted data', inline: false }
            );

          if (context instanceof Message) {
            await context.reply({ embeds: [helpEmbed] });
          } else {
            await context.reply({ embeds: [helpEmbed], ephemeral: true });
          }
      }
    } catch (error) {
      logger.error(`Error in GDPRAdminCommand for admin ${userId}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('❌ Error')
        .setDescription('An error occurred processing your request')
        .setFooter({ text: 'Check logs for details' });

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
        .setColor(0x0099ff)
        .setTitle('✅ No Pending Requests')
        .setDescription('All deletion requests have been processed')
        .setFooter({ text: 'Last updated: ' + new Date().toISOString() });

      if (context instanceof Message) {
        await context.reply({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed], ephemeral: true });
      }

      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`⏳ Pending Deletion Requests (${requests.length})`)
      .setDescription('Use `/gdpr-admin approve|deny|execute|restore <request-id>` to manage');

    for (const req of requests.slice(0, 10)) {
      const daysOld = Math.floor((Date.now() - new Date(req.requested_at).getTime()) / (1000 * 60 * 60 * 24));
      embed.addFields({
        name: `${req.id}`,
        value: `User: ${req.user_id}\nSubmitted: ${daysOld}d ago\nStatus: ${req.status}`,
        inline: false
      });
    }

    if (requests.length > 10) {
      embed.addFields({ name: '⚠️ Note', value: `Showing 10 of ${requests.length} requests`, inline: false });
    }

    embed.setFooter({ text: 'Last updated: ' + new Date().toISOString() });

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
        .setColor(0x0099ff)
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
      .setColor(0x0099ff)
      .setTitle('✅ Deletion Request Approved')
      .addFields(
        { name: 'Request ID', value: result.id, inline: false },
        { name: 'User', value: result.user_id, inline: false },
        { name: 'Expires At', value: new Date(result.expires_at).toISOString(), inline: false },
        { name: 'Action', value: 'Data will be automatically deleted in 30 days', inline: false }
      )
      .setFooter({ text: 'Approval logged in audit trail' });

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
        .setColor(0x0099ff)
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
      .setColor(0x0099ff)
      .setTitle('❌ Deletion Request Denied')
      .addFields(
        { name: 'Request ID', value: result.id, inline: false },
        { name: 'User', value: result.user_id, inline: false }
      );

    if (result.denied_reason) {
      embed.addFields({ name: 'Reason', value: result.denied_reason, inline: false });
    }

    embed.setFooter({ text: 'Denial logged in audit trail' });

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
        .setColor(0x0099ff)
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
      .setColor(0x0099ff)
      .setTitle('🗑️ Data Deletion Executed')
      .addFields(
        { name: 'Request ID', value: result.request_id, inline: false },
        { name: 'User', value: result.user_id, inline: false },
        { name: 'Deleted At', value: new Date().toISOString(), inline: false },
        { name: 'Status', value: 'COMPLETED', inline: false }
      )
      .setFooter({ text: 'Deletion logged in audit trail' });

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
        .setColor(0x0099ff)
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
      .setColor(0x0099ff)
      .setTitle('💾 Deletion Request Restored')
      .addFields(
        { name: 'Request ID', value: result.id, inline: false },
        { name: 'User', value: result.user_id, inline: false },
        { name: 'Status', value: 'RESTORED', inline: false }
      );

    if (result.restore_reason) {
      embed.addFields({ name: 'Reason', value: result.restore_reason, inline: false });
    }

    embed.setFooter({ text: 'Restoration logged in audit trail' });

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
