package zeitvertreib.economy.team;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.ServerScoreboard;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.scores.PlayerTeam;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import zeitvertreib.economy.ZeitvertreibEconomy;

public final class TeamManager {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final String DISPLAY_TEAM_PREFIX = "zvct_";
	public static final long INVITE_TIMEOUT_MILLIS = 60_000L;

	private final Map<String, TeamData> teamsByName = new HashMap<>();
	private final Map<UUID, String> playerTeams = new HashMap<>();
	private final Map<UUID, TeamInvite> pendingInvites = new HashMap<>();
	private boolean loaded;

	public void reset() {
		teamsByName.clear();
		playerTeams.clear();
		pendingInvites.clear();
		loaded = false;
	}

	public void load(MinecraftServer server) {
		ensureLoaded(server);
		clearManagedDisplayTeams(server);
	}

	public TeamData getTeam(MinecraftServer server, String teamName) {
		ensureLoaded(server);
		return teamsByName.get(normalizeTeamName(teamName));
	}

	public TeamData getTeamForPlayer(MinecraftServer server, UUID playerId) {
		ensureLoaded(server);
		String teamName = playerTeams.get(playerId);
		return teamName == null ? null : teamsByName.get(teamName);
	}

	public Collection<TeamData> getTeams(MinecraftServer server) {
		ensureLoaded(server);
		return List.copyOf(teamsByName.values());
	}

	public boolean isLeader(TeamData team, UUID playerId) {
		return team != null && playerId.equals(team.leaderId());
	}

	public TeamData createTeam(MinecraftServer server, ServerPlayer leader, String teamName, ChatFormatting color) {
		ensureLoaded(server);
		String normalizedName = normalizeTeamName(teamName);
		TeamData team = new TeamData(normalizedName, color.getName(), leader.getUUID());
		teamsByName.put(normalizedName, team);
		playerTeams.put(leader.getUUID(), normalizedName);
		pendingInvites.remove(leader.getUUID());
		save(server);
		syncDisplays(server);
		return team;
	}

	public TeamInvite invitePlayer(MinecraftServer server, TeamData team, ServerPlayer inviter, ServerPlayer target) {
		ensureLoaded(server);
		TeamInvite invite = new TeamInvite(team.name(), inviter.getName().getString(), System.currentTimeMillis() + INVITE_TIMEOUT_MILLIS);
		pendingInvites.put(target.getUUID(), invite);
		return invite;
	}

	public TeamInvite getInvite(MinecraftServer server, UUID playerId) {
		ensureLoaded(server);
		TeamInvite invite = pendingInvites.get(playerId);
		if (invite != null && invite.expiresAtMillis() <= System.currentTimeMillis()) {
			pendingInvites.remove(playerId);
			return null;
		}
		return invite;
	}

	public TeamData acceptInvite(MinecraftServer server, ServerPlayer player, String teamName) {
		ensureLoaded(server);
		TeamInvite invite = getInvite(server, player.getUUID());
		String normalizedTeamName = normalizeTeamName(teamName);
		if (invite == null || !invite.teamName().equals(normalizedTeamName)) {
			return null;
		}

		TeamData team = teamsByName.get(normalizedTeamName);
		if (team == null || playerTeams.containsKey(player.getUUID())) {
			pendingInvites.remove(player.getUUID());
			return null;
		}

		team.addMember(player.getUUID());
		playerTeams.put(player.getUUID(), team.name());
		pendingInvites.remove(player.getUUID());
		save(server);
		syncDisplays(server);
		return team;
	}

	public TeamInvite denyInvite(MinecraftServer server, UUID playerId, String teamName) {
		ensureLoaded(server);
		TeamInvite invite = getInvite(server, playerId);
		if (invite == null || !invite.teamName().equals(normalizeTeamName(teamName))) {
			return null;
		}

		pendingInvites.remove(playerId);
		return invite;
	}

	public void kickMember(MinecraftServer server, TeamData team, UUID playerId) {
		ensureLoaded(server);
		team.removeMember(playerId);
		playerTeams.remove(playerId);
		pendingInvites.remove(playerId);
		if (team.memberIds().isEmpty()) {
			teamsByName.remove(team.name());
		} else if (team.leaderId().equals(playerId)) {
			// This should not happen via normal kick; leave command handles leader transfer.
		}
		save(server);
		syncDisplays(server);
	}

	public TeamData removePlayerFromTeam(MinecraftServer server, UUID playerId) {
		ensureLoaded(server);
		String teamName = playerTeams.get(playerId);
		if (teamName == null) {
			return null;
		}

		TeamData team = teamsByName.get(teamName);
		if (team == null) {
			playerTeams.remove(playerId);
			return null;
		}

		team.removeMember(playerId);
		playerTeams.remove(playerId);
		pendingInvites.remove(playerId);
		if (team.memberIds().isEmpty()) {
			teamsByName.remove(team.name());
		} else if (team.leaderId().equals(playerId)) {
			UUID nextLeaderId = team.memberIds().iterator().next();
			team.transferLeadership(nextLeaderId);
		}

		save(server);
		syncDisplays(server);
		return team;
	}

	public TeamData forceJoinTeam(MinecraftServer server, TeamData team, ServerPlayer player) {
		ensureLoaded(server);
		TeamData currentTeam = getTeamForPlayer(server, player.getUUID());
		if (currentTeam != null && currentTeam.name().equals(team.name())) {
			return team;
		}

		if (currentTeam != null) {
			removePlayerFromTeam(server, player.getUUID());
		}

		team.addMember(player.getUUID());
		playerTeams.put(player.getUUID(), team.name());
		pendingInvites.remove(player.getUUID());
		save(server);
		syncDisplays(server);
		return team;
	}

	public boolean disbandTeam(MinecraftServer server, String teamName) {
		ensureLoaded(server);
		TeamData team = teamsByName.remove(normalizeTeamName(teamName));
		if (team == null) {
			return false;
		}

		for (UUID memberId : team.memberIds()) {
			playerTeams.remove(memberId);
		}
		pendingInvites.entrySet().removeIf(entry -> team.name().equals(entry.getValue().teamName()));
		save(server);
		syncDisplays(server);
		return true;
	}

	public boolean setTeamLeader(MinecraftServer server, TeamData team, UUID newLeaderId) {
		ensureLoaded(server);
		if (!team.hasMember(newLeaderId)) {
			return false;
		}

		team.transferLeadership(newLeaderId);
		save(server);
		syncDisplays(server);
		return true;
	}

	public int setBankBalance(MinecraftServer server, TeamData team, int amount) {
		ensureLoaded(server);
		team.setBankBalance(amount);
		save(server);
		return team.bankBalance();
	}

	public void goOfflineAndRemoveFromTeam(MinecraftServer server, UUID playerId) {
		ensureLoaded(server);
		String teamName = playerTeams.get(playerId);
		if (teamName == null) {
			return;
		}
		TeamData team = teamsByName.get(teamName);
		if (team == null) {
			playerTeams.remove(playerId);
			return;
		}
		team.removeMember(playerId);
		playerTeams.remove(playerId);
		pendingInvites.remove(playerId);
		if (team.memberIds().isEmpty()) {
			teamsByName.remove(team.name());
		}
		save(server);
		syncDisplays(server);
	}

	public void transferLeadership(MinecraftServer server, TeamData team, UUID newLeaderId) {
		ensureLoaded(server);
		team.transferLeadership(newLeaderId);
		save(server);
		syncDisplays(server);
	}

	public void depositToBank(MinecraftServer server, TeamData team, int amount) {
		ensureLoaded(server);
		team.depositToBank(amount);
		save(server);
	}

	public boolean withdrawFromBank(MinecraftServer server, TeamData team, int amount) {
		ensureLoaded(server);
		if (!team.canWithdrawFromBank(amount)) {
			return false;
		}

		team.withdrawFromBank(amount);
		save(server);
		return true;
	}

	public void cleanupExpiredInvites(MinecraftServer server) {
		if (!loaded || pendingInvites.isEmpty()) {
			return;
		}

		long now = System.currentTimeMillis();
		List<UUID> expiredPlayerIds = new ArrayList<>();
		for (Map.Entry<UUID, TeamInvite> entry : pendingInvites.entrySet()) {
			if (entry.getValue().expiresAtMillis() <= now) {
				expiredPlayerIds.add(entry.getKey());
			}
		}

		for (UUID playerId : expiredPlayerIds) {
			TeamInvite invite = pendingInvites.remove(playerId);
			if (invite == null) {
				continue;
			}

			ServerPlayer player = server.getPlayerList().getPlayer(playerId);
			if (player != null) {
				player.sendSystemMessage(Component.literal("Your team invite to [" + invite.teamName() + "] expired."));
			}
		}
	}

	public void syncDisplays(MinecraftServer server) {
		ensureLoaded(server);
		clearManagedDisplayTeams(server);

		ServerScoreboard scoreboard = server.getScoreboard();
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			TeamData team = getTeamForPlayer(server, player.getUUID());
			if (team == null) {
				continue;
			}

			PlayerTeam displayTeam = scoreboard.addPlayerTeam(getDisplayTeamName(player.getUUID()));
			displayTeam.setDisplayName(Component.literal(team.name()));
			displayTeam.setColor(ChatFormatting.WHITE);
			displayTeam.setPlayerPrefix(buildPlayerPrefix(team, player.getUUID().equals(team.leaderId())));
			scoreboard.addPlayerToTeam(player.getScoreboardName(), displayTeam);
		}
	}

	public void clearDisplayForPlayer(MinecraftServer server, ServerPlayer player) {
		ServerScoreboard scoreboard = server.getScoreboard();
		PlayerTeam displayTeam = scoreboard.getPlayerTeam(getDisplayTeamName(player.getUUID()));
		if (displayTeam != null) {
			scoreboard.removePlayerTeam(displayTeam);
		}
	}

	public MutableComponent describeTeam(TeamData team) {
		return Component.literal("[" + team.name() + "]").withStyle(team.color());
	}

	public static String normalizeTeamName(String teamName) {
		return teamName.toLowerCase(Locale.ROOT);
	}

	private void ensureLoaded(MinecraftServer server) {
		if (loaded) {
			return;
		}

		teamsByName.clear();
		playerTeams.clear();
		pendingInvites.clear();

		Path filePath = getFilePath(server);
		if (!Files.exists(filePath)) {
			loaded = true;
			save(server);
			return;
		}

		try {
			String rawJson = Files.readString(filePath, StandardCharsets.UTF_8);
			SavedData savedData = GSON.fromJson(rawJson, SavedData.class);
			if (savedData != null && savedData.teams != null) {
				for (SavedTeam savedTeam : savedData.teams) {
					if (savedTeam == null || savedTeam.name == null || savedTeam.colorName == null || savedTeam.leaderId == null) {
						continue;
					}

					String normalizedName = normalizeTeamName(savedTeam.name);
					ChatFormatting color = ChatFormatting.getByName(savedTeam.colorName);
					if (normalizedName.isBlank() || normalizedName.length() > 5 || color == null || !color.isColor()) {
						continue;
					}

					TeamData team = new TeamData(
						normalizedName,
						color.getName(),
						savedTeam.leaderId,
						savedTeam.members,
						savedTeam.bankBalance
					);

					teamsByName.put(team.name(), team);
					for (UUID memberId : team.memberIds()) {
						playerTeams.putIfAbsent(memberId, team.name());
					}
				}
			}
		} catch (IOException exception) {
			ZeitvertreibEconomy.LOGGER.error("Failed to load teams from {}", filePath, exception);
		}

		loaded = true;
	}

	private void save(MinecraftServer server) {
		SavedData savedData = new SavedData();
		for (TeamData team : teamsByName.values()) {
			SavedTeam savedTeam = new SavedTeam();
			savedTeam.name = team.name();
			savedTeam.colorName = team.colorName();
			savedTeam.leaderId = team.leaderId();
			savedTeam.bankBalance = team.bankBalance();
			savedTeam.members = new ArrayList<>(team.memberIds());
			savedData.teams.add(savedTeam);
		}

		Path filePath = getFilePath(server);
		try {
			Files.createDirectories(filePath.getParent());
			Files.writeString(filePath, GSON.toJson(savedData), StandardCharsets.UTF_8);
		} catch (IOException exception) {
			ZeitvertreibEconomy.LOGGER.error("Failed to save teams to {}", filePath, exception);
		}
	}

	private Path getFilePath(MinecraftServer server) {
		return server.getWorldPath(LevelResource.ROOT).resolve("zeitvertreib-economy-teams.json");
	}

	private void clearManagedDisplayTeams(MinecraftServer server) {
		ServerScoreboard scoreboard = server.getScoreboard();
		List<PlayerTeam> teamsToRemove = new ArrayList<>();
		for (PlayerTeam team : scoreboard.getPlayerTeams()) {
			if (team.getName().startsWith(DISPLAY_TEAM_PREFIX)) {
				teamsToRemove.add(team);
			}
		}

		for (PlayerTeam team : teamsToRemove) {
			scoreboard.removePlayerTeam(team);
		}
	}

	private String getDisplayTeamName(UUID playerId) {
		String compactUuid = playerId.toString().replace("-", "");
		return DISPLAY_TEAM_PREFIX + compactUuid.substring(0, 10);
	}

	private MutableComponent buildPlayerPrefix(TeamData team, boolean leader) {
		if (leader) {
			return Component.empty()
				.append(Component.literal("[").withStyle(ChatFormatting.GOLD))
				.append(Component.literal(team.name()).withStyle(team.color()))
				.append(Component.literal("] ").withStyle(ChatFormatting.GOLD));
		}

		return Component.literal("[" + team.name() + "] ").withStyle(team.color());
	}

	private static final class SavedData {
		private List<SavedTeam> teams = new ArrayList<>();
	}

	private static final class SavedTeam {
		private String name;
		private String colorName;
		private UUID leaderId;
		private int bankBalance;
		private List<UUID> members = new ArrayList<>();
	}
}