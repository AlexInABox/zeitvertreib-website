package zeitvertreib.economy.currency;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.storage.LevelResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import zeitvertreib.economy.ZeitvertreibEconomy;

public final class CurrencyManager {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	private final Map<UUID, Integer> balances = new HashMap<>();
	private boolean loaded;

	public void reset() {
		balances.clear();
		loaded = false;
	}

	public int getBalance(MinecraftServer server, UUID playerId) {
		ensureLoaded(server);
		return balances.getOrDefault(playerId, 0);
	}

	public boolean hasBalance(MinecraftServer server, UUID playerId, int amount) {
		return getBalance(server, playerId) >= amount;
	}

	public int setBalance(MinecraftServer server, UUID playerId, int amount) {
		ensureLoaded(server);
		int sanitizedAmount = Math.max(0, amount);
		balances.put(playerId, sanitizedAmount);
		save(server);
		return sanitizedAmount;
	}

	public int addBalance(MinecraftServer server, UUID playerId, int amount) {
		ensureLoaded(server);
		int updatedBalance = Math.max(0, getBalance(server, playerId) + amount);
		balances.put(playerId, updatedBalance);
		save(server);
		return updatedBalance;
	}

	public boolean withdraw(MinecraftServer server, UUID playerId, int amount) {
		ensureLoaded(server);
		if (amount < 1) {
			return false;
		}

		int currentBalance = getBalance(server, playerId);
		if (currentBalance < amount) {
			return false;
		}

		balances.put(playerId, currentBalance - amount);
		save(server);
		return true;
	}

	public boolean transfer(MinecraftServer server, UUID fromPlayerId, UUID toPlayerId, int amount) {
		ensureLoaded(server);
		if (amount < 1) {
			return false;
		}

		int senderBalance = getBalance(server, fromPlayerId);
		if (senderBalance < amount) {
			return false;
		}

		balances.put(fromPlayerId, senderBalance - amount);
		balances.put(toPlayerId, getBalance(server, toPlayerId) + amount);
		save(server);
		return true;
	}

	public java.util.List<java.util.Map.Entry<UUID, Integer>> getSortedBalances(MinecraftServer server) {
		ensureLoaded(server);
		java.util.List<java.util.Map.Entry<UUID, Integer>> entries = new java.util.ArrayList<>(balances.entrySet());
		entries.sort((a, b) -> Integer.compare(b.getValue(), a.getValue()));
		return entries;
	}

	private void ensureLoaded(MinecraftServer server) {
		if (loaded) {
			return;
		}

		Path filePath = getFilePath(server);
		if (!Files.exists(filePath)) {
			loaded = true;
			return;
		}

		try {
			String rawJson = Files.readString(filePath, StandardCharsets.UTF_8);
			JsonElement jsonElement = JsonParser.parseString(rawJson);
			if (jsonElement.isJsonObject()) {
				JsonObject jsonObject = jsonElement.getAsJsonObject();
				for (Map.Entry<String, JsonElement> entry : jsonObject.entrySet()) {
					try {
						UUID playerId = UUID.fromString(entry.getKey());
						balances.put(playerId, Math.max(0, entry.getValue().getAsInt()));
					} catch (IllegalArgumentException exception) {
						ZeitvertreibEconomy.LOGGER.warn("Skipping invalid balance entry for {}", entry.getKey());
					}
				}
			}
		} catch (IOException exception) {
			ZeitvertreibEconomy.LOGGER.error("Failed to load balances from {}", filePath, exception);
		}

		loaded = true;
	}

	private void save(MinecraftServer server) {
		Path filePath = getFilePath(server);
		JsonObject jsonObject = new JsonObject();

		for (Map.Entry<UUID, Integer> entry : balances.entrySet()) {
			jsonObject.addProperty(entry.getKey().toString(), Math.max(0, entry.getValue()));
		}

		try {
			Files.createDirectories(filePath.getParent());
			Files.writeString(filePath, GSON.toJson(jsonObject), StandardCharsets.UTF_8);
		} catch (IOException exception) {
			ZeitvertreibEconomy.LOGGER.error("Failed to save balances to {}", filePath, exception);
		}
	}

	private Path getFilePath(MinecraftServer server) {
		return server.getWorldPath(LevelResource.ROOT).resolve("zeitvertreib-economy-balances.json");
	}
}