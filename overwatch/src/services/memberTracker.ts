import { Client, GuildMember, Collection } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  ZEITVERTREIB_GUILD_ID,
  BOOSTER_ROLE_IDs,
  DONATOR_ROLE_IDs,
  TEAM_MEMBER_ROLE_IDs,
  DATA_FILE_PATH,
  TRACKING_INTERVAL_MS,
} from '../config/constants';
import type { TrackedMember, MemberUpdatePayload, MemberDeletePayload } from '@zeitvertreib/types/discord-tracker';

const BACKEND_API_URL = 'https://zeitvertreib.vip/api/discord-tracker';
const OVERWATCH_API_KEY = process.env.OVERWATCH_API_KEY;

interface MemberData {
  lastUpdated: string;
  members: TrackedMember[];
}

function ensureDataDirectory(): void {
  const dataDir = path.dirname(DATA_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadMemberData(): MemberData | null {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const data = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading member data:', error);
  }
  return null;
}

function saveMemberData(data: MemberData): void {
  ensureDataDirectory();
  fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2));
}

async function sendToBackend(member: TrackedMember): Promise<boolean> {
  if (!OVERWATCH_API_KEY) {
    console.error('[Backend Sync] OVERWATCH_API_KEY is not set');
    return false;
  }

  try {
    const payload: MemberUpdatePayload = { member };
    const response = await fetch(BACKEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OVERWATCH_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Backend Sync] Failed to sync member ${member.id}: ${response.status} - ${errorText}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[Backend Sync] Error syncing member ${member.id}:`, error);
    return false;
  }
}

async function deleteFromBackend(memberId: string): Promise<boolean> {
  if (!OVERWATCH_API_KEY) {
    console.error('[Backend Sync] OVERWATCH_API_KEY is not set');
    return false;
  }

  try {
    const payload: MemberDeletePayload = { memberId };
    const response = await fetch(BACKEND_API_URL, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OVERWATCH_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Backend Sync] Failed to delete member ${memberId}: ${response.status} - ${errorText}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[Backend Sync] Error deleting member ${memberId}:`, error);
    return false;
  }
}

function hasSpecialRole(member: GuildMember): {
  isBooster: boolean;
  isDonator: boolean;
  isTeam: boolean;
} {
  const memberRoleIds = member.roles.cache.map((role) => role.id);

  return {
    isBooster: BOOSTER_ROLE_IDs.some((id) => memberRoleIds.includes(id)),
    isDonator: DONATOR_ROLE_IDs.some((id) => memberRoleIds.includes(id)),
    isTeam: TEAM_MEMBER_ROLE_IDs.some((id) => memberRoleIds.includes(id)),
  };
}

function memberToTracked(member: GuildMember, previousMember?: TrackedMember): TrackedMember {
  const currentRoles = hasSpecialRole(member);
  const now = Date.now();

  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    roles: {
      boosterSince: currentRoles.isBooster ? (previousMember?.roles.boosterSince ?? now) : null,
      donatorSince: currentRoles.isDonator ? (previousMember?.roles.donatorSince ?? now) : null,
      teamSince: currentRoles.isTeam ? (previousMember?.roles.teamSince ?? now) : null,
    },
  };
}

function formatRoles(roles: TrackedMember['roles']): string {
  const roleNames: string[] = [];
  if (roles.boosterSince) roleNames.push(`Booster (since ${new Date(roles.boosterSince).toLocaleDateString()})`);
  if (roles.donatorSince) roleNames.push(`Donator (since ${new Date(roles.donatorSince).toLocaleDateString()})`);
  if (roles.teamSince) roleNames.push(`Team Member (since ${new Date(roles.teamSince).toLocaleDateString()})`);
  return roleNames.length > 0 ? roleNames.join(', ') : 'No special roles';
}

async function fetchAllMembers(client: Client): Promise<Collection<string, GuildMember> | null> {
  try {
    const guild = await client.guilds.fetch(ZEITVERTREIB_GUILD_ID);
    if (!guild) {
      console.error('Could not find the guild');
      return null;
    }
    // Fetch all members (this requires GuildMembers intent)
    return await guild.members.fetch();
  } catch (error) {
    console.error('Error fetching guild members:', error);
    return null;
  }
}

async function trackMembers(client: Client): Promise<void> {
  const members = await fetchAllMembers(client);
  if (!members) return;

  const previousData = loadMemberData();
  const previousMembers = previousData?.members || [];

  // Create map for easier comparison
  const previousMemberMap = new Map(previousMembers.map((m) => [m.id, m]));

  const currentMembers: TrackedMember[] = members.map((member) =>
    memberToTracked(member, previousMemberMap.get(member.id)),
  );

  const currentMemberMap = new Map(currentMembers.map((m) => [m.id, m]));

  // Track which members were successfully synced
  const syncedMemberIds = new Set<string>();
  const deletedMemberIds = new Set<string>();

  // Check for members who left and delete from backend
  for (const prevMember of previousMembers) {
    if (!currentMemberMap.has(prevMember.id)) {
      console.log(
        `🚪 MEMBER LEFT: ${prevMember.displayName} (@${prevMember.username}) - Had roles: ${formatRoles(prevMember.roles)}`,
      );
      const success = await deleteFromBackend(prevMember.id);
      if (success) {
        deletedMemberIds.add(prevMember.id);
      }
    }
  }

  // Check for members who joined and sync to backend
  for (const currMember of currentMembers) {
    if (!previousMemberMap.has(currMember.id)) {
      console.log(
        `✅ MEMBER JOINED: ${currMember.displayName} (@${currMember.username}) - Roles: ${formatRoles(currMember.roles)}`,
      );
      const success = await sendToBackend(currMember);
      if (success) {
        syncedMemberIds.add(currMember.id);
      }
    }
  }

  // Check for role changes and sync to backend
  for (const currMember of currentMembers) {
    const prevMember = previousMemberMap.get(currMember.id);
    if (prevMember) {
      const boosterChanged = (prevMember.roles.boosterSince !== null) !== (currMember.roles.boosterSince !== null);
      const donatorChanged = (prevMember.roles.donatorSince !== null) !== (currMember.roles.donatorSince !== null);
      const teamChanged = (prevMember.roles.teamSince !== null) !== (currMember.roles.teamSince !== null);

      if (boosterChanged || donatorChanged || teamChanged) {
        console.log(
          `🔄 ROLE CHANGE: ${currMember.displayName} (@${currMember.username}) - Was: ${formatRoles(prevMember.roles)} -> Now: ${formatRoles(currMember.roles)}`,
        );
        const success = await sendToBackend(currMember);
        if (success) {
          syncedMemberIds.add(currMember.id);
        }
      }
    }
  }

  // Build the new member list:
  // - Keep previous data for members that failed to sync (will retry next cycle)
  // - Update with current data for members that synced successfully
  // - Remove members that were successfully deleted
  const newMembers: TrackedMember[] = [];

  for (const currMember of currentMembers) {
    const prevMember = previousMemberMap.get(currMember.id);
    const wasNewMember = !prevMember;
    const hadRoleChange =
      prevMember &&
      ((prevMember.roles.boosterSince !== null) !== (currMember.roles.boosterSince !== null) ||
        (prevMember.roles.donatorSince !== null) !== (currMember.roles.donatorSince !== null) ||
        (prevMember.roles.teamSince !== null) !== (currMember.roles.teamSince !== null));

    if (wasNewMember) {
      // New member: only save if backend sync succeeded
      if (syncedMemberIds.has(currMember.id)) {
        newMembers.push(currMember);
      }
      // If sync failed, don't save - will detect as "new" again next cycle
    } else if (hadRoleChange) {
      // Role change: save new data only if backend sync succeeded, otherwise keep old data
      if (syncedMemberIds.has(currMember.id)) {
        newMembers.push(currMember);
      } else {
        newMembers.push(prevMember);
      }
    } else {
      // No change: keep current data
      newMembers.push(currMember);
    }
  }

  // Add back members who left but failed to delete from backend
  for (const prevMember of previousMembers) {
    if (!currentMemberMap.has(prevMember.id) && !deletedMemberIds.has(prevMember.id)) {
      newMembers.push(prevMember);
    }
  }

  // Save current state
  const newData: MemberData = {
    lastUpdated: new Date().toISOString(),
    members: newMembers,
  };
  saveMemberData(newData);
}

export function startMemberTracking(client: Client): void {
  console.log('🔍 Starting member tracking service...');

  // Initial fetch
  trackMembers(client);

  // Set up interval for periodic checks
  setInterval(() => {
    trackMembers(client);
  }, TRACKING_INTERVAL_MS);

  console.log(`📊 Member tracking active - checking every ${TRACKING_INTERVAL_MS / 1000} seconds`);
}
