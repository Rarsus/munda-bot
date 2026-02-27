import { ValidationError } from '../middleware/errorHandler';

/**
 * Validate Discord ID format
 */
export function validateDiscordId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^\d+$/.test(id)) {
    throw new ValidationError('Invalid Discord ID format');
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: unknown): asserts email is string {
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new ValidationError('Invalid email format');
  }
}

/**
 * Validate non-empty string
 */
export function validateNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }
}

/**
 * Validate username
 */
export function validateUsername(username: unknown): asserts username is string {
  validateNonEmptyString(username, 'Username');

  if ((username as string).length < 2 || (username as string).length > 32) {
    throw new ValidationError('Username must be between 2 and 32 characters');
  }
}

/**
 * Validate guild name
 */
export function validateGuildName(name: unknown): asserts name is string {
  validateNonEmptyString(name, 'Guild name');

  if ((name as string).length < 2 || (name as string).length > 100) {
    throw new ValidationError('Guild name must be between 2 and 100 characters');
  }
}

/**
 * Validate optional URL
 */
export function validateUrl(url: unknown): boolean {
  if (!url) return true; // URL is optional

  try {
    new URL(url as string);
    return true;
  } catch {
    throw new ValidationError('Invalid URL format');
  }
}
