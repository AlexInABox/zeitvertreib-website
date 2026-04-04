package zeitvertreib.economy;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import zeitvertreib.economy.command.DevCommands;
import zeitvertreib.economy.command.EconomyCommands;
import zeitvertreib.economy.command.TeamCommands;
import zeitvertreib.economy.config.EconomyConfig;
import zeitvertreib.economy.currency.CurrencyManager;
import zeitvertreib.economy.team.TeamManager;
import zeitvertreib.economy.trade.TradeOfferManager;

public class ZeitvertreibEconomy implements ModInitializer {
	public static final String MOD_ID = "zeitvertreib-economy";
	public static final EconomyConfig CONFIG = new EconomyConfig();
	public static final CurrencyManager CURRENCY_MANAGER = new CurrencyManager();
	public static final TeamManager TEAM_MANAGER = new TeamManager();
	public static final TradeOfferManager TRADE_OFFER_MANAGER = new TradeOfferManager();
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		EconomyCommands commands = new EconomyCommands(CONFIG, CURRENCY_MANAGER, TRADE_OFFER_MANAGER);
		DevCommands devCommands = new DevCommands(CONFIG, CURRENCY_MANAGER, TEAM_MANAGER, TRADE_OFFER_MANAGER);
		TeamCommands teamCommands = new TeamCommands(CURRENCY_MANAGER, TEAM_MANAGER);
		CommandRegistrationCallback.EVENT.register(commands::register);
		CommandRegistrationCallback.EVENT.register(devCommands::register);
		CommandRegistrationCallback.EVENT.register(teamCommands::register);
		ServerTickEvents.END_SERVER_TICK.register(TRADE_OFFER_MANAGER::cleanupExpiredOffers);
		ServerTickEvents.END_SERVER_TICK.register(TEAM_MANAGER::cleanupExpiredInvites);
		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> TEAM_MANAGER.syncDisplays(server));
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			TRADE_OFFER_MANAGER.cancelOffersForPlayer(server, handler.getPlayer());
			TEAM_MANAGER.clearDisplayForPlayer(server, handler.getPlayer());
		});
		ServerLifecycleEvents.SERVER_STARTING.register(server -> {
			CONFIG.load();
			CURRENCY_MANAGER.reset();
			TEAM_MANAGER.load(server);
			TEAM_MANAGER.syncDisplays(server);
			TRADE_OFFER_MANAGER.reset();
		});
		ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
			TRADE_OFFER_MANAGER.cancelAll(server);
			CURRENCY_MANAGER.reset();
			TEAM_MANAGER.reset();
			TRADE_OFFER_MANAGER.reset();
		});

		LOGGER.info("Zeitvertreib Economy initialized");
	}
}