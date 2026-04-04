package zeitvertreib.economy.trade;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import zeitvertreib.economy.ZeitvertreibEconomy;

public final class TradeOfferManager {
	public static final long OFFER_TIMEOUT_MILLIS = 60_000L;

	private final Map<UUID, TradeOffer> offersById = new HashMap<>();
	private final Map<UUID, UUID> playerOffers = new HashMap<>();

	public boolean isPlayerBusy(UUID playerId) {
		return playerOffers.containsKey(playerId);
	}

	public TradeOffer createOffer(ServerPlayer seller, ServerPlayer buyer, ItemStack escrowedStack, int price, boolean devMode) {
		UUID offerId = UUID.randomUUID();
		TradeOffer offer = new TradeOffer(
			offerId,
			seller.getUUID(),
			buyer.getUUID(),
			seller.getName().getString(),
			buyer.getName().getString(),
			escrowedStack.copy(),
			price,
			devMode,
			System.currentTimeMillis() + OFFER_TIMEOUT_MILLIS
		);

		offersById.put(offerId, offer);
		playerOffers.put(offer.sellerId(), offerId);
		playerOffers.put(offer.buyerId(), offerId);
		return offer;
	}

	public TradeOffer getOffer(UUID offerId) {
		return offersById.get(offerId);
	}

	public TradeOffer getOfferForPlayer(UUID playerId) {
		UUID offerId = playerOffers.get(playerId);
		if (offerId == null) {
			return null;
		}

		return offersById.get(offerId);
	}

	public java.util.List<TradeOffer> getActiveOffers() {
		return new ArrayList<>(offersById.values());
	}

	public TradeOffer removeOffer(UUID offerId) {
		TradeOffer offer = offersById.remove(offerId);
		if (offer != null) {
			playerOffers.remove(offer.sellerId());
			playerOffers.remove(offer.buyerId());
		}

		return offer;
	}

	public void giveEscrowToBuyer(ServerPlayer buyer, TradeOffer offer) {
		giveStackToPlayer(buyer, offer.stack().copy());
	}

	public void restoreEscrowToSeller(MinecraftServer server, TradeOffer offer) {
		ServerPlayer seller = server.getPlayerList().getPlayer(offer.sellerId());
		if (seller == null) {
			ZeitvertreibEconomy.LOGGER.warn("Could not return escrowed item for offer {} because seller {} is offline", offer.id(), offer.sellerName());
			return;
		}

		giveStackToPlayer(seller, offer.stack().copy());
	}

	public void cleanupExpiredOffers(MinecraftServer server) {
		long now = System.currentTimeMillis();
		for (TradeOffer offer : new ArrayList<>(offersById.values())) {
			if (offer.expiresAtMillis() > now) {
				continue;
			}

			removeOffer(offer.id());
			restoreEscrowToSeller(server, offer);

			ServerPlayer seller = server.getPlayerList().getPlayer(offer.sellerId());
			if (seller != null) {
				seller.sendSystemMessage(prefix(offer).append(Component.literal("Your trade offer to " + offer.buyerName() + " expired. Your item was returned.")));
			}

			ServerPlayer buyer = server.getPlayerList().getPlayer(offer.buyerId());
			if (buyer != null && !buyer.getUUID().equals(offer.sellerId())) {
				buyer.sendSystemMessage(prefix(offer).append(Component.literal("The trade offer from " + offer.sellerName() + " expired.")));
			}
		}
	}

	public void cancelOffersForPlayer(MinecraftServer server, ServerPlayer player) {
		TradeOffer offer = getOfferForPlayer(player.getUUID());
		if (offer == null) {
			return;
		}

		removeOffer(offer.id());
		if (player.getUUID().equals(offer.sellerId())) {
			giveStackToPlayer(player, offer.stack().copy());

			ServerPlayer buyer = server.getPlayerList().getPlayer(offer.buyerId());
			if (buyer != null && !buyer.getUUID().equals(offer.sellerId())) {
				buyer.sendSystemMessage(prefix(offer).append(Component.literal("Trade offer canceled because " + offer.sellerName() + " left the server.")));
			}
		} else {
			restoreEscrowToSeller(server, offer);

			ServerPlayer seller = server.getPlayerList().getPlayer(offer.sellerId());
			if (seller != null) {
				seller.sendSystemMessage(prefix(offer).append(Component.literal(offer.buyerName() + " left the server. Your item was returned.")));
			}
		}
	}

	public void cancelAll(MinecraftServer server) {
		for (TradeOffer offer : new ArrayList<>(offersById.values())) {
			removeOffer(offer.id());
			restoreEscrowToSeller(server, offer);
		}
	}

	public TradeOffer cancelOffer(MinecraftServer server, UUID offerId, String reason) {
		TradeOffer offer = removeOffer(offerId);
		if (offer == null) {
			return null;
		}

		restoreEscrowToSeller(server, offer);

		ServerPlayer seller = server.getPlayerList().getPlayer(offer.sellerId());
		if (seller != null) {
			seller.sendSystemMessage(prefix(offer).append(Component.literal("Trade offer to " + offer.buyerName() + " was canceled. " + reason)));
		}

		ServerPlayer buyer = server.getPlayerList().getPlayer(offer.buyerId());
		if (buyer != null && !buyer.getUUID().equals(offer.sellerId())) {
			buyer.sendSystemMessage(prefix(offer).append(Component.literal("Trade offer from " + offer.sellerName() + " was canceled. " + reason)));
		}

		return offer;
	}

	public void reset() {
		offersById.clear();
		playerOffers.clear();
	}

	public static MutableComponent describeStack(ItemStack stack) {
		MutableComponent component = Component.empty();
		if (stack.getCount() > 1) {
			component.append(Component.literal(stack.getCount() + "x "));
		}
		component.append(stack.getHoverName().copy());
		return component;
	}

	private void giveStackToPlayer(ServerPlayer player, ItemStack stack) {
		if (player.getMainHandItem().isEmpty()) {
			player.setItemInHand(InteractionHand.MAIN_HAND, stack);
			return;
		}

		player.getInventory().add(stack);
		if (!stack.isEmpty()) {
			player.drop(stack, false);
		}
	}

	public static MutableComponent prefix(TradeOffer offer) {
		if (!offer.devMode()) {
			return Component.empty();
		}

		return Component.literal("[DEV] ").withStyle(ChatFormatting.YELLOW);
	}
}