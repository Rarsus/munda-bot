import { Message, CommandInteraction, MessageEmbed } from 'discord.js';
import { logger } from '../services/logger';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Error handler middleware
 */
export async function handleError(
  error: unknown,
  context: Message | CommandInteraction
): Promise<void> {
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Error) {
    appError = new AppError('INTERNAL_ERROR', error.message, 500, {
      originalError: error.message,
      stack: error.stack,
    });
  } else {
    appError = new AppError('UNKNOWN_ERROR', String(error), 500);
  }

  // Log the error
  logger.error('Command execution error', {
    service: 'ErrorHandler',
    code: appError.code,
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    userId: context instanceof Message ? context.author.id : context.user.id,
    guildId: context.guildId,
  });

  // Send error message to user
  const errorEmbed = new MessageEmbed()
    .setColor('#ff0000')
    .setTitle('❌ Command Error')
    .setDescription(appError.message)
    .addField('Error Code', appError.code)
    .setTimestamp();

  try {
    if (context instanceof Message) {
      await context.reply({ embeds: [errorEmbed] });
    } else {
      await context.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  } catch (replyError) {
    logger.error('Failed to send error message to user', {
      service: 'ErrorHandler',
      error: replyError,
    });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'You do not have permission to use this command') {
    super('AUTHORIZATION_ERROR', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}
