/**
 * Shared types for Discord member tracking between
 * the Overwatch bot and the backend API.
 */

export interface TrackedMember {
  id: string;
  username: string;
  displayName: string;
  roles: {
    boosterSince: number | null;
    donatorSince: number | null;
    vipSince: number | null;
    teamSince: number | null;
  };
}

export interface MemberUpdatePayload {
  member: TrackedMember;
}

export interface MemberDeletePayload {
  memberId: string;
}
