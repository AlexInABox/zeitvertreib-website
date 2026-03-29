package zeitvertreib.economy.command;

import com.mojang.brigadier.Command;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import zeitvertreib.economy.config.EconomyConfig;
import zeitvertreib.economy.currency.CurrencyManager;
import zeitvertreib.economy.team.TeamData;
import zeitvertreib.economy.team.TeamManager;
import zeitvertreib.economy.trade.TradeOffer;
import zeitvertreib.economy.trade.TradeOfferManager;

public final class DevCommands {
	private static final String CURRENCY_LABEL = "coins";

	private final EconomyConfig config;
	private final CurrencyManager currencyManager;
	private final TeamManager teamManager;
	private final TradeOfferManager tradeOfferManager;

	public DevCommands(EconomyConfig config, CurrencyManager currencyManager, TeamManager teamManager, TradeOfferManager tradeOfferManager) {
		this.config = config;
		this.currencyManager = currencyManager;
		this.teamManager = teamManager;
		this.tradeOfferManager = tradeOfferManager;
	}

	public void register(CommandDispatcher<CommandSourceStack> dispatcher, CommandBuildContext registryAccess, Commands.CommandSelection environment) {
		dispatcher.register(Commands.literal("zvdev")
			.requires(Commands.hasPermission(Commands.LEVEL_ADMINS))
			.then(Commands.literal("help")
				.executes(this::showHelp))
			.then(Commands.literal("balance")
				.then(Commands.argument("player", EntityArgument.player())
					.executes(this::showTargetBalance)))
			.then(Commands.literal("money")
				.then(Commands.literal("set")
					.then(Commands.argument("player", EntityArgument.player())
						.then(Commands.argument("amount", IntegerArgumentType.integer(0))
							.executes(this::setBalance))))
				.then(Commands.literal("add")
					.then(Commands.argument("player", EntityArgument.player())
						.then(Commands.argument("amount", IntegerArgumentType.integer())
							.executes(this::addBalance))))
				.then(Commands.literal("remove")
					.then(Commands.argument("player", EntityArgument.player())
						.then(Commands.argument("amount", IntegerArgumentType.integer(1))
							.executes(this::removeBalance)))))
			.then(Commands.literal("trade")
				.then(Commands.literal("self")
					.then(Commands.argument("price", IntegerArgumentType.integer(1))
						.executes(this::offerSelfTrade)))
				.then(Commands.literal("with")
					.then(Commands.argument("player", EntityArgument.player())
						.then(Commands.argument("price", IntegerArgumentType.integer(1))
							.executes(this::offerTradeWithPlayer))))
				.then(Commands.literal("inspect")
					.then(Commands.literal("player")
						.then(Commands.argument("player", EntityArgument.player())
							.executes(this::inspectTradeForPlayer)))
					.then(Commands.literal("offer")
						.then(Commands.argument("offerId", StringArgumentType.word())
							.executes(this::inspectTradeById))))
				.then(Commands.literal("cancel")
					.then(Commands.argument("offerId", StringArgumentType.word())
						.executes(this::cancelTradeById)))
				.then(Commands.literal("clearall")
					.executes(this::clearAllTrades)))
			.then(Commands.literal("team")
				.then(Commands.literal("list")
					.executes(this::listTeams))
				.then(Commands.literal("info")
					.then(Commands.argument("team", StringArgumentType.word())
						.executes(this::teamInfo)))
				.then(Commands.literal("create")
					.then(Commands.argument("player", EntityArgument.player())
						.then(Commands.argument("name", StringArgumentType.word())
							.then(Commands.argument("color", StringArgumentType.word())
								.executes(this::createTeamForPlayer)))))
				.then(Commands.literal("join")
					.then(Commands.argument("team", StringArgumentType.word())
						.then(Commands.argument("player", EntityArgument.player())
							.executes(this::joinPlayerToTeam))))
				.then(Commands.literal("leave")
					.then(Commands.argument("player", EntityArgument.player())
						.executes(this::forceLeaveTeam)))
				.then(Commands.literal("leader")
					.then(Commands.argument("team", StringArgumentType.word())
						.then(Commands.argument("player", EntityArgument.player())
							.executes(this::setTeamLeader))))
				.then(Commands.literal("disband")
					.then(Commands.argument("team", StringArgumentType.word())
						.executes(this::disbandTeam)))
				.then(Commands.literal("bank")
					.then(Commands.literal("set")
						.then(Commands.argument("team", StringArgumentType.word())
							.then(Commands.argument("amount", IntegerArgumentType.integer(0))
								.executes(this::setTeamBank))))
					.then(Commands.literal("add")
						.then(Commands.argument("team", StringArgumentType.word())
							.then(Commands.argument("amount", IntegerArgumentType.integer(1))
								.executes(this::addTeamBank))))
					.then(Commands.literal("remove")
						.then(Commands.argument("team", StringArgumentType.word())
							.then(Commands.argument("amount", IntegerArgumentType.integer(1))
								.executes(this::removeTeamBank)))))
				.then(Commands.literal("sync")
					.executes(this::syncTeamDisplays))));
	}

	private int showHelp(CommandContext<CommandSourceStack> context) {
		context.getSource().sendSuccess(() -> Component.literal("--- /zvdev Help (OP only) ---").withStyle(ChatFormatting.YELLOW), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev balance <player> - Inspect any player's balance."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev money set|add|remove <player> <amount> - Force-edit balances."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev trade self <price> - Create a self-trade using your held item."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev trade with <player> <price> - Create a dev trade with any player."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev trade inspect player <player> - Show that player's active offer."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev trade inspect offer <offerId> - Inspect a specific offer."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev trade cancel <offerId> - Force-cancel and restore escrow."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev trade clearall - Cancel every active trade."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev team list|info <team> - Inspect all teams or one team."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev team create <player> <name> <color> - Force-create a team for a player."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev team join <team> <player> - Force-move a player into a team."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev team leave <player> - Force-remove a player from their team."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev team leader <team> <player> - Force leadership change."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev team bank set|add|remove <team> <amount> - Edit team bank."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev team disband <team> - Delete a team immediately."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev team sync - Rebuild team display tags."), false);
		return Command.SINGLE_SUCCESS;
	}

	private int showTargetBalance(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		int balance = currencyManager.getBalance(context.getSource().getServer(), target.getUUID());
		context.getSource().sendSuccess(() -> Component.literal(target.getName().getString() + " has ").append(formatCurrency(balance)).append(Component.literal(".")), false);
		return Command.SINGLE_SUCCESS;
	}

	private int setBalance(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		int amount = IntegerArgumentType.getInteger(context, "amount");
		int updatedBalance = currencyManager.setBalance(context.getSource().getServer(), target.getUUID(), amount);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Set ").append(Component.literal(target.getName().getString()).withStyle(ChatFormatting.AQUA)).append(Component.literal(" to ")).append(formatCurrency(updatedBalance)).append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int addBalance(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		int amount = IntegerArgumentType.getInteger(context, "amount");
		int updatedBalance = currencyManager.addBalance(context.getSource().getServer(), target.getUUID(), amount);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Updated ").append(Component.literal(target.getName().getString()).withStyle(ChatFormatting.AQUA)).append(Component.literal(" to ")).append(formatCurrency(updatedBalance)).append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int removeBalance(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		int amount = IntegerArgumentType.getInteger(context, "amount");
		int updatedBalance = currencyManager.setBalance(
			context.getSource().getServer(),
			target.getUUID(),
			currencyManager.getBalance(context.getSource().getServer(), target.getUUID()) - amount
		);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Updated ").append(Component.literal(target.getName().getString()).withStyle(ChatFormatting.AQUA)).append(Component.literal(" to ")).append(formatCurrency(updatedBalance)).append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int offerSelfTrade(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		int price = IntegerArgumentType.getInteger(context, "price");
		return createDevTrade(context, player, player, price);
	}

	private int offerTradeWithPlayer(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer seller = context.getSource().getPlayerOrException();
		ServerPlayer buyer = EntityArgument.getPlayer(context, "player");
		int price = IntegerArgumentType.getInteger(context, "price");
		return createDevTrade(context, seller, buyer, price);
	}

	private int createDevTrade(CommandContext<CommandSourceStack> context, ServerPlayer seller, ServerPlayer buyer, int price) {
		if (tradeOfferManager.isPlayerBusy(seller.getUUID()) || tradeOfferManager.isPlayerBusy(buyer.getUUID())) {
			context.getSource().sendFailure(Component.literal("A matching player already has an active offer. Use /zvdev trade cancel or /zvdev trade clearall first."));
			return 0;
		}

		ItemStack heldStack = seller.getMainHandItem();
		if (heldStack.isEmpty()) {
			context.getSource().sendFailure(Component.literal("Hold the item you want to escrow in your main hand."));
			return 0;
		}

		ItemStack escrowedStack = heldStack.copy();
		seller.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
		TradeOffer offer = tradeOfferManager.createOffer(seller, buyer, escrowedStack, price, true);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Created trade ").withStyle(ChatFormatting.YELLOW)
			.append(Component.literal(offer.id().toString()).withStyle(ChatFormatting.AQUA))
			.append(Component.literal(" between "))
			.append(Component.literal(offer.sellerName()).withStyle(ChatFormatting.GREEN))
			.append(Component.literal(" and "))
			.append(Component.literal(offer.buyerName()).withStyle(ChatFormatting.GREEN))
			.append(Component.literal(" for "))
			.append(formatCurrency(offer.price()))
			.append(Component.literal(". Tax would be "))
			.append(formatCurrency(config.calculateTax(offer.price())))
			.append(Component.literal(".")), false);
		buyer.sendSystemMessage(Component.literal("[DEV] A developer trade is waiting: /zv trade accept " + offer.id()).withStyle(ChatFormatting.YELLOW));
		return Command.SINGLE_SUCCESS;
	}

	private int inspectTradeForPlayer(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = EntityArgument.getPlayer(context, "player");
		TradeOffer offer = tradeOfferManager.getOfferForPlayer(player.getUUID());
		if (offer == null) {
			context.getSource().sendFailure(Component.literal("That player has no active trade offer."));
			return 0;
		}

		return sendTradeInspection(context, offer);
	}

	private int inspectTradeById(CommandContext<CommandSourceStack> context) {
		TradeOffer offer = parseOffer(context, "offerId");
		if (offer == null) {
			context.getSource().sendFailure(Component.literal("Trade offer not found."));
			return 0;
		}

		return sendTradeInspection(context, offer);
	}

	private int cancelTradeById(CommandContext<CommandSourceStack> context) {
		String rawOfferId = StringArgumentType.getString(context, "offerId");
		UUID offerId;
		try {
			offerId = UUID.fromString(rawOfferId);
		} catch (IllegalArgumentException exception) {
			context.getSource().sendFailure(Component.literal("Offer id must be a valid UUID."));
			return 0;
		}

		TradeOffer offer = tradeOfferManager.cancelOffer(context.getSource().getServer(), offerId, "Canceled by a developer.");
		if (offer == null) {
			context.getSource().sendFailure(Component.literal("Trade offer not found."));
			return 0;
		}

		context.getSource().sendSuccess(() -> Component.literal("[DEV] Canceled trade ").withStyle(ChatFormatting.YELLOW)
			.append(Component.literal(offer.id().toString()).withStyle(ChatFormatting.AQUA))
			.append(Component.literal(" and restored escrow.")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int clearAllTrades(CommandContext<CommandSourceStack> context) {
		List<TradeOffer> offers = tradeOfferManager.getActiveOffers();
		tradeOfferManager.cancelAll(context.getSource().getServer());
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Cleared " + offers.size() + " active trade(s).").withStyle(ChatFormatting.YELLOW), true);
		return Command.SINGLE_SUCCESS;
	}

	private int listTeams(CommandContext<CommandSourceStack> context) {
		List<TeamData> teams = new ArrayList<>(teamManager.getTeams(context.getSource().getServer()));
		teams.sort(Comparator.comparing(TeamData::name));
		if (teams.isEmpty()) {
			context.getSource().sendSuccess(() -> Component.literal("No teams exist."), false);
			return Command.SINGLE_SUCCESS;
		}

		context.getSource().sendSuccess(() -> Component.literal("--- Teams ---").withStyle(ChatFormatting.YELLOW), false);
		for (TeamData team : teams) {
			String line = String.format(Locale.ROOT, "%s leader=%s members=%d bank=%d %s",
				team.name(),
				team.leaderId(),
				team.memberIds().size(),
				team.bankBalance(),
				CURRENCY_LABEL);
			context.getSource().sendSuccess(() -> Component.literal(line).withStyle(team.color()), false);
		}
		return Command.SINGLE_SUCCESS;
	}

	private int teamInfo(CommandContext<CommandSourceStack> context) {
		TeamData team = requireTeam(context, StringArgumentType.getString(context, "team"));
		if (team == null) {
			return 0;
		}

		MinecraftServer server = context.getSource().getServer();
		MutableComponent message = Component.literal("Team: ")
			.append(teamManager.describeTeam(team))
			.append(Component.literal("\nLeader: " + resolvePlayerName(server, team.leaderId())))
			.append(Component.literal("\nBank: "))
			.append(formatCurrency(team.bankBalance()))
			.append(Component.literal("\nMembers: "));

		boolean first = true;
		for (UUID memberId : team.memberIds()) {
			if (!first) {
				message.append(Component.literal(", "));
			}
			message.append(Component.literal(resolvePlayerName(server, memberId)));
			first = false;
		}

		context.getSource().sendSuccess(() -> message, false);
		return Command.SINGLE_SUCCESS;
	}

	private int createTeamForPlayer(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = EntityArgument.getPlayer(context, "player");
		String rawName = StringArgumentType.getString(context, "name");
		String normalizedName = TeamManager.normalizeTeamName(rawName);
		if (!normalizedName.matches("(?i)[a-z]{1,5}")) {
			context.getSource().sendFailure(Component.literal("Team names must be letters only and 5 characters max."));
			return 0;
		}

		ChatFormatting color = parseColor(StringArgumentType.getString(context, "color"));
		if (color == null) {
			context.getSource().sendFailure(Component.literal("Invalid team color."));
			return 0;
		}

		if (teamManager.getTeam(context.getSource().getServer(), normalizedName) != null) {
			context.getSource().sendFailure(Component.literal("That team name is already taken."));
			return 0;
		}

		teamManager.removePlayerFromTeam(context.getSource().getServer(), player.getUUID());
		TeamData team = teamManager.createTeam(context.getSource().getServer(), player, normalizedName, color);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Created team ").withStyle(ChatFormatting.YELLOW)
			.append(teamManager.describeTeam(team))
			.append(Component.literal(" for "))
			.append(Component.literal(player.getName().getString()).withStyle(ChatFormatting.AQUA)), true);
		return Command.SINGLE_SUCCESS;
	}

	private int joinPlayerToTeam(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		TeamData team = requireTeam(context, StringArgumentType.getString(context, "team"));
		if (team == null) {
			return 0;
		}

		ServerPlayer player = EntityArgument.getPlayer(context, "player");
		teamManager.forceJoinTeam(context.getSource().getServer(), team, player);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Moved ").withStyle(ChatFormatting.YELLOW)
			.append(Component.literal(player.getName().getString()).withStyle(ChatFormatting.AQUA))
			.append(Component.literal(" into "))
			.append(teamManager.describeTeam(team))
			.append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int forceLeaveTeam(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = EntityArgument.getPlayer(context, "player");
		TeamData team = teamManager.removePlayerFromTeam(context.getSource().getServer(), player.getUUID());
		if (team == null) {
			context.getSource().sendFailure(Component.literal("That player is not in a team."));
			return 0;
		}

		context.getSource().sendSuccess(() -> Component.literal("[DEV] Removed ").withStyle(ChatFormatting.YELLOW)
			.append(Component.literal(player.getName().getString()).withStyle(ChatFormatting.AQUA))
			.append(Component.literal(" from "))
			.append(teamManager.describeTeam(team))
			.append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int setTeamLeader(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		TeamData team = requireTeam(context, StringArgumentType.getString(context, "team"));
		if (team == null) {
			return 0;
		}

		ServerPlayer player = EntityArgument.getPlayer(context, "player");
		if (!teamManager.setTeamLeader(context.getSource().getServer(), team, player.getUUID())) {
			context.getSource().sendFailure(Component.literal("That player is not a member of the team."));
			return 0;
		}

		context.getSource().sendSuccess(() -> Component.literal("[DEV] Set leader of ").withStyle(ChatFormatting.YELLOW)
			.append(teamManager.describeTeam(team))
			.append(Component.literal(" to "))
			.append(Component.literal(player.getName().getString()).withStyle(ChatFormatting.AQUA))
			.append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int disbandTeam(CommandContext<CommandSourceStack> context) {
		String teamName = StringArgumentType.getString(context, "team");
		TeamData team = requireTeam(context, teamName);
		if (team == null) {
			return 0;
		}

		teamManager.disbandTeam(context.getSource().getServer(), teamName);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Disbanded ").withStyle(ChatFormatting.YELLOW)
			.append(teamManager.describeTeam(team))
			.append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int setTeamBank(CommandContext<CommandSourceStack> context) {
		TeamData team = requireTeam(context, StringArgumentType.getString(context, "team"));
		if (team == null) {
			return 0;
		}

		int amount = IntegerArgumentType.getInteger(context, "amount");
		int updatedBalance = teamManager.setBankBalance(context.getSource().getServer(), team, amount);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Set bank of ").withStyle(ChatFormatting.YELLOW)
			.append(teamManager.describeTeam(team))
			.append(Component.literal(" to "))
			.append(formatCurrency(updatedBalance))
			.append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int addTeamBank(CommandContext<CommandSourceStack> context) {
		TeamData team = requireTeam(context, StringArgumentType.getString(context, "team"));
		if (team == null) {
			return 0;
		}

		int amount = IntegerArgumentType.getInteger(context, "amount");
		teamManager.depositToBank(context.getSource().getServer(), team, amount);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Updated bank of ").withStyle(ChatFormatting.YELLOW)
			.append(teamManager.describeTeam(team))
			.append(Component.literal(" to "))
			.append(formatCurrency(team.bankBalance()))
			.append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int removeTeamBank(CommandContext<CommandSourceStack> context) {
		TeamData team = requireTeam(context, StringArgumentType.getString(context, "team"));
		if (team == null) {
			return 0;
		}

		int amount = IntegerArgumentType.getInteger(context, "amount");
		int updatedBalance = teamManager.setBankBalance(context.getSource().getServer(), team, team.bankBalance() - amount);
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Updated bank of ").withStyle(ChatFormatting.YELLOW)
			.append(teamManager.describeTeam(team))
			.append(Component.literal(" to "))
			.append(formatCurrency(updatedBalance))
			.append(Component.literal(".")), true);
		return Command.SINGLE_SUCCESS;
	}

	private int syncTeamDisplays(CommandContext<CommandSourceStack> context) {
		teamManager.syncDisplays(context.getSource().getServer());
		context.getSource().sendSuccess(() -> Component.literal("[DEV] Re-synced team display tags.").withStyle(ChatFormatting.YELLOW), true);
		return Command.SINGLE_SUCCESS;
	}

	private TradeOffer parseOffer(CommandContext<CommandSourceStack> context, String argumentName) {
		String rawOfferId = StringArgumentType.getString(context, argumentName);
		try {
			return tradeOfferManager.getOffer(UUID.fromString(rawOfferId));
		} catch (IllegalArgumentException exception) {
			return null;
		}
	}

	private int sendTradeInspection(CommandContext<CommandSourceStack> context, TradeOffer offer) {
		long secondsRemaining = Math.max(0L, (offer.expiresAtMillis() - System.currentTimeMillis()) / 1000L);
		MutableComponent message = Component.literal("Offer: ").append(Component.literal(offer.id().toString()).withStyle(ChatFormatting.AQUA))
			.append(Component.literal("\nSeller: " + offer.sellerName()))
			.append(Component.literal("\nBuyer: " + offer.buyerName()))
			.append(Component.literal("\nItem: "))
			.append(TradeOfferManager.describeStack(offer.stack()))
			.append(Component.literal("\nPrice: "))
			.append(formatCurrency(offer.price()))
			.append(Component.literal("\nTax: "))
			.append(formatCurrency(config.calculateTax(offer.price())))
			.append(Component.literal("\nMode: " + (offer.devMode() ? "dev" : "normal")))
			.append(Component.literal("\nExpires in: " + secondsRemaining + "s"));
		context.getSource().sendSuccess(() -> message, false);
		return Command.SINGLE_SUCCESS;
	}

	private TeamData requireTeam(CommandContext<CommandSourceStack> context, String rawTeamName) {
		TeamData team = teamManager.getTeam(context.getSource().getServer(), TeamManager.normalizeTeamName(rawTeamName));
		if (team == null) {
			context.getSource().sendFailure(Component.literal("Team not found."));
		}
		return team;
	}

	private String resolvePlayerName(MinecraftServer server, UUID playerId) {
		ServerPlayer player = server.getPlayerList().getPlayer(playerId);
		return player != null ? player.getName().getString() : playerId.toString();
	}

	private MutableComponent formatCurrency(int amount) {
		return Component.literal(Math.max(0, amount) + " " + CURRENCY_LABEL).withStyle(ChatFormatting.GOLD);
	}

	private ChatFormatting parseColor(String rawColor) {
		ChatFormatting color = ChatFormatting.getByName(rawColor.toLowerCase(Locale.ROOT));
		return color != null && color.isColor() ? color : null;
	}
}