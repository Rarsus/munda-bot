import { Client, Collection, PermissionFlagsBits } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { logger } from '../services/logger';
import { ICommand } from '../interfaces/ICommand';

/**
 * Manages slash command registration with Discord API
 * For Discord.js v13, uses client.application.commands.set()
 */
export class SlashCommandManager {
  private client: Client;
  private commands: Collection<string, ICommand>;

  constructor(client: Client, commands: Collection<string, ICommand>) {
    this.client = client;
    this.commands = commands;
  }

  /**
   * Sync slash commands with Discord
   * Should be called when bot is ready
   */
  async syncSlashCommands(): Promise<void> {
    if (!this.client.user || !this.client.application) {
      logger.warn('Client not ready for slash command sync', {
        service: 'SlashCommandManager',
      });
      return;
    }

    try {
      const slashCommandData = this.buildSlashCommands();

      if (slashCommandData.length === 0) {
        logger.info('No slash commands to register', {
          service: 'SlashCommandManager',
        });
        return;
      }

      const commandNames = slashCommandData
        .map((cmd: unknown) => {
          const cmdObj = cmd as { name?: string };
          return cmdObj.name || 'unknown';
        });

      logger.info('Syncing slash commands with Discord...', {
        service: 'SlashCommandManager',
        count: slashCommandData.length,
        commands: commandNames,
      });

      // Register global slash commands using discord.js v13 API
      const registeredCommands = await this.client.application.commands.set(
        slashCommandData as Parameters<typeof this.client.application.commands.set>[0]
      );

      logger.info('Slash commands synced successfully', {
        service: 'SlashCommandManager',
        registered: registeredCommands.map((cmd) => cmd.name),
      });
    } catch (error) {
      logger.error('Failed to sync slash commands', {
        service: 'SlashCommandManager',
        error,
      });

      // Don't throw - allow bot to continue even if slash command sync fails
      // (they can be synced manually later)
    }
  }

  /**
   * Build slash command definitions from registered commands
   */
  private buildSlashCommands(): object[] {
    const slashCommands: object[] = [];

    for (const [, command] of this.commands) {
      try {
        // Skip commands with subcommands for now - manual configuration TBD
        if (command.subcommands && command.subcommands.length > 0) {
          logger.debug(`Skipping slash command for ${command.name} (has subcommands - WIP)`, {
            service: 'SlashCommandManager',
            subcommandCount: command.subcommands.length,
          });
          continue;
        }

        // Create slash command builder
        const builder = new SlashCommandBuilder()
          .setName(command.name)
          .setDescription(command.description || 'No description provided');

        // Set default member permissions if required
        if (command.requiredPermissions && command.requiredPermissions.length > 0) {
          const builderAny = builder as unknown as {
            setDefaultMemberPermissions?: (perms: number) => unknown;
          };

          if (builderAny.setDefaultMemberPermissions) {
            let permissions = 0;

            // Map permission names to Discord permission bits
            for (const perm of command.requiredPermissions) {
              const permValue = (PermissionFlagsBits as any)[perm];
              if (permValue) {
                permissions |= permValue;
              }
            }

            if (permissions > 0) {
              builderAny.setDefaultMemberPermissions(permissions);
            }

            logger.debug(`Set permissions for ${command.name}: ${permissions}`, {
              service: 'SlashCommandManager',
            });
          }
        }

        // Add optional string option for simple commands with arguments
        if (command.usage && command.usage.includes('[')) {
          const match = command.usage.match(/\[([^\]]+)\]/);
          if (match) {
            const optionName = match[1];

            if (optionName.length <= 32 && /^[a-z0-9_-]+$/i.test(optionName)) {
              const builderAny = builder as unknown as {
                addStringOption: (fn: unknown) => unknown;
              };

              builderAny.addStringOption((option: unknown) => {
                const optAny = option as unknown as {
                  setName: (n: string) => unknown;
                  setDescription: (d: string) => unknown;
                  setRequired?: (r: boolean) => unknown;
                };
                optAny.setName(optionName.toLowerCase());
                optAny.setDescription(`${optionName} (optional)`);
                if (optAny.setRequired) {
                  optAny.setRequired(false);
                }
                return option;
              });
            }
          }
        }

        slashCommands.push(builder.toJSON());
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to build slash command for ${command.name}: ${errorMessage}`, {
          service: 'SlashCommandManager',
          commandName: command.name,
          error: errorMessage,
        });
      }
    }

    return slashCommands;
  }
}
