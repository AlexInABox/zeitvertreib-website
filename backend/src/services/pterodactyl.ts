import { proxyFetch } from '../proxy.js';

const PTERODACTYL_PANEL_URL = 'https://panel.zeitvertreib.vip';
const PTERODACTYL_SERVER_ID = '1bdda3e6';

export interface PterodactylServerState {
  currentState: string | null;
  status: string | null;
  isInstalling: boolean;
  isSuspended: boolean;
  detailsOk: boolean;
}

function pterodactylHeaders(env: Env, withJsonBody = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.PTERODACTYL_API_KEY}`,
    Accept: 'application/vnd.pterodactyl.v1+json',
  };

  if (withJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

export async function getServerState(env: Env): Promise<PterodactylServerState> {
  const resourcesResponse = await proxyFetch(
    `${PTERODACTYL_PANEL_URL}/api/client/servers/${PTERODACTYL_SERVER_ID}/resources`,
    {
      headers: pterodactylHeaders(env),
    },
    env,
  );

  let currentState: string | null = null;
  if (resourcesResponse.ok) {
    const resourcesData: any = await resourcesResponse.json();
    currentState = resourcesData?.attributes?.current_state ?? null;
  }

  const detailsResponse = await proxyFetch(
    `${PTERODACTYL_PANEL_URL}/api/client/servers/${PTERODACTYL_SERVER_ID}`,
    {
      headers: pterodactylHeaders(env),
    },
    env,
  );

  let status: string | null = null;
  let isInstalling = false;
  let isSuspended = false;
  let detailsOk = false;
  if (detailsResponse.ok) {
    const detailsData: any = await detailsResponse.json();
    const attributes = detailsData?.attributes;
    status = attributes?.status ?? null;
    isInstalling = attributes?.is_installing === true;
    isSuspended = attributes?.is_suspended === true;
    detailsOk = true;
  }

  return { currentState, status, isInstalling, isSuspended, detailsOk };
}

export async function sendPowerSignal(env: Env, signal: 'start' | 'stop' | 'restart' | 'kill'): Promise<boolean> {
  const response = await proxyFetch(
    `${PTERODACTYL_PANEL_URL}/api/client/servers/${PTERODACTYL_SERVER_ID}/power`,
    {
      method: 'POST',
      headers: pterodactylHeaders(env, true),
      body: JSON.stringify({ signal }),
    },
    env,
  );

  return response.ok;
}

export async function triggerReinstall(env: Env): Promise<boolean> {
  const response = await proxyFetch(
    `${PTERODACTYL_PANEL_URL}/api/client/servers/${PTERODACTYL_SERVER_ID}/settings/reinstall`,
    {
      method: 'POST',
      headers: pterodactylHeaders(env, true),
    },
    env,
  );

  return response.ok;
}