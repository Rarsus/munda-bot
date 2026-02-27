import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';
import {
  IGuild,
  IGuildMember,
  IAuditLog,
  ICreateGuildInput,
  IUpdateGuildInput,
  ICreateGuildMemberInput,
  ICreateAuditLogInput,
} from '../../interfaces/IGuild';

export class GuildRepository extends BaseRepository<IGuild> {
  constructor(pool: Pool) {
    super(pool, 'guilds');
  }

  /**
   * Find guild by Discord guild ID
   */
  async findByDiscordGuildId(discordGuildId: string): Promise<IGuild | null> {
    const result = await this.query<IGuild>('SELECT * FROM guilds WHERE discord_guild_id = $1', [
      discordGuildId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Create a new guild
   */
  async createGuild(input: ICreateGuildInput): Promise<IGuild> {
    return this.create({
      discord_guild_id: input.discord_guild_id,
      name: input.name,
      icon_url: input.icon_url,
      owner_id: input.owner_id,
      created_at: new Date(),
      updated_at: new Date(),
    } as Partial<IGuild>);
  }

  /**
   * Update guild
   */
  async updateGuild(id: string, input: IUpdateGuildInput): Promise<IGuild | null> {
    const updateData = {
      ...input,
      updated_at: new Date(),
    } as Partial<IGuild>;

    return this.update(id, updateData);
  }

  /**
   * Get or create guild
   */
  async getOrCreate(input: ICreateGuildInput): Promise<IGuild> {
    const existingGuild = await this.findByDiscordGuildId(input.discord_guild_id);
    if (existingGuild) {
      return existingGuild;
    }

    return this.createGuild(input);
  }
}

export class GuildMemberRepository extends BaseRepository<IGuildMember> {
  constructor(pool: Pool) {
    super(pool, 'guild_members');
  }

  /**
   * Find member in guild
   */
  async findMember(guildId: string, userId: string): Promise<IGuildMember | null> {
    const result = await this.query<IGuildMember>(
      'SELECT * FROM guild_members WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all members in guild
   */
  async getMembersInGuild(guildId: string): Promise<IGuildMember[]> {
    const result = await this.query<IGuildMember>(
      'SELECT * FROM guild_members WHERE guild_id = $1 ORDER BY joined_at DESC',
      [guildId]
    );

    return result.rows;
  }

  /**
   * Add member to guild
   */
  async addMember(input: ICreateGuildMemberInput): Promise<IGuildMember> {
    return this.create({
      guild_id: input.guild_id,
      user_id: input.user_id,
      joined_at: new Date(),
    } as Partial<IGuildMember>);
  }

  /**
   * Get or create member
   */
  async getOrCreateMember(input: ICreateGuildMemberInput): Promise<IGuildMember> {
    const existingMember = await this.findMember(input.guild_id, input.user_id);
    if (existingMember) {
      return existingMember;
    }

    return this.addMember(input);
  }
}

export class AuditLogRepository extends BaseRepository<IAuditLog> {
  constructor(pool: Pool) {
    super(pool, 'audit_logs');
  }

  /**
   * Log an action
   */
  async logAction(input: ICreateAuditLogInput): Promise<IAuditLog> {
    return this.create({
      guild_id: input.guild_id,
      user_id: input.user_id,
      action: input.action,
      details: input.details,
      created_at: new Date(),
    } as Partial<IAuditLog>);
  }

  /**
   * Get logs for guild
   */
  async getGuildLogs(guildId: string, limit: number = 50): Promise<IAuditLog[]> {
    const result = await this.query<IAuditLog>(
      `SELECT * FROM audit_logs 
       WHERE guild_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [guildId, limit]
    );

    return result.rows;
  }

  /**
   * Get logs for user
   */
  async getUserLogs(userId: string, limit: number = 50): Promise<IAuditLog[]> {
    const result = await this.query<IAuditLog>(
      `SELECT * FROM audit_logs 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }
}
