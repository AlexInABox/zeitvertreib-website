import chalk from "chalk";

/**
 * Logs an error message in red.
 * @param {string} message - The error message to log.
 * @returns {Promise<void>}
 */
async function logError(message: string): Promise<void> {
    console.log(chalk.red(`[ERROR] ${message}`));
}

/**
 * Logs a critical error message with a red background, white bold text.
 * @param {string} message - The critical message to log.
 * @returns {Promise<void>}
 */
async function logCritical(message: string): Promise<void> {
    console.log(chalk.bgRed.white.bold(`[CRITICAL] ${message}`));
}

/**
 * Logs a warning message in yellow.
 * @param {string} message - The warning message to log.
 * @returns {Promise<void>}
 */
async function logWarning(message: string): Promise<void> {
    console.log(chalk.yellow(`[WARNING] ${message}`));
}

/**
 * Logs an informational message in white.
 * @param {string} message - The informational message to log.
 * @returns {Promise<void>}
 */
async function logInfo(message: string): Promise<void> {
    console.log(chalk.white(`[INFO] ${message}`));
}

/**
 * Runs test logs for all logging functions.
 * @returns {Promise<void>}
 */
async function printTestLogs(): Promise<void> {
    await logError("This is an error log example.");
    await logCritical("This is a critical log example.");
    await logWarning("This is a warning log example.");
    await logInfo("This is an informational log example.");
    console.log("");
}

printTestLogs();

export default { logError, logCritical, logWarning, logInfo };
