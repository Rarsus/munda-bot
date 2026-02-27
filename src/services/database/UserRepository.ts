import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';
import { IUser, ICreateUserInput, IUpdateUserInput } from '../../interfaces/IUser';

export class UserRepository extends BaseRepository<IUser> {
  constructor(pool: Pool) {
    super(pool, 'users');
  }

  /**
   * Find user by Discord ID
   */
  async findByDiscordId(discordId: string): Promise<IUser | null> {
    const result = await this.query<IUser>('SELECT * FROM users WHERE discord_id = $1', [
      discordId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Create a new user
   */
  async createUser(input: ICreateUserInput): Promise<IUser> {
    return this.create({
      discord_id: input.discord_id,
      username: input.username,
      avatar_url: input.avatar_url,
      created_at: new Date(),
      updated_at: new Date(),
    } as Partial<IUser>);
  }

  /**
   * Update user
   */
  async updateUser(id: string, input: IUpdateUserInput): Promise<IUser | null> {
    const updateData = {
      ...input,
      updated_at: new Date(),
    } as Partial<IUser>;

    return this.update(id, updateData);
  }

  /**
   * Get or create user
   */
  async getOrCreate(input: ICreateUserInput): Promise<IUser> {
    const existingUser = await this.findByDiscordId(input.discord_id);
    if (existingUser) {
      return existingUser;
    }

    return this.createUser(input);
  }
}
