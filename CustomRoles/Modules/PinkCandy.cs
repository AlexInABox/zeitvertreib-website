using InventorySystem.Items;
using InventorySystem.Items.Usables.Scp330;
using UncomplicatedCustomRoles.API.Features.CustomModules;

namespace CustomRoles.Modules;

// ReSharper disable once ClassNeverInstantiated.Global
public class PinkCandy : CustomModule
{
    public override void Execute()
    {
        CustomRole.Player.GiveCandy(CandyKindID.Pink, ItemAddReason.StartingItem);
    }
}