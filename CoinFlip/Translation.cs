using System.ComponentModel;

namespace Flipped;

public class Translation
{
    [Description("Nachricht bei aktiver Abklingzeit. $remaining$ wird durch die verbleibenden Sekunden ersetzt.")]
    public string CooldownMessage { get; set; } =
        "<color=red>Noch <b>$remaining$ Sekunden</b> Geduld. Die Münze braucht eine Pause.</color>";

    [Description("Nachricht wenn nichts passiert.")]
    public string NothingMessage { get; set; } =
        "<color=white>Die Münze dreht sich... und landet. <b>Nichts. Wirklich gar nichts.</b></color>";

    [Description("Nachricht beim 'HP verlieren'-Ergebnis. $amount$ wird durch die HP-Menge ersetzt.")]
    public string LoseHpMessage { get; set; } =
        "<color=red>Die Münze hat entschieden: Schmerz. Du verlierst <b>$amount$ HP</b>.</color>";

    [Description("Nachricht beim 'Schild erhalten'-Ergebnis. $amount$ wird durch die Schildmenge ersetzt.")]
    public string GainShieldMessage { get; set; } =
        "<color=green><b>$amount$ Schild</b> – aber die Münze macht dich kurz schwindelig. Hast du's verdient?</color>";

    [Description("Nachricht beim 'Zufälliger Effekt'-Ergebnis. $effect$ wird durch den Effektnamen ersetzt.")]
    public string RandomEffectMessage { get; set; } =
        "<color=yellow>Die Münze spielt Roulette mit deinem Körper: <b>$effect$</b>.</color>";

    [Description("Nachricht beim 'Position tauschen'-Ergebnis. $player$ wird durch den Spielernamen ersetzt.")]
    public string SwapMessage { get; set; } =
        "<color=cyan>Zapp! Du stehst jetzt wo <b>$player$</b> stand. Schicke Aussichten?</color>";

    [Description("Nachricht beim 'Position tauschen'-Ergebnis wenn kein anderer Spieler verfügbar ist.")]
    public string SwapNoTargetMessage { get; set; } =
        "<color=yellow>Die Münze wollte dich tauschen – aber hier ist niemand. Du bleibst, wo du bist.</color>";

    [Description("Nachricht beim 'Explodieren'-Ergebnis.")]
    public string ExplodeMessage { get; set; } =
        "<color=red><b>Oh. Oh nein.</b> Die Münze piept...</color>";

    [Description("Nachricht beim 'Alle SCPs teleportieren'-Ergebnis.")]
    public string TeleportScpsMessage { get; set; } =
        "<color=red><b>ALARM!</b> Alle SCPs sind jetzt bei dir. Das war keine gute Idee.</color>";

    [Description("Nachricht beim 'HP heilen'-Ergebnis. $amount$ wird durch die HP-Menge ersetzt.")]
    public string GainHpMessage { get; set; } =
        "<color=green>Die Münze gibt dir <b>$amount$ HP</b> zurück – aber die Wunde blutet noch nach.</color>";

    [Description("Nachricht beim 'Zu einem zufälligen Spieler teleportieren'-Ergebnis. $player$ wird durch den Spielernamen ersetzt.")]
    public string TeleportRandomMessage { get; set; } =
        "<color=cyan>Puff! Du bist jetzt bei <b>$player$</b>. Überraschung!</color>";

    [Description("Nachricht beim 'Zu einem zufälligen Spieler teleportieren'-Ergebnis wenn kein anderer Spieler verfügbar ist.")]
    public string TeleportRandomNoTargetMessage { get; set; } =
        "<color=yellow>Die Münze wollte dich woanders hinschicken – aber es ist niemand da. Bleib halt.</color>";

    [Description("Nachricht beim 'Zufälliges Item erhalten'-Ergebnis. $item$ wird durch den Itemnamen ersetzt.")]
    public string GiveItemMessage { get; set; } =
        "<color=green>Die Münze hat etwas für dich: <b>$item$</b>. Nutz es weise.</color>";

    [Description("Nachricht beim 'Gefesselt'-Ergebnis.")]
    public string CuffedMessage { get; set; } =
        "<color=red><b>Klick.</b> Handschellen. Die Münze findet das lustig.</color>";

    [Description("Nachricht beim 'Krebs'-Ergebnis.")]
    public string CancerMessage { get; set; } =
        "<color=purple>Die Münze hat nachgedacht... und dir <b>Krebs</b> gegeben. Herzlichen Glückwunsch.</color>";
}
