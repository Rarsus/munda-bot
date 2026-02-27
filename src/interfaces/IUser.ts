export interface IUser {
  id: string;
  discord_id: string;
  username: string;
  avatar_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ICreateUserInput {
  discord_id: string;
  username: string;
  avatar_url?: string;
}

export interface IUpdateUserInput {
  username?: string;
  avatar_url?: string;
}
