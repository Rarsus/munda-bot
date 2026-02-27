import { MessageEmbed, User } from 'discord.js';

/**
 * Create success embed
 */
export function createSuccessEmbed(title: string, description?: string): MessageEmbed {
  return new MessageEmbed()
    .setTitle(`✅ ${title}`)
    .setDescription(description || '')
    .setColor('#00ff00')
    .setTimestamp();
}

/**
 * Create error embed
 */
export function createErrorEmbed(title: string, description?: string): MessageEmbed {
  return new MessageEmbed()
    .setTitle(`❌ ${title}`)
    .setDescription(description || '')
    .setColor('#ff0000')
    .setTimestamp();
}

/**
 * Create info embed
 */
export function createInfoEmbed(title: string, description?: string): MessageEmbed {
  return new MessageEmbed()
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description || '')
    .setColor('#0099ff')
    .setTimestamp();
}

/**
 * Create user embed
 */
export function createUserEmbed(user: User): MessageEmbed {
  return new MessageEmbed()
    .setTitle(`👤 ${user.username}`)
    .setDescription(`ID: ${user.id}`)
    .setColor('#9370db')
    .setThumbnail(user.avatarURL({ size: 256 }) || '')
    .setTimestamp();
}

/**
 * Paginate array
 */
export function paginate<T>(array: T[], pageSize: number, page: number): T[] {
  const index = (page - 1) * pageSize;
  return array.slice(index, index + pageSize);
}

/**
 * Get pagination info
 */
export function getPaginationInfo(
  total: number,
  pageSize: number,
  currentPage: number
): {
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalPages = Math.ceil(total / pageSize);

  return {
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
}

/**
 * Format date to readable string
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(' ') || '0s';
}
