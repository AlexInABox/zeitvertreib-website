using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using LabApi.Features.Wrappers;

namespace Audited;

public static class CommandTranslator
{
    //stupid fix: only translate second ID for give command
    private static readonly HashSet<string> ItemSecondArg =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "give",
        };

    public static string Translate(string rawCommand)
    {
        if (string.IsNullOrWhiteSpace(rawCommand))
            return rawCommand;

        string[] tokens = rawCommand.Split(' ');
        StringBuilder sb = new();

        string commandName = tokens[0];
        bool translateItem = ItemSecondArg.Contains(commandName);

        for (int i = 0; i < tokens.Length; i++)
        {
            if (i > 0)
                sb.Append(' ');

            if (i == 0)
            {
                sb.Append(tokens[i]);
                continue;
            }

            string token = tokens[i];
            string stripped = token.TrimEnd('.');

            if (i == 1)
            {
                if (int.TryParse(stripped, out int playerId))
                {
                    Player player = Player.GetAll().FirstOrDefault(p => p.PlayerId == playerId);
                    if (player != null)
                    {
                        sb.Append(player.Nickname).Append($"({playerId})");
                        continue;
                    }
                }
                sb.Append(token);
                continue;
            }

            if (i == 2 && translateItem)
            {
                if (int.TryParse(stripped, out int itemId) && Enum.IsDefined(typeof(ItemType), itemId))
                {
                    sb.Append((ItemType)itemId).Append($"({itemId})");
                    continue;
                }
                sb.Append(token);
                continue;
            }

            sb.Append(token);
        }

        return sb.ToString();
    }
}
