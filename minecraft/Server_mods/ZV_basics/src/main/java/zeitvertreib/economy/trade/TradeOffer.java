package zeitvertreib.economy.trade;

import net.minecraft.world.item.ItemStack;

import java.util.UUID;

public record TradeOffer(
	UUID id,
	UUID sellerId,
	UUID buyerId,
	String sellerName,
	String buyerName,
	ItemStack stack,
	int price,
	boolean devMode,
	long expiresAtMillis
) {
}