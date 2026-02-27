# Project Architecture Guide

This document describes the enterprise-grade architecture of the Discord bot, designed for scalability, maintainability, and ease of development.

---

## 📁 Directory Structure

```tree
src/
├── core/                   # Core bot setup and configuration
│   ├── client.ts          # BotClient: Extended Discord client with command registry
│   ├── config.ts          # Configuration management and validation
│   └── index.ts           # Core module exports
│
├── middleware/            # Middleware for cross-cutting concerns
│   ├── errorHandler.ts    # Error handling and custom error classes
│   ├── auth.ts            # Authentication & authorization checks
│   └── index.ts           # Middleware exports
│
├── commands/              # Command abstraction and handlers
│   ├── base.ts            # Command: Abstract base class for all commands
│   ├── types.ts           # Command utilities and helpers
│   ├── handler.ts         # CommandHandler: Routes and executes commands
│   ├── index.ts           # Commands module exports
│   └── examples/          # Example implementations
│       ├── ping.ts        # PingCommand: Check bot latency
│       └── help.ts        # HelpCommand: List available commands
│
├── services/              # Business logic and external integrations
│   ├── logger.ts          # Winston logger configuration
│   ├── database.ts        # Database initialization and exports
│   └── database/          # Database abstraction layer (CRUD)
│       ├── BaseRepository.ts    # Generic CRUD operations
│       ├── UserRepository.ts    # User entity operations
│       ├── GuildRepository.ts   # Guild & member entity operations
│       └── index.ts             # Database service exports
│
├── interfaces/            # TypeScript interfaces for type safety
│   ├── ICommand.ts        # Command interface
│   ├── IUser.ts           # User entity interface
│   ├── IGuild.ts          # Guild/member entity interfaces
│   ├── IResponse.ts       # Response envelope interface
│   └── index.ts           # Interface exports
│
├── utils/                 # Utility functions and helpers
│   ├── validators.ts      # Input validation functions
│   ├── helpers.ts         # General helper functions (embeds, formatting, etc.)
│   └── index.ts           # Utils exports
│
├── types/                 # Custom TypeScript types
│   └── index.ts           # Types exports
│
└── index.ts              # Main entry point: Bot initialization
```

---

## 🏗️ Core Concepts

### 1. **Command System**

Commands follow the **Command Pattern** for extensibility.

#### Creating a New Command

```typescript
// src/commands/examples/mycommand.ts
import { Message, CommandInteraction } from 'discord.js';
import { Command } from '../base';

export class MyCommand extends Command {
  name = 'mycommand';
  description = 'Does something cool';
  aliases = ['my', 'cmd'];
  usage = 'mycommand [arg1] [arg2]';
  examples = ['mycommand hello', 'mycommand world'];
  requiredPermissions = ['SendMessages', 'EmbedLinks'];

  async execute(context: Message | CommandInteraction, ...args: unknown[]): Promise<void> {
    // Command logic here
    if (context instanceof Message) {
      await context.reply('Command executed!');
    } else {
      await context.reply({ content: 'Command executed!', ephemeral: true });
    }
  }
}
```

#### Registering a Command

In `src/index.ts`:

```typescript
import { MyCommand } from './commands/examples/mycommand';

const myCommand = new MyCommand();
client.registerCommand(myCommand);
```

**Features:**
- Automatic error handling via `safeExecute` wrapper
- Support for both message and interaction contexts
- Aliases for alternative command names
- Built-in permission checking
- Comprehensive help information

---

### 2. **Middleware & Error Handling**

The middleware layer provides cross-cutting concerns:

#### Error Handling

```typescript
import { AppError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

// Throw custom errors
throw new ValidationError('Invalid input');
throw new AuthorizationError('You lack permissions');
throw new AppError('CUSTOM_CODE', 'Custom message', 400);
```

#### Authorization/Authentication

```typescript
import { 
  requirePermissions, 
  requireAdmin, 
  requireGuildOwner,
  isAdmin 
} from '../middleware/auth';

// In a command
async execute(context: Message | CommandInteraction): Promise<void> {
  await requireAdmin(context); // Throws AuthorizationError if not admin
  
  if (isAdmin(context)) {
    // Do something only admins can do
  }
}
```

---

### 3. **Database Layer (CRUD)**

The database uses the **Repository Pattern** for clean separation of data access logic.

#### User Repository

```typescript
import { getDatabase } from '../services/database';

const db = getDatabase();

// Create user
const user = await db.users.createUser({
  discord_id: '123456',
  username: 'john_doe',
  avatar_url: 'https://...',
});

// Find user
const foundUser = await db.users.findByDiscordId('123456');

// Update user
const updatedUser = await db.users.updateUser(user.id, {
  username: 'john_smith',
});

// Get or create (upsert)
const upsertedUser = await db.users.getOrCreate({
  discord_id: '123456',
  username: 'john_doe',
});
```

#### Guild Repository

```typescript
// Create guild
const guild = await db.guilds.createGuild({
  discord_guild_id: '789',
  name: 'My Guild',
  owner_id: userId,
});

// Add member to guild
const member = await db.guildMembers.addMember({
  guild_id: guild.id,
  user_id: userId,
});

// Log audit action
await db.auditLogs.logAction({
  guild_id: guild.id,
  user_id: userId,
  action: 'member_joined',
  details: { username: 'john' },
});
```

**Repositories Available:**
- `db.users` - UserRepository
- `db.guilds` - GuildRepository
- `db.guildMembers` - GuildMemberRepository
- `db.auditLogs` - AuditLogRepository

---

### 4. **Utilities**

#### Validators

```typescript
import { 
  validateDiscordId, 
  validateUsername, 
  validateGuildName 
} from '../utils/validators';

// These throw ValidationError on failure
validateDiscordId(id);
validateUsername(name);
validateGuildName(name);
```

#### Helpers

```typescript
import { 
  createSuccessEmbed, 
  createErrorEmbed,
  formatDate,
  paginate 
} from '../utils/helpers';

const embed = createSuccessEmbed('Success!', 'Operation completed');
const errorEmbed = createErrorEmbed('Error', 'Something went wrong');

const formatted = formatDate(new Date());
const page = paginate(items, 10, 1); // 10 items per page, page 1
```

---

## 🔧 Common Patterns

### Pattern 1: Command with Database Query

```typescript
export class UserInfoCommand extends Command {
  name = 'userinfo';
  description = 'Get user information';
  usage = 'userinfo <user_id>';

  async execute(context: Message | CommandInteraction, userId?: string): Promise<void> {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const db = getDatabase();
    const user = await db.users.findByDiscordId(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    const embed = createInfoEmbed(`User: ${user.username}`, `ID: ${user.id}`);
    
    if (context instanceof Message) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
```

### Pattern 2: Command with Permission Check

```typescript
export class AdminCommand extends Command {
  name = 'admin';
  description = 'Admin-only command';
  requiredPermissions = ['Administrator'];

  async execute(context: Message | CommandInteraction): Promise<void> {
    await requireAdmin(context); // Throws if not admin

    // Safe to proceed with admin action
    const embed = createSuccessEmbed('Admin Action', 'Executed successfully');
    
    if (context instanceof Message) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
```

### Pattern 3: Transaction

```typescript
const db = getDatabase();

await db.guilds.transaction(async (client) => {
  // All operations here use the same transaction
  // If any fail, everything rolls back
  const guild = await db.guilds.createGuild(...);
  const member = await db.guildMembers.addMember(...);
});
```

---

## 📋 Configuration

Configuration is centralized in `src/core/config.ts`:

```typescript
export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  environment: process.env.NODE_ENV || 'development',
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  gcp: {
    projectId: process.env.GCP_PROJECT_ID,
  },
};

// Validate config (throws if required vars missing)
validateConfig();
```

Required environment variables:
- `DISCORD_TOKEN` - Discord bot token
- `DATABASE_URL` - PostgreSQL connection string

Optional:
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Log level (debug/info/warn/error)
- `GCP_PROJECT_ID` - GCP project ID

---

## 🚀 Development Workflow

1. **Create a new command:**
   ```bash
   # Create src/commands/examples/mycommand.ts
   # Extend Command class
   # Register in src/index.ts
   ```

2. **Add database entity:**
   ```bash
   # Create interface in src/interfaces/IMyEntity.ts
   # Create repository in src/services/database/MyRepository.ts
   # Export from src/services/database/index.ts
   # Use in commands
   ```

3. **Add validation:**
   ```bash
   # Add validator to src/utils/validators.ts
   # Use in command: validateMyField(input)
   ```

4. **Test locally:**
   ```bash
   npm run dev
   ```

5. **Compile and deploy:**
   ```bash
   npm run build
   docker-compose up
   # or use deploy.sh for GCP
   ```

---

## 🔐 Security Best Practices

1. **Always validate input:**
   ```typescript
   validateUsername(input);  // Throws if invalid
   ```

2. **Check permissions before sensitive operations:**
   ```typescript
   await requireAdmin(context);
   ```

3. **Log sensitive actions:**
   ```typescript
   await db.auditLogs.logAction({
     guild_id: guildId,
     user_id: userId,
     action: 'sensitive_action',
     details: { /* sanitized details */ },
   });
   ```

4. **Use transactions for multi-step operations:**
   ```typescript
   await db.guilds.transaction(async () => {
     // Multiple operations
   });
   ```

---

## 📚 Further Reading

- [Discord.js Documentation](https://discord.js.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Winston Logger](https://github.com/winstonjs/winston)

---

**Last Updated:** February 27, 2026
