import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { proxyFetch } from '../proxy.js';
import { getServerState, sendPowerSignal, type PterodactylServerState } from '../services/pterodactyl.js';

const INITIAL_DELAY_MS = 20 * 1000;
const POLL_INTERVAL_MS = 10 * 1000;
const MAX_WAIT_MS = 2 * 60 * 1000;

interface ReinstallTask {
  interactionToken: string;
  deadline: number;
  sawInstalling: boolean;
  finalMessage?: string;
}

export class ReinstallManager {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/start') {
      const body: any = await request.json();
      const interactionToken = body.interactionToken;

      if (!interactionToken) {
        return new Response(JSON.stringify({ error: 'Missing interactionToken' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await this.state.storage.put<ReinstallTask>('task', {
        interactionToken,
        deadline: Date.now() + MAX_WAIT_MS,
        sawInstalling: false,
      });
      await this.state.storage.setAlarm(Date.now() + INITIAL_DELAY_MS);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const task = await this.state.storage.get<ReinstallTask>('task');
    if (!task) return;

    if (task.finalMessage) {
      await this.deliverFinalMessage(task);
      return;
    }

    let serverState: PterodactylServerState | null = null;
    try {
      serverState = await getServerState(this.env);
    } catch (error) {
      console.error('ReinstallManager getServerState error:', error);
    }

    let finalMessage: string | null = null;

    if (serverState) {
      if (serverState.status === 'install_failed') {
        finalMessage = '❌ Die Neuinstallation ist fehlgeschlagen. Bitte im Panel nachsehen.';
      } else {
        const finished =
          serverState.detailsOk &&
          !serverState.isInstalling &&
          serverState.status !== 'installing' &&
          serverState.status !== 'install_failed';

        if (finished && (task.sawInstalling || Date.now() >= task.deadline)) {
          if (serverState.currentState === 'running') {
            finalMessage = '✅ Die Neuinstallation ist abgeschlossen, der Server läuft bereits.';
          } else {
            let started = false;
            try {
              started = await sendPowerSignal(this.env, 'start');
            } catch (error) {
              console.error('ReinstallManager sendPowerSignal error:', error);
            }
            finalMessage = started
              ? '✅ **Neuinstallation abgeschlossen!** Der Server wird gestartet.'
              : '✅ Die Neuinstallation ist abgeschlossen, aber der Server ließ sich nicht automatisch starten. Nutze `/restart`, um ihn zu starten.';
          }
        }
      }
    }

    if (finalMessage === null && Date.now() >= task.deadline) {
      finalMessage =
        '⚠️ Die Neuinstallation läuft noch. Nutze `/restart` in ein paar Minuten, um den Server manuell zu starten.';
    }

    if (finalMessage !== null) {
      await this.state.storage.put<ReinstallTask>('task', { ...task, finalMessage });
      await this.deliverFinalMessage({ ...task, finalMessage });
      return;
    }

    await this.state.storage.put<ReinstallTask>('task', {
      ...task,
      sawInstalling: task.sawInstalling || serverState?.isInstalling === true,
    });
    await this.state.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
  }

  private async deliverFinalMessage(task: ReinstallTask): Promise<void> {
    if (!task.finalMessage) return;

    const delivered = await this.postMessage(task.interactionToken, task.finalMessage);
    if (delivered) {
      await this.state.storage.delete('task');
    } else {
      await this.state.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
    }
  }

  private async postMessage(interactionToken: string, content: string): Promise<boolean> {
    try {
      const rest = new REST({ version: '10' }).setToken(this.env.DISCORD_TOKEN);
      (rest as any).fetch = (url: string, init: any) => proxyFetch(url, init, this.env);
      await rest.patch(Routes.webhookMessage(this.env.DISCORD_APPLICATION_ID, interactionToken), {
        body: { content },
      });
      return true;
    } catch (error) {
      console.error('ReinstallManager postMessage error:', error);
      return false;
    }
  }
}