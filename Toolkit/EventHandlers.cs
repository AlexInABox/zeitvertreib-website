using InventorySystem.Items;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using MEC;

namespace Toolkit;

public static class EventHandlers
{
    public static ToolkitFlags Flags { get; set; } = new();

    public static void RegisterEvents()
    {
        // Reset the flags every round restart this way!
        ServerEvents.WaitingForPlayers += () => { Flags = new ToolkitFlags(); };

        PlayerEvents.Spawned += OnPlayerSpawned;
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.Spawned -= OnPlayerSpawned;
    }


    private static void OnPlayerSpawned(PlayerSpawnedEventArgs ev)
    {
        
        // PlayersStartWithCoins
        if (Flags.PlayersStartWithCoins)
        {
            Timing.CallDelayed(Timing.WaitForOneFrame, () =>
            {
                ev.Player.AddItem(ItemType.Coin, ItemAddReason.StartingItem);
                ev.Player.AddItem(ItemType.Coin, ItemAddReason.StartingItem);
                ev.Player.AddItem(ItemType.Coin, ItemAddReason.StartingItem);
            });
        }
    }
}

/// <summary>
/// Controls which Toolkit features are enabled for the current round.
/// </summary>
/// <remarks>
/// Changes made to these flags take effect immediately and persist until
/// the current round ends. All flags are automatically reset to their
/// default values when the server fires the <see cref="ServerEvents.WaitingForPlayers"/> event.
/// </remarks>
public class ToolkitFlags
{
    /// <summary>
    ///     All players get 3 Coins into their starting inventory when spawning.
    /// </summary>
    public bool PlayersStartWithCoins { get; set; } = true;
    
    //... more to come :3 ...//
}