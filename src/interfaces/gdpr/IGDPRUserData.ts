/**
 * User Data - Global, completely segregated from guild data
 * This represents only data directly belonging to the user
 */

export interface IGDPRUserData {
  user_id: string; // Primary key - Discord user ID
  username: string;
  discriminator: string;
  email?: string; // Only if user consents
  avatar_url?: string;
  locale?: string;
  bio?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date; // Soft delete for GDPR "right to be forgotten"
}

/**
 * User data creation input
 */
export interface IGDPRUserDataInput {
  user_id: string;
  username: string;
  discriminator: string;
  email?: string;
  avatar_url?: string;
  locale?: string;
  bio?: string;
}

/**
 * User data update input - only user can update their own data
 */
export interface IGDPRUserDataUpdateInput {
  username?: string;
  email?: string;
  avatar_url?: string;
  locale?: string;
  bio?: string;
}

/**
 * Guild-scoped member data - completely separate from user data
 * This data is owned by the guild, linked to user by reference only
 */
export interface IGDPRGuildMemberData {
  id: string; // uuid or composite key
  guild_id: string; // Guild ownership
  user_id: string; // Reference only - NOT embedded
  joined_at: Date;
  roles: string[]; // Role IDs only
  nick?: string; // Guild-specific nickname
  mute: boolean;
  deaf: boolean;
  pending: boolean;
  timed_out_until?: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date; // Soft delete when member leaves
}

/**
 * Guild member data creation input
 */
export interface IGDPRGuildMemberDataInput {
  guild_id: string;
  user_id: string;
  joined_at: Date;
  roles?: string[];
  nick?: string;
  mute?: boolean;
  deaf?: boolean;
}

/**
 * Guild member data update input - only guild can modify
 */
export interface IGDPRGuildMemberDataUpdateInput {
  roles?: string[];
  nick?: string;
  mute?: boolean;
  deaf?: boolean;
  timed_out_until?: Date;
}
