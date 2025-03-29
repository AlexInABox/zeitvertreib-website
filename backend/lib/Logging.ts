import chalk from "chalk";

/**
 * Logs an error message in red.
 * @param {string} message - The error message to log.
 */
function logError(message: string) {
    console.log(chalk.red(`[ERROR] ${message}`));
}

/**
 * Logs a critical error message with a red background, white bold text.
 * @param {string} message - The critical message to log.
 */
function logCritical(message: string) {
    console.log(chalk.bgRed.white.bold(`[CRITICAL] ${message}`));
}

/**
 * Logs a warning message in yellow. 
 * @param {string} message - The warning message to log.
 */
function logWarning(message: string) {
    console.log(chalk.yellow(`[WARNING] ${message}`));
}

/**
 * Logs an informational message in white.
 * @param {string} message - The informational message to log.
 */
function logInfo(message: string) {
    console.log(chalk.white(`[INFO] ${message}`));
}

/**
 * Runs test logs for all logging functions.
 */
function printTestLogs() {
    logError("This is an error log example.");
    logCritical("This is a critical log example.");
    logWarning("This is a warning log example.");
    logInfo("This is an informational log example.");
    console.log("");
}

printTestLogs();

export default { logError, logCritical, logWarning, logInfo };
