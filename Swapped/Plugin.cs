using System;
using System.Collections.Generic;
using LabApi.Features;
using LabApi.Features.Console;
using LabApi.Features.Wrappers;
using LabApi.Loader;
using LabApi.Loader.Features.Plugins;
using PlayerRoles;

namespace swapped;

// ReSharper disable once ClassNeverInstantiated.Global
public class Plugin : Plugin<Config>
{
    public readonly Dictionary<RoleTypeId, int> RoleCosts = new()
    {
        { RoleTypeId.Scp173, 100 },
        { RoleTypeId.Scp939, 100 },
        { RoleTypeId.Scp079, 50 },
        { RoleTypeId.Scp049, 100 },
        { RoleTypeId.Scp096, 100 },
        { RoleTypeId.Scp106, 100 },
        { RoleTypeId.Scp3114, 450 }
    };

    public RoleTypeId[] AvailableScps =
    [
        RoleTypeId.Scp049, RoleTypeId.Scp079, RoleTypeId.Scp096, RoleTypeId.Scp106, RoleTypeId.Scp173,
        RoleTypeId.Scp939, RoleTypeId.Scp3114
    ];

    public Player[] PlayersThatCanUseSwap = [];
    public override string Name { get; } = "Swapped";

    public override string Description { get; } =
        "Swapped";

    public override string Author { get; } = "AlexInABox";
    public override Version Version { get; } = new(1, 2, 0);
    public override Version RequiredApiVersion { get; } = new(LabApiProperties.CompiledVersion);
    public Translation Translation { get; private set; }

    public static Plugin Instance { get; private set; }
    public bool SwapEnabled { get; set; } = false;

    public override void Enable()
    {
        Instance = this;
        if (Config == null)
        {
            Logger.Error("There is an error while loading the config. Reverting to the default one.");
            Config = new Config();
        }

        if (!this.TryLoadConfig("translation.yml", out Translation translation))
        {
            Logger.Error("There is an error while loading translation. Using default one.");
            translation = new Translation();
        }

        Translation = translation;
        EventHandlers.RegisterEvents();
    }

    public override void Disable()
    {
        EventHandlers.UnregisterEvents();
    }
}