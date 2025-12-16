namespace zvupdater;

public class Config
{
    public bool Debug { get; set; } = false;
    public int CurrentlyInstalledBuild { get; set; } = 0;
    public string GitHubToken { get; set; } = "";
}