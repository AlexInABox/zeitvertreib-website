/**
 * Durable Object for storing and managing playerlist data
 */

export class PlayerlistStorage {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (request.method) {
        case 'GET':
          if (path === '/playerlist') {
            return await this.getPlayerlist();
          }
          break;

        case 'POST':
          if (path === '/playerlist') {
            return await this.updatePlayerlist(request);
          }
          break;
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('PlayerlistStorage error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  private async getPlayerlist(): Promise<Response> {
    const playerlist = await this.state.storage.get('playerlist');

    if (!playerlist) {
      return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(playerlist), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async updatePlayerlist(request: Request): Promise<Response> {
    const playerlistData = await request.json();

    // Validate that it's an array
    if (!Array.isArray(playerlistData)) {
      return new Response(JSON.stringify({ error: 'Playerlist must be an array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Optional: Validate player objects structure
    const isValidPlayerlist = playerlistData.every(
      (player) => typeof player === 'object' && player !== null && typeof player.Name === 'string',
    );

    if (!isValidPlayerlist) {
      return new Response(JSON.stringify({ error: 'Invalid player data structure' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Store the playerlist with timestamp
    await this.state.storage.put('playerlist', playerlistData);
    await this.state.storage.put('lastUpdated', new Date().toISOString());

    console.log(`Stored playerlist with ${playerlistData.length} players`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Stored ${playerlistData.length} players`,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
