using System.Reflection;
using LabApi.Features.Wrappers;
using BaseJailbirdItem = InventorySystem.Items.Jailbird.JailbirdItem;

namespace Flipped.Events;

public class OneTimeJailbird : IEvent
{
    // The jailbird breaks after its charges are exhausted.
    // Setting this to 4 leaves exactly one use before it breaks.
    private const int ChargesBeforeBreak = 4;

    private static readonly PropertyInfo TotalChargesProperty =
        typeof(BaseJailbirdItem).GetProperty("TotalChargesPerformed",
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);

    public EventType EventType { get; } = EventType.Heavenly;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        Item item = player.AddItem(ItemType.Jailbird);

        if (item is JailbirdItem jailbird)
        {
            TotalChargesProperty?.SetValue(jailbird.Base, ChargesBeforeBreak);
        }

        EventHandlers.PushUserMessage(player, "Die Münze schenkt dir einen fast kaputten Jailbird... eine letzte Chance!");
    }
}
