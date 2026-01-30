import type {
  APIInteraction,
  APIApplicationCommandOption,
  APIApplicationCommandInteraction,
} from 'discord-api-types/v10';

// Global type declarations
declare global {
  interface CommandHelpers {
    reply: (
      content:
        | string
        | {
          content?: string;
          embeds?: any[];
          components?: any[];
          flags?: number;
        },
    ) => Promise<void>;
  }

  type CommandHandler = (
    interaction: APIApplicationCommandInteraction,
    helpers: CommandHelpers,
    env: Env,
    request: Request,
  ) => Promise<void>;

  interface Command {
    name: string;
    description: string;
    options?: APIApplicationCommandOption[];
    execute: CommandHandler;
  }

  interface VerificationResult {
    isValid: boolean;
    interaction?: APIInteraction;
  }
}

export { };
