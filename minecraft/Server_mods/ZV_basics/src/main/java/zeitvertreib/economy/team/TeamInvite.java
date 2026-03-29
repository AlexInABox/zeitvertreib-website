package zeitvertreib.economy.team;

public record TeamInvite(
	String teamName,
	String inviterName,
	long expiresAtMillis
) {
}