import { Message, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { AuthorizationError } from './errorHandler';

/**
 * Check if user has required permissions
 */
export function checkPermissions(
  context: Message | ChatInputCommandInteraction,
  requiredPermissions: string[]
): boolean {
  if (!context.guild || !context.member) {
    return false;
  }

  const member = context.member;
  if (!member.permissions) {
    return false;
  }

  return requiredPermissions.every((perm) => {
    const permValue = (PermissionFlagsBits as Record<string, bigint>)[perm];
    return permValue && (member.permissions as { has(perm: bigint): boolean }).has(permValue);
  });
}

/**
 * Require specific permissions
 */
export async function requirePermissions(
  context: Message | ChatInputCommandInteraction,
  requiredPermissions: string[]
): Promise<void> {
  if (!checkPermissions(context, requiredPermissions)) {
    throw new AuthorizationError(
      `This command requires the following permissions: ${requiredPermissions.join(', ')}`
    );
  }
}

/**
 * Check if user is owner or admin
 */
export function isAdmin(context: Message | ChatInputCommandInteraction): boolean {
  if (!context.guild || !context.member) {
    return false;
  }

  const member = context.member;
  if (!member.permissions || typeof member.permissions === 'string') {
    return false;
  }

  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Require admin permissions
 */
export async function requireAdmin(
  context: Message | ChatInputCommandInteraction
): Promise<void> {
  if (!isAdmin(context)) {
    throw new AuthorizationError('This command requires administrator permissions');
  }
}

/**
 * Check if user is guild owner
 */
export function isGuildOwner(context: Message | ChatInputCommandInteraction): boolean {
  if (!context.guild) {
    return false;
  }

  const userId = context instanceof Message ? context.author.id : context.user.id;
  return context.guild.ownerId === userId;
}

/**
 * Require guild owner
 */
export async function requireGuildOwner(
  context: Message | ChatInputCommandInteraction
): Promise<void> {
  if (!isGuildOwner(context)) {
    throw new AuthorizationError('Only the guild owner can use this command');
  }
}
