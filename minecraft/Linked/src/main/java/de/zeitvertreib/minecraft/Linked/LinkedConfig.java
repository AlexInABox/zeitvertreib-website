package de.zeitvertreib.minecraft.Linked;

import com.electronwill.nightconfig.core.file.CommentedFileConfig;
import net.fabricmc.loader.api.FabricLoader;
import org.slf4j.Logger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class LinkedConfig {
    private static final String FILE_NAME = "zeitvertreib-linked.toml";
    private static final String DEFAULT_API_BASE_URL = "https://zeitvertreib.vip/api";

    private final String apiBaseUrl;
    private final String minecraftApiKey;

    private LinkedConfig(String apiBaseUrl, String minecraftApiKey) {
        this.apiBaseUrl = apiBaseUrl;
        this.minecraftApiKey = minecraftApiKey;
    }

    public static LinkedConfig load(Logger logger) {
        Path configDir = FabricLoader.getInstance().getConfigDir();
        Path configPath = configDir.resolve(FILE_NAME);

        try {
            Files.createDirectories(configDir);

            CommentedFileConfig config = CommentedFileConfig.builder(configPath).sync().autosave().build();
            try {
                config.load();

                boolean changed = false;
                if (!config.contains("apiBaseUrl")) {
                    config.set("apiBaseUrl", DEFAULT_API_BASE_URL);
                    changed = true;
                }

                if (!config.contains("minecraftApiKey")) {
                    config.set("minecraftApiKey", "");
                    changed = true;
                }

                if (changed) {
                    config.save();
                    logger.warn("Created/updated default config at {}. Please set minecraftApiKey.", configPath);
                }

                String apiBaseUrl = normalizeApiBaseUrl(config.getOrElse("apiBaseUrl", DEFAULT_API_BASE_URL));
                String minecraftApiKey = config.getOrElse("minecraftApiKey", "").trim();
                return new LinkedConfig(apiBaseUrl, minecraftApiKey);
            } finally {
                config.close();
            }
        } catch (IOException exception) {
            logger.error("Failed to read/write config file {}. Falling back to defaults.", configPath, exception);
        }

        String apiBaseUrl = normalizeApiBaseUrl(DEFAULT_API_BASE_URL);
        String minecraftApiKey = "";
        return new LinkedConfig(apiBaseUrl, minecraftApiKey);
    }

    public String getApiBaseUrl() {
        return apiBaseUrl;
    }

    public String getMinecraftApiKey() {
        return minecraftApiKey;
    }

    private static String normalizeApiBaseUrl(String rawUrl) {
        String trimmed = rawUrl == null ? "" : rawUrl.trim();
        if (trimmed.endsWith("/")) {
            return trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }
}