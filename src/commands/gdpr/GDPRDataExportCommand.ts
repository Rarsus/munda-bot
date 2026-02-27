import { EmbedBuilder } from '@discordjs/builders';
import { Message, CommandInteraction } from 'discord.js';
import { Command } from '../base';
import { GDPRService } from '../../services/gdpr';
import { verifyDataOwnership } from '../../middleware/gdpr';
import { logger } from '../../services/logger';

/**
 * GDPR Data Export/Portability Command
 * Allows users to export their data in portable format
 * Right to Data Portability (GDPR Article 20)
 */
export class GDPRDataExportCommand extends Command {
  private gdprService: GDPRService;

  constructor(gdprService: GDPRService) {
    super();
    this.gdprService = gdprService;
  }

  name = 'gdprexport';
  description = 'Export your data in portable format (GDPR Right to Data Portability)';
  aliases = ['exportdata', 'dataportability'];
  usage = 'gdprexport [format]';
  examples = ['gdprexport json', 'gdprexport csv'];
  requiredPermissions: string[] = [];

  async execute(context: Message | CommandInteraction): Promise<void> {
    const userId = context instanceof Message ? context.author.id : context.user.id;

    try {
      // Verify data ownership
      const hasAccess = await verifyDataOwnership(userId, userId);
      if (!hasAccess) {
        throw new Error('You can only export your own data');
      }

      // Get portable data package
      const dataPackage = await this.gdprService.getDataPortabilityPackage(userId);

      // Create a JSON string of the data
      const jsonData = JSON.stringify(dataPackage, null, 2);

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('✅ Data Export Created')
        .setDescription('Your complete data package has been generated and is ready for download.')
        .addField(
          'Contents',
          `- Personal Profile\n- Guild Memberships (${dataPackage.guild_memberships.length})\n- Consent Records (${dataPackage.consents.length})\n- Access Audit Trail (${dataPackage.audit_summary.total_accesses} entries)`,
          false
        )
        .addField('Format', 'JSON (machine-readable, universally compatible)', true)
        .addField('Size', `${(jsonData.length / 1024).toFixed(2)} KB`, true)
        .addField('Generated At', dataPackage.exported_at.toISOString(), false)
        .setFooter('This file contains all your data. Store it securely. Data valid for 30 days.');

      if (context instanceof Message) {
        // For message commands, send the embed and data file
        const buffer = Buffer.from(jsonData, 'utf-8');
        await context.reply({
          embeds: [embed],
          files: [
            {
              attachment: buffer,
              name: `gdpr-data-export-${userId}-${Date.now()}.json`,
            },
          ],
        });
      } else {
        // For interaction commands
        const buffer = Buffer.from(jsonData, 'utf-8');
        await (context as CommandInteraction).reply({
          embeds: [embed],
          files: [
            {
              attachment: buffer,
              name: `gdpr-data-export-${userId}-${Date.now()}.json`,
            },
          ],
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error(`Error in GDPRDataExportCommand for user ${userId}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('❌ Error Exporting Your Data')
        .setDescription(error instanceof Error ? error.message : 'An unexpected error occurred')
        .addField('What to do', 'If this error persists, please contact the bot administrator')
        .setFooter('Request ID: ' + Date.now());

      if (context instanceof Message) {
        await context.reply({ embeds: [errorEmbed] });
      } else {
        await context.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
}
