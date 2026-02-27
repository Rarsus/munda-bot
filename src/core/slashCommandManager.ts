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
        // Create slash command builder
        const builder = new SlashCommandBuilder()
          .setName(command.name)
          .setDescription(command.description || 'No description provided');

        // Set default member permissions if required
        // Note: @discordjs/builders@0.16.0 (discord.js v13) doesn't support setDefaultMemberPermissions
        // Permissions are checked at runtime in the command's execute method
        if (command.requiredPermissions && command.requiredPermissions.length > 0) {
          const builderAny = builder as unknown as {
            setDefaultMemberPermissions?: (perms: number) => unknown;
          };

          // Only try to set permissions if the method exists
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

        // Add optional string option if command has arguments
        // Only add if the usage pattern is simple (avoid multi-subcommand patterns)
        if (command.usage && command.usage.includes('[') && !command.usage.includes('|')) {
          const match = command.usage.match(/\[([^\]]+)\]/);
          if (match) {
            const optionName = match[1];
            
            // Validate option name (Discord has length/character restrictions)
            if (optionName.length <= 32 && /^[a-z0-9_-]+$/i.test(optionName)) {
              // Use type casting for the builder
              const builderAny = builder as unknown as {
                addStringOption: (fn: unknown) => unknown;
              };
              
              builderAny.addStringOption((option: unknown) => {
                const optAny = option as unknown as {
                  setName: (n: string) => unknown;
                  setDescription: (d: string) => unknown;
                };
                optAny.setName(optionName);
                optAny.setDescription(`${optionName} (optional)`);
                return option;
              });
            }
          }
        }

        slashCommands.push(builder.toJSON());
      } catch (error) {
        logger.warn(`Failed to build slash command for ${command.name}`, {
          service: 'SlashCommandManager',
          error,
        });
      }
    }

    return slashCommands;
  }
}
