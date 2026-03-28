package de.zeitvertreib.minecraft.Linked;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Main implements ModInitializer {
    private static final Logger LOGGER = LoggerFactory.getLogger("zeitvertreib-linked-plugin");

    @Override
    public void onInitialize() {
        LOGGER.info("Linked mod initialized.");

        ServerLifecycleEvents.SERVER_STARTED.register(server -> LOGGER.info("Linked mod server started."));

        ServerLifecycleEvents.SERVER_STOPPING.register(server -> LOGGER.info("Linked mod shutting down."));
    }
}
