import './types.js';

export abstract class BaseCommand {
  abstract readonly name: string;
  readonly name_localizations?: Record<string, string>;
  abstract readonly description: string;
  readonly description_localizations?: Record<string, string>;
  readonly options?: any[];

  abstract execute(
    interaction: any,
    helpers: CommandHelpers,
    env: Env,
    request: Request,
  ): Promise<void>;

  toJSON() {
    return {
      name: this.name,
      name_localizations: this.name_localizations,
      description: this.description,
      description_localizations: this.description_localizations,
      options: this.options,
    };
  }
}
