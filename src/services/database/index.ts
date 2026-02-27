import { Pool } from 'pg';
import { UserRepository } from './UserRepository';
import { GuildRepository, GuildMemberRepository, AuditLogRepository } from './GuildRepository';
import {
  GDPRUserDataRepository,
  GDPRGuildMemberDataRepository,
  GDPRConsentRepository,
  GDPRAuditLogRepository,
  GDPRDataAccessRequestRepository,
} from './gdpr';

/**
 * Database repositories container
 */
export class Database {
  public users: UserRepository;
  public guilds: GuildRepository;
  public guildMembers: GuildMemberRepository;
  public auditLogs: AuditLogRepository;

  // GDPR repositories
  public gdpr: {
    userData: GDPRUserDataRepository;
    guildMemberData: GDPRGuildMemberDataRepository;
    consent: GDPRConsentRepository;
    auditLog: GDPRAuditLogRepository;
    dataAccessRequest: GDPRDataAccessRequestRepository;
  };

  constructor(pool: Pool) {
    this.users = new UserRepository(pool);
    this.guilds = new GuildRepository(pool);
    this.guildMembers = new GuildMemberRepository(pool);
    this.auditLogs = new AuditLogRepository(pool);

    // Initialize GDPR repositories
    this.gdpr = {
      userData: new GDPRUserDataRepository(pool),
      guildMemberData: new GDPRGuildMemberDataRepository(pool),
      consent: new GDPRConsentRepository(pool),
      auditLog: new GDPRAuditLogRepository(pool),
      dataAccessRequest: new GDPRDataAccessRequestRepository(pool),
    };
  }
}

export { UserRepository, GuildRepository, GuildMemberRepository, AuditLogRepository };
export {
  GDPRUserDataRepository,
  GDPRGuildMemberDataRepository,
  GDPRConsentRepository,
  GDPRAuditLogRepository,
  GDPRDataAccessRequestRepository,
};
