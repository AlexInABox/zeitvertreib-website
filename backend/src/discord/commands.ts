import { CommandManager } from './command-manager.js';
import { PingCommand } from './commands/ping.js';
import { StatsCommand } from './commands/stats.js';
import { PlayerlistCommand } from './commands/playerlist.js';
import { CoinflipCommand } from './commands/coinflip.js';
import { BirthdayCommand } from './commands/birthday.js';
// Create command manager instance
export const commandManager = new CommandManager();

// Register all commands
commandManager.register(new PingCommand());
commandManager.register(new PlayerlistCommand());
commandManager.register(new StatsCommand());
commandManager.register(new CoinflipCommand());
commandManager.register(new BirthdayCommand());

// Export commands for backwards compatibility and registration
export const COMMANDS = commandManager.getAll();
