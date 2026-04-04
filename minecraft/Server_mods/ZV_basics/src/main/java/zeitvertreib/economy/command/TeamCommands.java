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

import java.util.Locale;
import java.util.UUID;

import zeitvertreib.economy.currency.CurrencyManager;
import zeitvertreib.economy.team.TeamData;
import zeitvertreib.economy.team.TeamInvite;
import zeitvertreib.economy.team.TeamManager;

public final class TeamCommands {
	private static final String CURRENCY_LABEL = "coins";

	private final CurrencyManager currencyManager;
	private final TeamManager teamManager;

	public TeamCommands(CurrencyManager currencyManager, TeamManager teamManager) {
		this.currencyManager = currencyManager;
		this.teamManager = teamManager;
	}

	public void register(CommandDispatcher<CommandSourceStack> dispatcher, CommandBuildContext registryAccess, Commands.CommandSelection environment) {
		dispatcher.register(Commands.literal("zv")
			.then(Commands.literal("team")
				.then(Commands.literal("create")
					.then(Commands.argument("name", StringArgumentType.word())
						.then(Commands.argument("color", StringArgumentType.word())
							.executes(this::createTeam))))
				.then(Commands.literal("info")
					.executes(this::teamInfo))
				.then(Commands.literal("leave")
					.executes(this::leaveTeam))
				.then(Commands.literal("invite")
					.then(Commands.argument("player", EntityArgument.player())
						.executes(this::invitePlayer)))
				.then(Commands.literal("accept")
					.then(Commands.argument("team", StringArgumentType.word())
						.executes(this::acceptInvite)))
				.then(Commands.literal("deny")
					.then(Commands.argument("team", StringArgumentType.word())
						.executes(this::denyInvite)))
				.then(Commands.literal("kick")
					.then(Commands.argument("player", EntityArgument.player())
						.executes(this::kickPlayer)))
				.then(Commands.literal("transfer")
					.then(Commands.argument("player", EntityArgument.player())
						.executes(this::transferLeadership)))
				.then(Commands.literal("bank")
					.then(Commands.literal("deposit")
						.then(Commands.argument("amount", IntegerArgumentType.integer(1))
							.executes(this::depositToBank)))
					.then(Commands.literal("withdraw")
						.then(Commands.argument("amount", IntegerArgumentType.integer(1))
							.executes(this::withdrawFromBank))))));
	}

	private int createTeam(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		if (teamManager.getTeamForPlayer(context.getSource().getServer(), player.getUUID()) != null) {
			context.getSource().sendFailure(Component.literal("You are already in a team."));
			return 0;
		}

		String rawName = StringArgumentType.getString(context, "name");
		if (!rawName.matches("(?i)[a-z]{1,5}")) {
			context.getSource().sendFailure(Component.literal("Team names must be letters only and 5 characters max."));
			return 0;
		}

		ChatFormatting color = parseColor(StringArgumentType.getString(context, "color"));
		if (color == null) {
			context.getSource().sendFailure(Component.literal("Invalid team color. Use a vanilla text color, e.g. " + listSupportedColors() + "."));
			return 0;
		}

		String normalizedName = TeamManager.normalizeTeamName(rawName);
		if (teamManager.getTeam(context.getSource().getServer(), normalizedName) != null) {
			context.getSource().sendFailure(Component.literal("That team name is already taken."));
			return 0;
		}

		TeamData team = teamManager.createTeam(context.getSource().getServer(), player, normalizedName, color);
		MutableComponent message = Component.literal("Created team ")
			.append(teamManager.describeTeam(team))
			.append(Component.literal(". You are now the team leader."));
		context.getSource().sendSuccess(() -> message, false);
		return Command.SINGLE_SUCCESS;
	}

	private int invitePlayer(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer leader = context.getSource().getPlayerOrException();
		TeamData team = requireLeaderTeam(context, leader);
		if (team == null) {
			return 0;
		}

		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		if (leader.getUUID().equals(target.getUUID())) {
			context.getSource().sendFailure(Component.literal("You cannot invite yourself."));
			return 0;
		}

		if (team.hasMember(target.getUUID())) {
			context.getSource().sendFailure(Component.literal(target.getName().getString() + " is already in your team."));
			return 0;
		}

		if (teamManager.getTeamForPlayer(context.getSource().getServer(), target.getUUID()) != null) {
			context.getSource().sendFailure(Component.literal(target.getName().getString() + " is already in another team."));
			return 0;
		}

		teamManager.invitePlayer(context.getSource().getServer(), team, leader, target);
		context.getSource().sendSuccess(() -> Component.literal("Sent a team invite to " + target.getName().getString() + "."), false);
		target.sendSystemMessage(buildInviteMessage(team, leader.getName().getString()));
		return Command.SINGLE_SUCCESS;
	}

	private int acceptInvite(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		if (teamManager.getTeamForPlayer(context.getSource().getServer(), player.getUUID()) != null) {
			context.getSource().sendFailure(Component.literal("Leave your current team before accepting another invite."));
			return 0;
		}

		String teamName = TeamManager.normalizeTeamName(StringArgumentType.getString(context, "team"));
		TeamInvite invite = teamManager.getInvite(context.getSource().getServer(), player.getUUID());
		if (invite == null || !invite.teamName().equals(teamName)) {
			context.getSource().sendFailure(Component.literal("You do not have a pending invite for that team."));
			return 0;
		}

		TeamData team = teamManager.acceptInvite(context.getSource().getServer(), player, teamName);
		if (team == null) {
			context.getSource().sendFailure(Component.literal("That invite is no longer valid."));
			return 0;
		}

		MutableComponent joinedMessage = Component.literal("You joined team ").append(teamManager.describeTeam(team)).append(Component.literal("."));
		context.getSource().sendSuccess(() -> joinedMessage, false);

		ServerPlayer leader = context.getSource().getServer().getPlayerList().getPlayer(team.leaderId());
		if (leader != null && !leader.getUUID().equals(player.getUUID())) {
			leader.sendSystemMessage(Component.literal(player.getName().getString() + " joined your team ").append(teamManager.describeTeam(team)).append(Component.literal(".")));
		}
		return Command.SINGLE_SUCCESS;
	}

	private int denyInvite(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		String teamName = TeamManager.normalizeTeamName(StringArgumentType.getString(context, "team"));
		TeamInvite invite = teamManager.denyInvite(context.getSource().getServer(), player.getUUID(), teamName);
		if (invite == null) {
			context.getSource().sendFailure(Component.literal("You do not have a pending invite for that team."));
			return 0;
		}

		context.getSource().sendSuccess(() -> Component.literal("Denied the invite to [" + invite.teamName() + "]."), false);
		TeamData team = teamManager.getTeam(context.getSource().getServer(), invite.teamName());
		if (team != null) {
			ServerPlayer leader = context.getSource().getServer().getPlayerList().getPlayer(team.leaderId());
			if (leader != null && !leader.getUUID().equals(player.getUUID())) {
				leader.sendSystemMessage(Component.literal(player.getName().getString() + " denied your invite to ").append(teamManager.describeTeam(team)).append(Component.literal(".")));
			}
		}
		return Command.SINGLE_SUCCESS;
	}

	private int kickPlayer(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer leader = context.getSource().getPlayerOrException();
		TeamData team = requireLeaderTeam(context, leader);
		if (team == null) {
			return 0;
		}

		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		if (leader.getUUID().equals(target.getUUID())) {
			context.getSource().sendFailure(Component.literal("Use leadership transfer before removing yourself from the team."));
			return 0;
		}

		if (!team.hasMember(target.getUUID())) {
			context.getSource().sendFailure(Component.literal(target.getName().getString() + " is not in your team."));
			return 0;
		}

		teamManager.kickMember(context.getSource().getServer(), team, target.getUUID());
		context.getSource().sendSuccess(() -> Component.literal("Removed " + target.getName().getString() + " from ").append(teamManager.describeTeam(team)).append(Component.literal(".")), false);
		target.sendSystemMessage(Component.literal("You were removed from team ").append(teamManager.describeTeam(team)).append(Component.literal(".")));
		return Command.SINGLE_SUCCESS;
	}

	private int transferLeadership(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer leader = context.getSource().getPlayerOrException();
		TeamData team = requireLeaderTeam(context, leader);
		if (team == null) {
			return 0;
		}

		ServerPlayer target = EntityArgument.getPlayer(context, "player");
		if (leader.getUUID().equals(target.getUUID())) {
			context.getSource().sendFailure(Component.literal("You already lead this team."));
			return 0;
		}

		if (!team.hasMember(target.getUUID())) {
			context.getSource().sendFailure(Component.literal(target.getName().getString() + " is not in your team."));
			return 0;
		}

		teamManager.transferLeadership(context.getSource().getServer(), team, target.getUUID());
		context.getSource().sendSuccess(() -> Component.literal("Transferred team leadership to " + target.getName().getString() + "."), false);
		target.sendSystemMessage(Component.literal("You are now the leader of team ").append(teamManager.describeTeam(team)).append(Component.literal(".")));
		return Command.SINGLE_SUCCESS;
	}

	private int depositToBank(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		TeamData team = requirePlayerTeam(context, player);
		if (team == null) {
			return 0;
		}

		int amount = IntegerArgumentType.getInteger(context, "amount");
		if (!currencyManager.withdraw(context.getSource().getServer(), player.getUUID(), amount)) {
			context.getSource().sendFailure(Component.literal("You do not have enough coins to deposit that amount."));
			return 0;
		}

		teamManager.depositToBank(context.getSource().getServer(), team, amount);
		MutableComponent response = Component.literal("Deposited ")
			.append(formatCurrency(amount))
			.append(Component.literal(" into team bank. New team bank balance: "))
			.append(formatCurrency(team.bankBalance()))
			.append(Component.literal("."));
		context.getSource().sendSuccess(() -> response, false);
		return Command.SINGLE_SUCCESS;
	}

	private int withdrawFromBank(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		TeamData team = requirePlayerTeam(context, player);
		if (team == null) {
			return 0;
		}

		int amount = IntegerArgumentType.getInteger(context, "amount");
		if (!teamManager.withdrawFromBank(context.getSource().getServer(), team, amount)) {
			context.getSource().sendFailure(Component.literal("Your team bank does not have enough coins."));
			return 0;
		}

		currencyManager.addBalance(context.getSource().getServer(), player.getUUID(), amount);
		MutableComponent response = Component.literal("Withdrew ")
			.append(formatCurrency(amount))
			.append(Component.literal(" from team bank. New team bank balance: "))
			.append(formatCurrency(team.bankBalance()))
			.append(Component.literal("."));
		context.getSource().sendSuccess(() -> response, false);
		return Command.SINGLE_SUCCESS;
	}

	private TeamData requirePlayerTeam(CommandContext<CommandSourceStack> context, ServerPlayer player) {
		TeamData team = teamManager.getTeamForPlayer(context.getSource().getServer(), player.getUUID());
		if (team == null) {
			context.getSource().sendFailure(Component.literal("You are not in a team."));
		}
		return team;
	}

	private int teamInfo(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		TeamData team = requirePlayerTeam(context, player);
		if (team == null) {
			return 0;
		}

		var server = context.getSource().getServer();
		ServerPlayer leader = server.getPlayerList().getPlayer(team.leaderId());
		String leaderName = leader != null ? leader.getName().getString() : team.leaderId().toString();

		MutableComponent members = Component.literal("");
		for (UUID memberId : team.memberIds()) {
			ServerPlayer member = server.getPlayerList().getPlayer(memberId);
			String name = member != null ? member.getName().getString() : memberId.toString();
			if (!members.getString().isEmpty()) {
				members.append(Component.literal(", "));
			}
			members.append(Component.literal(name));
		}

		MutableComponent message = Component.literal("Team: ")
			.append(teamManager.describeTeam(team))
			.append(Component.literal("\nLeader: " + leaderName))
			.append(Component.literal("\nMembers: "))
			.append(members)
			.append(Component.literal("\nBank: "))
			.append(formatCurrency(team.bankBalance()));

		context.getSource().sendSuccess(() -> message, false);
		return Command.SINGLE_SUCCESS;
	}

	private int leaveTeam(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		TeamData team = requirePlayerTeam(context, player);
		if (team == null) {
			return 0;
		}

		if (teamManager.isLeader(team, player.getUUID())) {
			if (team.memberIds().size() > 1) {
				context.getSource().sendFailure(Component.literal("Transfer leadership before you can leave the team."));
				return 0;
			}

			teamManager.kickMember(context.getSource().getServer(), team, player.getUUID());
			context.getSource().sendSuccess(() -> Component.literal("You left and disbanded team ").append(teamManager.describeTeam(team)).append(Component.literal(".")), false);
			return Command.SINGLE_SUCCESS;
		}

		teamManager.kickMember(context.getSource().getServer(), team, player.getUUID());
		context.getSource().sendSuccess(() -> Component.literal("You left team ").append(teamManager.describeTeam(team)).append(Component.literal(".")), false);

		ServerPlayer leader = context.getSource().getServer().getPlayerList().getPlayer(team.leaderId());
		if (leader != null) {
			leader.sendSystemMessage(Component.literal(player.getName().getString() + " left your team ").append(teamManager.describeTeam(team)).append(Component.literal(".")));
		}

		return Command.SINGLE_SUCCESS;
	}

	private TeamData requireLeaderTeam(CommandContext<CommandSourceStack> context, ServerPlayer player) {
		TeamData team = requirePlayerTeam(context, player);
		if (team == null) {
			return null;
		}

		if (!teamManager.isLeader(team, player.getUUID())) {
			context.getSource().sendFailure(Component.literal("Only the team leader can use that command."));
			return null;
		}
		return team;
	}

	private MutableComponent buildInviteMessage(TeamData team, String inviterName) {
		return Component.literal(inviterName + " invited you to join ")
			.append(teamManager.describeTeam(team))
			.append(Component.literal(". "))
			.append(actionButton("Accept", ChatFormatting.GREEN, "/zv team accept " + team.name(), "Join this team"))
			.append(Component.literal(" "))
			.append(actionButton("Deny", ChatFormatting.RED, "/zv team deny " + team.name(), "Decline this invite"));
	}

	private MutableComponent actionButton(String label, ChatFormatting color, String command, String hoverText) {
		return Component.literal("[" + label + "]").withStyle(style -> style
			.withColor(color)
			.withClickEvent(new ClickEvent.RunCommand(command))
			.withHoverEvent(new HoverEvent.ShowText(Component.literal(hoverText))));
	}

	private MutableComponent formatCurrency(int amount) {
		return Component.literal(amount + " " + CURRENCY_LABEL).withStyle(ChatFormatting.GOLD);
	}

	private ChatFormatting parseColor(String rawColor) {
		String normalized = rawColor.trim().toLowerCase(Locale.ROOT).replace(' ', '_');
		ChatFormatting color = ChatFormatting.getByName(normalized);
		if (color != null && color.isColor()) {
			return color;
		}

		// Support common color aliases (e.g. "dark red" -> DARK_RED)
		for (ChatFormatting candidate : ChatFormatting.values()) {
			if (!candidate.isColor()) continue;
			if (candidate.getName().equalsIgnoreCase(normalized)) {
				return candidate;
			}
		}

		return null;
	}

	private String listSupportedColors() {
		StringBuilder builder = new StringBuilder();
		for (ChatFormatting color : ChatFormatting.values()) {
			if (!color.isColor()) {
				continue;
			}
			if (builder.length() > 0) {
				builder.append(", ");
			}
			builder.append(color.getName());
		}
		return builder.toString();
	}
}