import './types.js';
import type { BaseCommand } from './base-command.js';

export class CommandManager {
  private commands = new Map<string, BaseCommand>();

  register(command: BaseCommand) {
    this.commands.set(command.name.toLowerCase(), command);
  }

  find(name: string) {
    return this.commands.get(name.toLowerCase());
  }

  getAll(): Command[] {
    return Array.from(this.commands.values()).map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      options: cmd.options ?? [],
      execute: cmd.execute.bind(cmd),
    }));
  }

  getForRegistration() {
    return Array.from(this.commands.values()).map((cmd) => cmd.toJSON());
  }
}
