package zeitvertreib.economy.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import zeitvertreib.economy.ZeitvertreibEconomy;

public final class EconomyConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final double DEFAULT_TRADE_TAX_PERCENT = 5.0D;

	private double tradeTaxPercent = DEFAULT_TRADE_TAX_PERCENT;

	public void load() {
		Path configPath = getConfigPath();

		if (!Files.exists(configPath)) {
			tradeTaxPercent = DEFAULT_TRADE_TAX_PERCENT;
			save(configPath);
			return;
		}

		try {
			String rawJson = Files.readString(configPath, StandardCharsets.UTF_8);
			JsonObject jsonObject = JsonParser.parseString(rawJson).getAsJsonObject();
			tradeTaxPercent = jsonObject.has("tradeTaxPercent") ? jsonObject.get("tradeTaxPercent").getAsDouble() : DEFAULT_TRADE_TAX_PERCENT;
			sanitize();
			save(configPath);
		} catch (Exception exception) {
			tradeTaxPercent = DEFAULT_TRADE_TAX_PERCENT;
			ZeitvertreibEconomy.LOGGER.error("Failed to load config from {}. Falling back to defaults.", configPath, exception);
			save(configPath);
		}
	}

	public double getTradeTaxPercent() {
		return tradeTaxPercent;
	}

	public int calculateTax(int grossPrice) {
		if (grossPrice <= 0) {
			return 0;
		}

		int taxAmount = (int) Math.round(grossPrice * (tradeTaxPercent / 100.0D));
		return Math.max(0, Math.min(grossPrice, taxAmount));
	}

	public int calculateSellerProceeds(int grossPrice) {
		return Math.max(0, grossPrice - calculateTax(grossPrice));
	}

	public Path getConfigPath() {
		return FabricLoader.getInstance().getConfigDir().resolve("zeitvertreib-economy.json");
	}

	private void sanitize() {
		if (Double.isNaN(tradeTaxPercent) || Double.isInfinite(tradeTaxPercent)) {
			tradeTaxPercent = DEFAULT_TRADE_TAX_PERCENT;
		}

		tradeTaxPercent = Math.max(0.0D, Math.min(100.0D, tradeTaxPercent));
	}

	private void save(Path configPath) {
		JsonObject jsonObject = new JsonObject();
		jsonObject.addProperty("tradeTaxPercent", tradeTaxPercent);

		try {
			Files.createDirectories(configPath.getParent());
			Files.writeString(configPath, GSON.toJson(jsonObject), StandardCharsets.UTF_8);
		} catch (IOException exception) {
			ZeitvertreibEconomy.LOGGER.error("Failed to save config to {}", configPath, exception);
		}
	}
}