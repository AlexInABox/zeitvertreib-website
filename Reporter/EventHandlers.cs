using System.Collections.Generic;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;

namespace Reporter;

public static class EventHandlers
{
    private static int _emptyServerTicksCounter;
    private static CoroutineHandle _updatePlayerListCoroutine;
    private static CoroutineHandle _idleModeDelayer;

    public static void RegisterEvents()
    {
        _ = TinyBot.Instance.Start(Plugin.Instance.Config!.Token);

        PlayerEvents.Left += OnPlayerLeft;
        _updatePlayerListCoroutine = Timing.RunCoroutine(PlayerListUpdateLoop());
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.Left -= OnPlayerLeft;
        Timing.KillCoroutines(_updatePlayerListCoroutine);
    }

    private static IEnumerator<float> PlayerListUpdateLoop()
    {
        while (true)
        {
            UpdatePlayerList();
            yield return Timing.WaitForSeconds(10f);
        }
        // ReSharper disable once IteratorNeverReturns
    }

    private static void UpdatePlayerList()
    {
        List<TinyPlayer> list = new(Server.MaxPlayers + 5); // avoid reallocation; +5 just incase ig..

        // ReSharper disable once LoopCanBeConvertedToQuery   this looks ASS as a LINQ
        foreach (Player p in Player.ReadyList)
        {
            if (!p.IsPlayer)
                continue;

            list.Add(new TinyPlayer(p.Nickname, p.UserId, p.Team.ToString()));
        }


        if (list.Count == 0)
        {
            _emptyServerTicksCounter++;
            if (_emptyServerTicksCounter < 6) // only send every minute if server is empty
                return;
        }
        else
        {
            _emptyServerTicksCounter = 0;
        }

        TinyServer.Instance.UploadPlayerListToBackend(list);
        TinyBot.Instance.UpdateStatus(list.Count);
    }

    private static void OnPlayerLeft(object _)
    {
        Timing.KillCoroutines(_idleModeDelayer);
        _idleModeDelayer = Timing.RunCoroutine(DelayIdleMode());
    }

    private static IEnumerator<float> DelayIdleMode()
    {
        Server.IdleModeAvailable = false;
        yield return Timing.WaitForSeconds(65f);
        Server.IdleModeAvailable = true;
    }
}