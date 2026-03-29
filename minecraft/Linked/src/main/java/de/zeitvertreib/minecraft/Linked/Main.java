package de.zeitvertreib.minecraft.Linked;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayNetworkHandler;
import net.minecraft.text.Text;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Main implements ModInitializer {
    private static final Logger LOGGER = LoggerFactory.getLogger("zeitvertreib-linked-plugin");
    private static final HttpClient httpClient = HttpClient.newHttpClient();
    private static final Pattern CODE_PATTERN = Pattern.compile("\\\"code\\\"\\s*:\\s*\\\"([A-Z0-9]{4}-[A-Z0-9]{4})\\\"");
    private static LinkedConfig config;

    @Override
    public void onInitialize() {
        config = LinkedConfig.load(LOGGER);
        LOGGER.info("Loaded linked config. Backend URL: {}", config.getApiBaseUrl());

        ServerPlayConnectionEvents.INIT.register((handler, server) -> {
            String uuid = handler.player.getUuidAsString();
            checkUUIDLinkedAsync(uuid, handler, server);
        });
    }

    private void checkUUIDLinkedAsync(String uuid, ServerPlayNetworkHandler handler, MinecraftServer server) {
        String encodedUuid = URLEncoder.encode(uuid, StandardCharsets.UTF_8);
        URI uri = URI.create(config.getApiBaseUrl() + "/minecraft/stats?minecraftUuid=" + encodedUuid);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(uri)
                .GET()
                .build();

        httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenAccept(response -> {
                    int status = response.statusCode();

                    server.execute(() -> {
                        if (status == 200) return; // linked → allow join

                        if (status == 404) {
                            generateLinkCodeAndDisconnect(uuid, handler, server);
                            return;
                        }

                        // Other status → server unreachable
                        handler.player.networkHandler.disconnect(Text.literal(
                                "§cZugriff verweigert\n§7Der Verifikationsserver konnte nicht erreicht werden.\n§7Bitte versuche es später erneut.\n§7Kontaktiere bei Problemen das Serverteam auf Discord: §9https://dsc.gg/zeit"
                        ));
                    });
                })
                .exceptionally(ex -> {
                    ex.printStackTrace();
                    server.execute(() -> {
                        handler.player.networkHandler.disconnect(Text.literal(
                                "§cZugriff verweigert\n§7Der Verifikationsserver konnte nicht erreicht werden.\n§7Bitte versuche es später erneut.\n\n§7Kontaktiere bei Problemen das Serverteam auf Discord: §9https://dsc.gg/zeit"
                        ));
                    });
                    return null;
                });
    }

    private void generateLinkCodeAndDisconnect(String uuid, ServerPlayNetworkHandler handler, MinecraftServer server) {
        String minecraftApiKey = config.getMinecraftApiKey();

        if (minecraftApiKey == null || minecraftApiKey.isBlank()) {
            LOGGER.error("MINECRAFT_API_KEY is missing. Cannot generate link code for UUID {}", uuid);
            handler.player.networkHandler.disconnect(Text.literal(
                    "§cZugriff verweigert\n§7Dein Account ist nicht verlinkt.\n§7Der Link-Code konnte nicht erstellt werden.\n§7Bitte kontaktiere das Serverteam auf Discord: §9https://dsc.gg/zeit"
            ));
            return;
        }

        String escapedUuid = uuid.replace("\\", "\\\\").replace("\"", "\\\"");
        String payload = "{\"minecraftUuid\":\"" + escapedUuid + "\"}";

        HttpRequest createCodeRequest = HttpRequest.newBuilder()
            .uri(URI.create(config.getApiBaseUrl() + "/minecraft/link"))
                .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + minecraftApiKey)
                .PUT(HttpRequest.BodyPublishers.ofString(payload))
                .build();

        httpClient.sendAsync(createCodeRequest, HttpResponse.BodyHandlers.ofString())
                .thenAccept(createCodeResponse -> {
                    int status = createCodeResponse.statusCode();
                    if (status != 200) {
                        LOGGER.error("Failed to generate Minecraft link code for UUID {}. Status: {}, Body: {}",
                                uuid,
                                status,
                                createCodeResponse.body());
                        server.execute(() -> handler.player.networkHandler.disconnect(Text.literal(
                                "§cZugriff verweigert\n§7Dein Account ist nicht verlinkt.\n§7Der Link-Code konnte nicht erstellt werden.\n§7Bitte versuche es spaeter erneut oder kontaktiere das Team: §9https://dsc.gg/zeit"
                        )));
                        return;
                    }

                    String code = extractCode(createCodeResponse.body());
                    if (code == null) {
                        LOGGER.error("Link code response did not contain a valid code for UUID {}. Body: {}", uuid, createCodeResponse.body());
                        server.execute(() -> handler.player.networkHandler.disconnect(Text.literal(
                                "§cZugriff verweigert\n§7Dein Account ist nicht verlinkt.\n§7Der Link-Code konnte nicht gelesen werden.\n§7Bitte versuche es spaeter erneut oder kontaktiere das Team: §9https://dsc.gg/zeit"
                        )));
                        return;
                    }

                    server.execute(() -> handler.player.networkHandler.disconnect(Text.literal(
                            "§cZugriff verweigert\n"
                                    + "§7Dein Account ist nicht verlinkt.\n"
                                    + "§7Gehe auf §fzeitvertreib.vip/minecraft§7 und gib diesen Code ein:\n"
                                    + "§e" + code + "\n"
                                    + "§8UUID: " + uuid
                    )));
                })
                .exceptionally(ex -> {
                    LOGGER.error("Failed to generate link code for UUID {}", uuid, ex);
                    server.execute(() -> handler.player.networkHandler.disconnect(Text.literal(
                            "§cZugriff verweigert\n§7Dein Account ist nicht verlinkt.\n§7Der Link-Code konnte nicht erstellt werden.\n§7Bitte versuche es spaeter erneut oder kontaktiere das Team: §9https://dsc.gg/zeit"
                    )));
                    return null;
                });
    }

    private String extractCode(String body) {
        Matcher matcher = CODE_PATTERN.matcher(body);
        if (!matcher.find()) {
            return null;
        }
        return matcher.group(1);
    }
}