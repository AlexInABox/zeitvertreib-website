using System.Collections.Generic;
using System.Linq;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;

namespace Eventim.Events;

public class CoinGluttony : IEvent
{
    private static CoroutineHandle _mainLoop;
    public string Name => "Münzenwahn";

    public string Description =>
        "Alle Spieler haben unendlich viele Münzen in ihrem Inventar!";

    public List<string> Rules =>
    [
        "Teamtrolling ist erlaubt.",
        "Grundloses Töten ist erlaubt."
    ];

    public void RegisterEvents()
    {
        ServerEvents.RoundStarted += OnRoundStarted;
    }

    public void UnregisterEvents()
    {
        ServerEvents.RoundStarted -= OnRoundStarted;
        Timing.KillCoroutines(_mainLoop);
    }


    private static void OnRoundStarted()
    {
        _mainLoop = Timing.RunCoroutine(MainLoop());
    }

    private static IEnumerator<float> MainLoop()
    {
        while (true)
        {
            foreach (Player player in Player.ReadyList.Where(p => p.IsHuman && !p.IsDummy))
            {
                int coinCount = player.Items.Count(item => item.Base.ItemTypeId == ItemType.Coin);

                if (coinCount > 0) continue;

                player.AddItem(ItemType.Coin);
            }

            yield return Timing.WaitForSeconds(2f);
        }
    }
}