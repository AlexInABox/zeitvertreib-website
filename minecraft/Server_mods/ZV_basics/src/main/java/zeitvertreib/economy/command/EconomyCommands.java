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
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;

import java.util.UUID;

import zeitvertreib.economy.config.EconomyConfig;
import zeitvertreib.economy.currency.CurrencyManager;
import zeitvertreib.economy.trade.TradeOffer;
import zeitvertreib.economy.trade.TradeOfferManager;

public final class EconomyCommands {
	private static final String CURRENCY_LABEL = "coins";

	private final EconomyConfig config;
	private final CurrencyManager currencyManager;
	private final TradeOfferManager tradeOfferManager;

	public EconomyCommands(EconomyConfig config, CurrencyManager currencyManager, TradeOfferManager tradeOfferManager) {
		this.config = config;
		this.currencyManager = currencyManager;
		this.tradeOfferManager = tradeOfferManager;
	}

	public void register(CommandDispatcher<CommandSourceStack> dispatcher, CommandBuildContext registryAccess, Commands.CommandSelection environment) {
		dispatcher.register(Commands.literal("zv")
			.then(Commands.literal("trade")
				.then(Commands.argument("player", EntityArgument.player())
					.then(Commands.argument("price", IntegerArgumentType.integer(1))
						.executes(this::offerTrade)))
				.then(Commands.literal("accept")
					.then(Commands.argument("offerId", StringArgumentType.word())
						.executes(this::acceptTrade)))
				.then(Commands.literal("deny")
					.then(Commands.argument("offerId", StringArgumentType.word())
						.executes(this::denyTrade)))
				.then(Commands.literal("cancel")
					.executes(this::cancelTrade)))
			.then(Commands.literal("balance")
				.executes(this::showOwnBalance)
				.then(Commands.argument("player", EntityArgument.player())
					.executes(this::showTargetBalance))
				.then(Commands.literal("rank")
					.executes(this::showBalanceRank)))
			.then(Commands.literal("help")
				.executes(this::showHelp)));
	}

	private int offerTrade(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		return createTradeOffer(context, false, false);
	}

	private int offerDevTrade(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		return createTradeOffer(context, true, true);
	}

	private int createTradeOffer(CommandContext<CommandSourceStack> context, boolean allowSelfTrade, boolean devMode) throws CommandSyntaxException {
		ServerPlayer seller = context.getSource().getPlayerOrException();
		ServerPlayer buyer = EntityArgument.getPlayer(context, "player");
		int price = IntegerArgumentType.getInteger(context, "price");
		ItemStack heldStack = seller.getMainHandItem();

		if (!allowSelfTrade && seller.getUUID().equals(buyer.getUUID())) {
			context.getSource().sendFailure(Component.literal("You cannot trade with yourself."));
			return 0;
		}

		if (heldStack.isEmpty()) {
			context.getSource().sendFailure(Component.literal("Hold the item you want to sell in your main hand."));
			return 0;
		}

		if (tradeOfferManager.isPlayerBusy(seller.getUUID())) {
			context.getSource().sendFailure(Component.literal("Finish your current trade before creating another one."));
			return 0;
		}

		if (tradeOfferManager.isPlayerBusy(buyer.getUUID())) {
			context.getSource().sendFailure(Component.literal(buyer.getName().getString() + " is already involved in another trade."));
			return 0;
		}

		ItemStack escrowedStack = heldStack.copy();
		seller.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);

		TradeOffer offer = tradeOfferManager.createOffer(seller, buyer, escrowedStack, price, devMode);
		int taxAmount = config.calculateTax(price);
		int sellerProceeds = config.calculateSellerProceeds(price);
		context.getSource().sendSuccess(() -> TradeOfferManager.prefix(offer)
			.append(Component.literal("Trade offer sent to " + buyer.getName().getString() + " for "))
			.append(formatCurrency(price))
			.append(Component.literal(". Tax: "))
			.append(formatCurrency(taxAmount))
			.append(Component.literal(". You will receive "))
			.append(formatCurrency(sellerProceeds))
			.append(Component.literal(". Your item is reserved for 60 seconds.")), false);
		buyer.sendSystemMessage(buildTradeRequestMessage(offer));
		return Command.SINGLE_SUCCESS;
	}

	private int acceptTrade(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer buyer = context.getSource().getPlayerOrException();
		TradeOffer offer = getTradeOffer(context, "offerId");
		if (offer == null) {
			context.getSource().sendFailure(Component.literal("That trade offer is no longer available."));
			return 0;
		}

		if (!buyer.getUUID().equals(offer.buyerId())) {
			context.getSource().sendFailure(Component.literal("That trade offer was not sent to you."));
			return 0;
		}

		ServerPlayer seller = context.getSource().getServer().getPlayerList().getPlayer(offer.sellerId());
		if (seller == null) {
			context.getSource().sendFailure(Component.literal("The seller is no longer online."));
			return 0;
		}

		int buyerBalance = currencyManager.getBalance(context.getSource().getServer(), buyer.getUUID());
		if (buyerBalance < offer.price()) {
			context.getSource().sendFailure(Component.literal("You need ")
				.append(formatCurrency(offer.price()))
				.append(Component.literal(" to accept this trade, but you only have "))
				.append(formatCurrency(buyerBalance))
				.append(Component.literal(".")));
			return 0;
		}

		int taxAmount = config.calculateTax(offer.price());
		int sellerProceeds = config.calculateSellerProceeds(offer.price());

		tradeOfferManager.removeOffer(offer.id());
		if (!currencyManager.withdraw(context.getSource().getServer(), buyer.getUUID(), offer.price())) {
			tradeOfferManager.restoreEscrowToSeller(context.getSource().getServer(), offer);
			context.getSource().sendFailure(TradeOfferManager.prefix(offer)
				.append(Component.literal("The trade could not be completed because the balance changed. The item was returned to the seller.")));
			if (!seller.getUUID().equals(buyer.getUUID())) {
				seller.sendSystemMessage(TradeOfferManager.prefix(offer)
					.append(Component.literal("Trade with " + buyer.getName().getString() + " failed because their balance changed. Your item was returned.")));
			}
			return 0;
		}

		if (sellerProceeds > 0) {
			currencyManager.addBalance(context.getSource().getServer(), seller.getUUID(), sellerProceeds);
		}

		tradeOfferManager.giveEscrowToBuyer(buyer, offer);
		context.getSource().sendSuccess(() -> TradeOfferManager.prefix(offer)
			.append(Component.literal("You bought "))
			.append(TradeOfferManager.describeStack(offer.stack()))
			.append(Component.literal(" from " + offer.sellerName() + " for "))
			.append(formatCurrency(offer.price()))
			.append(Component.literal(". Trade tax: "))
			.append(formatCurrency(taxAmount))
			.append(Component.literal(".")), false);
		if (!seller.getUUID().equals(buyer.getUUID())) {
			seller.sendSystemMessage(TradeOfferManager.prefix(offer)
				.append(Component.literal("Your trade offer to " + buyer.getName().getString() + " was accepted. They bought "))
				.append(TradeOfferManager.describeStack(offer.stack()))
				.append(Component.literal(" for "))
				.append(formatCurrency(offer.price()))
				.append(Component.literal(". Tax: "))
				.append(formatCurrency(taxAmount))
				.append(Component.literal(". You received "))
				.append(formatCurrency(sellerProceeds))
				.append(Component.literal(".")));
		}
		return Command.SINGLE_SUCCESS;
	}

	private int denyTrade(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer buyer = context.getSource().getPlayerOrException();
		TradeOffer offer = getTradeOffer(context, "offerId");
		if (offer == null) {
			context.getSource().sendFailure(Component.literal("That trade offer is no longer available."));
			return 0;
		}

		if (!buyer.getUUID().equals(offer.buyerId())) {
			context.getSource().sendFailure(Component.literal("That trade offer was not sent to you."));
			return 0;
		}

		tradeOfferManager.removeOffer(offer.id());
		tradeOfferManager.restoreEscrowToSeller(context.getSource().getServer(), offer);
		context.getSource().sendSuccess(() -> TradeOfferManager.prefix(offer)
			.append(Component.literal("You denied the trade from " + offer.sellerName() + ".")), false);

		ServerPlayer seller = context.getSource().getServer().getPlayerList().getPlayer(offer.sellerId());
		if (seller != null && !seller.getUUID().equals(buyer.getUUID())) {
			seller.sendSystemMessage(TradeOfferManager.prefix(offer)
				.append(Component.literal("Your trade offer to " + buyer.getName().getString() + " was denied. Your item was returned.")));
		}

		return Command.SINGLE_SUCCESS;
	}

	private int cancelTrade(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer seller = context.getSource().getPlayerOrException();
		TradeOffer offer = tradeOfferManager.getOfferForPlayer(seller.getUUID());
		if (offer == null || !seller.getUUID().equals(offer.sellerId())) {
			context.getSource().sendFailure(Component.literal("You do not have an outgoing trade offer to cancel."));
			return 0;
		}

		tradeOfferManager.removeOffer(offer.id());
		tradeOfferManager.restoreEscrowToSeller(context.getSource().getServer(), offer);
		context.getSource().sendSuccess(() -> TradeOfferManager.prefix(offer)
			.append(Component.literal("Canceled your trade offer to " + offer.buyerName() + ".")), false);

		ServerPlayer buyer = context.getSource().getServer().getPlayerList().getPlayer(offer.buyerId());
		if (buyer != null && !buyer.getUUID().equals(offer.sellerId())) {
			buyer.sendSystemMessage(TradeOfferManager.prefix(offer)
				.append(Component.literal(offer.sellerName() + " canceled their trade offer.")));
		}

		return Command.SINGLE_SUCCESS;
	}

	private int showOwnBalance(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		int balance = currencyManager.getBalance(context.getSource().getServer(), player.getUUID());
		context.getSource().sendSuccess(() -> Component.literal("Your balance: ").append(formatCurrency(balance)), false);
		return Command.SINGLE_SUCCESS;
	}

	private int showTargetBalance(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		int balance = currencyManager.getBalance(context.getSource().getServer(), target.getUUID());
		context.getSource().sendSuccess(() -> Component.literal(target.getName().getString() + " has ").append(formatCurrency(balance)).append(Component.literal(".")), false);
		return Command.SINGLE_SUCCESS;
	}

	private int showBalanceRank(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		var server = context.getSource().getServer();
		var sorted = currencyManager.getSortedBalances(server);
		context.getSource().sendSuccess(() -> Component.literal("--- Balance ranking ---"), false);

		int limit = Math.min(10, sorted.size());
		for (int i = 0; i < limit; i++) {
			var entry = sorted.get(i);
			String playerName;
			var player = server.getPlayerList().getPlayer(entry.getKey());
			if (player != null) {
				playerName = player.getName().getString();
			} else {
				playerName = entry.getKey().toString();
			}
			String line = String.format("%d. %s: %d %s", i + 1, playerName, entry.getValue(), CURRENCY_LABEL);
			context.getSource().sendSuccess(() -> Component.literal(line), false);
		}

		return Command.SINGLE_SUCCESS;
	}

	private int setBalance(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		int amount = IntegerArgumentType.getInteger(context, "amount");
		int updatedBalance = currencyManager.setBalance(context.getSource().getServer(), target.getUUID(), amount);
		context.getSource().sendSuccess(() -> Component.literal("Set " + target.getName().getString() + "'s balance to ").append(formatCurrency(updatedBalance)).append(Component.literal(".")), true);
		target.sendSystemMessage(Component.literal("Your balance was set to ").append(formatCurrency(updatedBalance)).append(Component.literal(".")));
		return Command.SINGLE_SUCCESS;
	}

	private int addBalance(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		int amount = IntegerArgumentType.getInteger(context, "amount");
		int updatedBalance = currencyManager.addBalance(context.getSource().getServer(), target.getUUID(), amount);
		context.getSource().sendSuccess(() -> Component.literal("Added ").append(formatCurrency(amount)).append(Component.literal(" to " + target.getName().getString() + ". New balance: ")).append(formatCurrency(updatedBalance)).append(Component.literal(".")), true);
		target.sendSystemMessage(Component.literal("You received ").append(formatCurrency(amount)).append(Component.literal(". New balance: ")).append(formatCurrency(updatedBalance)).append(Component.literal(".")));
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
		context.getSource().sendSuccess(() -> Component.literal("Removed ").append(formatCurrency(amount)).append(Component.literal(" from " + target.getName().getString() + ". New balance: ")).append(formatCurrency(updatedBalance)).append(Component.literal(".")), true);
		target.sendSystemMessage(Component.literal("Your balance changed. New balance: ").append(formatCurrency(updatedBalance)).append(Component.literal(".")));
		return Command.SINGLE_SUCCESS;
	}

	private int balanceDevAdd(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		int amount = IntegerArgumentType.getInteger(context, "amount");
		int updatedBalance = currencyManager.addBalance(context.getSource().getServer(), player.getUUID(), amount);
		MutableComponent response = Component.literal("[DEV] ").withStyle(ChatFormatting.YELLOW, ChatFormatting.BOLD)
			.append(Component.literal("Added " + amount + " " + CURRENCY_LABEL + ". New balance: "))
			.append(formatCurrency(updatedBalance));
		context.getSource().sendSuccess(() -> response, false);
		return Command.SINGLE_SUCCESS;
	}

	private int showHelp(CommandContext<CommandSourceStack> context) {
		context.getSource().sendSuccess(() -> Component.literal("--- ZeitVertreib Economy Help ---"), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv trade <player> <price> - Send an item trading offer."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv trade accept <offerId> - Accept a trade offer."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv trade deny <offerId> - Deny a trade offer."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv trade cancel - Cancel your outgoing offer."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv balance - Show your balance."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv balance <player> - Admin: view player balance."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv balance rank - Show top 10 richest players."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team create <name> <color> - Create a team (colors: all vanilla Minecraft text colors, e.g. red, dark_red, gold, aqua)."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team invite <player> - Invite someone to your team."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team accept <team> - Accept a pending invite."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team deny <team> - Deny a pending invite."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team kick <player> - Leader: remove a member."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team transfer <player> - Leader: transfer leadership."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team bank deposit <amt> - Deposit to team bank."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team bank withdraw <amt> - Withdraw from team bank."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team info - View team details (leader, members, bank)."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv team leave - Leave your current team."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zv help - Show this help message."), false);
		context.getSource().sendSuccess(() -> Component.literal("/zvdev help - OP-only developer and debugging commands."), false);
		return Command.SINGLE_SUCCESS;
	}

	private TradeOffer getTradeOffer(CommandContext<CommandSourceStack> context, String argumentName) {
		String rawOfferId = StringArgumentType.getString(context, argumentName);
		try {
			return tradeOfferManager.getOffer(UUID.fromString(rawOfferId));
		} catch (IllegalArgumentException exception) {
			return null;
		}
	}

	private MutableComponent buildTradeRequestMessage(TradeOffer offer) {
		int taxAmount = config.calculateTax(offer.price());
		return TradeOfferManager.prefix(offer)
			.append(Component.literal(offer.sellerName() + " wants to sell "))
			.append(TradeOfferManager.describeStack(offer.stack()))
			.append(Component.literal(" for "))
			.append(formatCurrency(offer.price()))
			.append(Component.literal(". Tax: "))
			.append(formatCurrency(taxAmount))
			.append(Component.literal(". "))
			.append(actionButton("Accept", ChatFormatting.GREEN, "/zv trade accept " + offer.id(), "Buy this item"))
			.append(Component.literal(" "))
			.append(actionButton("Deny", ChatFormatting.RED, "/zv trade deny " + offer.id(), "Refuse this trade"));
	}

	private MutableComponent actionButton(String label, ChatFormatting color, String command, String hoverText) {
		return Component.literal("[" + label + "]").withStyle(style -> style
			.withColor(color)
			.withBold(true)
			.withClickEvent(new ClickEvent.RunCommand(command))
			.withHoverEvent(new HoverEvent.ShowText(Component.literal(hoverText))));
	}

	private MutableComponent formatCurrency(int amount) {
		return Component.literal(amount + " " + CURRENCY_LABEL).withStyle(ChatFormatting.GOLD);
	}
}