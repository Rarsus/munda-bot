import { Pool } from 'pg';
import { UserRepository } from './UserRepository';
import { GuildRepository, GuildMemberRepository, AuditLogRepository } from './GuildRepository';

/**
 * Database repositories container
 */
export class Database {
  public users: UserRepository;
  public guilds: GuildRepository;
  public guildMembers: GuildMemberRepository;
  public auditLogs: AuditLogRepository;

  constructor(pool: Pool) {
    this.users = new UserRepository(pool);
    this.guilds = new GuildRepository(pool);
    this.guildMembers = new GuildMemberRepository(pool);
    this.auditLogs = new AuditLogRepository(pool);
  }
}

export { UserRepository, GuildRepository, GuildMemberRepository, AuditLogRepository };
