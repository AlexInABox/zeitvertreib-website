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

interface TrackedMember {
    id: string;
    username: string;
    displayName: string;
    roles: {
        isBooster: boolean;
        isDonator: boolean;
        isTeamMember: boolean;
    };
}

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

function hasSpecialRole(member: GuildMember): {
    isBooster: boolean;
    isDonator: boolean;
    isTeamMember: boolean;
} {
    const memberRoleIds = member.roles.cache.map((role) => role.id);

    return {
        isBooster: BOOSTER_ROLE_IDs.some((id) => memberRoleIds.includes(id)),
        isDonator: DONATOR_ROLE_IDs.some((id) => memberRoleIds.includes(id)),
        isTeamMember: TEAM_MEMBER_ROLE_IDs.some((id) =>
            memberRoleIds.includes(id),
        ),
    };
}

function memberToTracked(member: GuildMember): TrackedMember {
    return {
        id: member.id,
        username: member.user.username,
        displayName: member.displayName,
        roles: hasSpecialRole(member),
    };
}

function formatRoles(roles: TrackedMember['roles']): string {
    const roleNames: string[] = [];
    if (roles.isBooster) roleNames.push('Booster');
    if (roles.isDonator) roleNames.push('Donator');
    if (roles.isTeamMember) roleNames.push('Team Member');
    return roleNames.length > 0 ? roleNames.join(', ') : 'No special roles';
}

async function fetchAllMembers(
    client: Client,
): Promise<Collection<string, GuildMember> | null> {
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

    const currentMembers: TrackedMember[] = members.map((member) =>
        memberToTracked(member),
    );

    const previousData = loadMemberData();
    const previousMembers = previousData?.members || [];

    // Create maps for easier comparison
    const previousMemberMap = new Map(previousMembers.map((m) => [m.id, m]));
    const currentMemberMap = new Map(currentMembers.map((m) => [m.id, m]));

    // Check for members who left
    for (const prevMember of previousMembers) {
        if (!currentMemberMap.has(prevMember.id)) {
            console.log(
                `🚪 MEMBER LEFT: ${prevMember.displayName} (@${prevMember.username}) - Had roles: ${formatRoles(prevMember.roles)}`,
            );
        }
    }

    // Check for members who joined
    for (const currMember of currentMembers) {
        if (!previousMemberMap.has(currMember.id)) {
            console.log(
                `✅ MEMBER JOINED: ${currMember.displayName} (@${currMember.username}) - Roles: ${formatRoles(currMember.roles)}`,
            );
        }
    }

    // Check for role changes
    for (const currMember of currentMembers) {
        const prevMember = previousMemberMap.get(currMember.id);
        if (prevMember) {
            const rolesChanged =
                prevMember.roles.isBooster !== currMember.roles.isBooster ||
                prevMember.roles.isDonator !== currMember.roles.isDonator ||
                prevMember.roles.isTeamMember !== currMember.roles.isTeamMember;

            if (rolesChanged) {
                console.log(
                    `🔄 ROLE CHANGE: ${currMember.displayName} (@${currMember.username}) - Was: ${formatRoles(prevMember.roles)} -> Now: ${formatRoles(currMember.roles)}`,
                );
            }
        }
    }

    // Save current state
    const newData: MemberData = {
        lastUpdated: new Date().toISOString(),
        members: currentMembers,
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

    console.log(
        `📊 Member tracking active - checking every ${TRACKING_INTERVAL_MS / 1000} seconds`,
    );
}
