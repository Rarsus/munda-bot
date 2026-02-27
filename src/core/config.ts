import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  environment: process.env.NODE_ENV || 'development',
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  gcp: {
    projectId: process.env.GCP_PROJECT_ID,
  },
};

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const required = ['discord.token', 'database.url'];
  const missing: string[] = [];

  required.forEach((key) => {
    const keys = key.split('.');
    let value: unknown = config;

    for (const k of keys) {
      value = (value as Record<string, unknown>)[k];
      if (!value) {
        missing.push(key);
        break;
      }
    }
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
