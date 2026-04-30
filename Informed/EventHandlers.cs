using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Extension;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.ServerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using QRCoder;
using UnityEngine;
using Hint = HintServiceMeow.Core.Models.Hints.Hint;
using Logger = LabApi.Features.Console.Logger;

namespace Informed;

//This TANKS tps with 15+ players. Might be a performance issue with piss old HintServiceMeow that hasnt been updated in a quadrillion years. We should switch to RueI. Its maintained :shrug:

public static class EventHandlers
{
    private static readonly ConcurrentDictionary<Player, List<AbstractHint>> PlayerQrCodes = [];
    private static long _globalRoundTimestamp;

    private static readonly List<Vector2> Points =
    [
        new(49.979748419640934f, 0.009503079328091808f),
        new(49.08091254418247f, 4.908658605023008f),
        new(47.76413547072779f, 9.734721158875857f),
        new(46.038401794166234f, 14.435079068772847f),
        new(43.92682993302439f, 18.951647578515107f),
        new(41.42494089924749f, 23.293758472947037f),
        new(38.57400587244777f, 27.390148422142655f),
        new(35.38170467835617f, 31.234425718546053f),
        new(31.864646378098435f, 34.80341936972428f),
        new(28.068599444911584f, 38.050981128407116f),
        new(24.016771254009843f, 40.96046148344816f),
        new(19.715733884963292f, 43.52437388006821f),
        new(15.21937133427344f, 45.708078557075126f),
        new(10.55194690871604f, 47.50028654381905f),
        new(5.755184091392829f, 48.88604175841142f),
        new(0.8532918773634253f, 49.860238817839026f),
        new(4.077317177590663f, 50.7044754205943f),
        new(8.914940186335203f, 51.95010408363226f),
        new(13.631503262802381f, 53.6043931716772f),
        new(18.18543092539834f, 55.65321257712332f),
        new(22.55282422906461f, 58.085587107498405f),
        new(26.70888548475397f, 60.88973805919315f),
        new(30.5868199643336f, 64.01692894309386f),
        new(34.20758044642431f, 67.48313063464678f),
        new(37.50993233280691f, 71.2320626071902f),
        new(40.47718082026232f, 75.24045253642204f),
        new(43.10202335828003f, 79.50152401626804f),
        new(45.34932914661252f, 83.96162218760105f),
        new(47.21392331959726f, 88.61397503971395f),
        new(48.66665531868597f, 93.3823356686819f),
        new(49.71311771003246f, 98.27805173362877f),
        new(50.51697591773583f, 96.7956084090781f),
        new(51.68984459471749f, 91.92650424867826f),
        new(53.26767820200881f, 87.19217368002438f),
        new(55.24855916075009f, 82.59873337336273f),
        new(57.61640324481209f, 78.18810455496312f),
        new(60.338220691702304f, 74.01479951243239f),
        new(63.41793268480737f, 70.0707582784294f),
        new(66.81663527863705f, 66.407743610798f),
        new(70.5141511379986f, 63.04592908768014f),
        new(74.49030292769919f, 60.00548828721783f),
        new(78.70901302408106f, 57.31579936913344f),
        new(83.13088942770793f, 55.000843692220904f),
        new(87.74893397369533f, 53.06563227031329f),
        new(92.50529836864092f, 51.535222153043286f),
        new(97.37526966827961f, 50.41511849534944f),
        new(97.69482546445111f, 49.620542038874966f),
        new(92.81618965112301f, 48.526797669639286f),
        new(88.04973903575909f, 47.02208597117957f),
        new(83.43689922018191f, 45.1196315376491f),
        new(78.98525137239486f, 42.8209461567058f),
        new(74.75201928502938f, 40.15440820691305f),
        new(70.77391994733813f, 37.14771704868454f),
        new(67.05786350584329f, 33.80805412803033f),
        new(63.62715881405374f, 30.15215030338899f),
        new(60.53769484599269f, 26.241621999256f),
        new(57.78335957815777f, 22.070887923432416f),
        new(55.39221356049956f, 17.676451960279387f),
        new(53.38670879770616f, 13.097884810365603f),
        new(51.77777642188623f, 8.359047049729723f),
        new(50.57932008433348f, 3.501546639923674f)
    ];

    public static void RegisterEvents()
    {
        PlayerEvents.Joined += OnJoined;
        PlayerEvents.Left += OnLeft;
        ServerEvents.RoundEnded += OnRoundEnded;
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.Joined -= OnJoined;
        PlayerEvents.Left -= OnLeft;
        ServerEvents.RoundEnded -= OnRoundEnded;
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
    }

    private static void OnWaitingForPlayers()
    {
        _globalRoundTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }

    private static IEnumerator<float> UpdateQrCodesLoop()
    {
        while (true)
        {
            foreach (KeyValuePair<Player, List<AbstractHint>> qrCodeHints in PlayerQrCodes)
            {
                foreach (AbstractHint hint in qrCodeHints.Value) hint.Hide = true;
                qrCodeHints.Value.Clear();
                PlayerQrCodes.AddOrUpdate(qrCodeHints.Key, static player => GenerateQrCodeForUser(player),
                    static (player, _) => GenerateQrCodeForUser(player));

                yield return Timing.WaitForSeconds(2);
            }

            yield return Timing.WaitForSeconds(2);
        }
    }

    private static void OnRoundEnded(RoundEndedEventArgs ev)
    {
        PlayerQrCodes.Clear();
    }

    private static void OnLeft(PlayerLeftEventArgs ev)
    {
        PlayerQrCodes.TryRemove(ev.Player, out _);
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        Utils.SendHeaderToPlayer(ev);


        /*
        foreach (Vector2 point in points)
            _logoHints.Add(DrawPoint(playerDisplay, point,
                (int)(-540f * ev.Player.ReferenceHub.aspectRatioSync.AspectRatio + 600f) + 420f, 1015, true, false,
                2.75f));
*/

        PlayerQrCodes.AddOrUpdate(ev.Player, static player => GenerateQrCodeForUser(player),
            static (player, _) => GenerateQrCodeForUser(player));
    }

    private static List<AbstractHint> GenerateQrCodeForUser(Player player)
    {
        float xOffset = -540f * player.ReferenceHub.aspectRatioSync.AspectRatio + 600f + 405f;
        const float yOffset = 1000f;

        PlayerDisplay playerDisplay = player.GetPlayerDisplay();

        long userIdNum = long.Parse(player.UserId.Split('@')[0]);
        string content = userIdNum.ToString("D10") + _globalRoundTimestamp;
        Logger.Warn($"User {player.Nickname} got identifier of: {content}");

        using QRCodeGenerator generator = new();
        QRCodeData data = generator.CreateQrCode(
            content,
            QRCodeGenerator.ECCLevel.L,
            false,
            false,
            QRCodeGenerator.EciMode.Default,
            1 // force size
        );

        List<AbstractHint> hints = [];

        for (int y = 0; y < data.ModuleMatrix.Count; y++)
        for (int x = 0; x < data.ModuleMatrix.Count; x++)
            if (data.ModuleMatrix[y][x])
                hints.Add(
                    DrawPoint(
                        playerDisplay,
                        new Vector2(x * 2, y * 2),
                        xOffset,
                        yOffset,
                        true,
                        false,
                        0.85f
                    ));

        return hints;
    }

    private static AbstractHint DrawPoint(PlayerDisplay playerDisplay, Vector2 position, float xOffset, float yOffset,
        bool bold, bool hidden, float density = 1f)
    {
        Hint point = new()
        {
            Alignment = HintAlignment.Left,
            Text = bold ? "<b>." : ".",
            YCoordinateAlign = HintVerticalAlign.Top,
            YCoordinate = yOffset + position.y / density,
            XCoordinate = xOffset + position.x / density,
            Hide = hidden,
            SyncSpeed = HintSyncSpeed.UnSync
        };
        playerDisplay.AddHint(point);
        return point;
    }

    private static void DrawBox(PlayerDisplay playerDisplay, int height, int width, Color color, Vector2 position)
    {
        const char topLeftCorner = '┌';
        const char topRightCorner = '┐';
        const char bottomRightCorner = '┘';
        const char bottomLeftCorner = '└';
        const char vertical = '│';
        const char horizontal = '─';


        Hint leftBox = new()
        {
            Alignment = HintAlignment.Left,
            AutoText = _ =>
            {
                StringBuilder sb = new();
                sb.Append($"<color={color.ToHex()}>");

                // Top
                sb.Append(topLeftCorner);
                sb.Append(horizontal, width);
                sb.AppendLine();

                // Left wall.
                for (int i = 0; i < height; i++) sb.AppendLine(vertical.ToString());

                // Bottom
                sb.Append(bottomLeftCorner);
                sb.Append(horizontal, width);

                return sb.ToString();
            },
            YCoordinateAlign = HintVerticalAlign.Top,
            YCoordinate = position.y,
            XCoordinate = position.x,
            SyncSpeed = HintSyncSpeed.Slow
        };

        Hint rightBox = new()
        {
            Alignment = HintAlignment.Left,
            AutoText = _ =>
            {
                StringBuilder sb = new();
                sb.Append($"<color={color.ToHex()}>");

                // Top
                sb.AppendLine(topRightCorner.ToString());

                // wall.
                for (int i = 0; i < height; i++) sb.AppendLine(vertical.ToString());

                // Bottom
                sb.Append(bottomRightCorner);

                return sb.ToString();
            },
            YCoordinateAlign = HintVerticalAlign.Top,
            YCoordinate = position.y,
            XCoordinate = 20 * width + 20 + position.x,
            SyncSpeed = HintSyncSpeed.Slow
        };

        playerDisplay.AddHint(leftBox);
        playerDisplay.AddHint(rightBox);
    }
}