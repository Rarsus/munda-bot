export interface IGuild {
  id: string;
  discord_guild_id: string;
  name: string;
  icon_url?: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ICreateGuildInput {
  discord_guild_id: string;
  name: string;
  icon_url?: string;
  owner_id: string;
}

export interface IUpdateGuildInput {
  name?: string;
  icon_url?: string;
  owner_id?: string;
}

export interface IGuildMember {
  id: string;
  guild_id: string;
  user_id: string;
  joined_at: Date;
  roles?: string[];
}

export interface ICreateGuildMemberInput {
  guild_id: string;
  user_id: string;
}

export interface IAuditLog {
  id: string;
  guild_id: string;
  user_id?: string;
  action: string;
  details: Record<string, unknown>;
  created_at: Date;
}

export interface ICreateAuditLogInput {
  guild_id: string;
  user_id?: string;
  action: string;
  details: Record<string, unknown>;
}
