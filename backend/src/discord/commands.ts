import { CommandManager } from './command-manager.js';
import { PingCommand } from './commands/ping.js';
import { StatsCommand } from './commands/stats.js';
import { PlayerlistCommand } from './commands/playerlist.js';
// Create command manager instance
export const commandManager = new CommandManager();

// Register all commands
commandManager.register(new PingCommand());
commandManager.register(new PlayerlistCommand());
commandManager.register(new StatsCommand());

// Export commands for backwards compatibility and registration
export const COMMANDS = commandManager.getAll();
