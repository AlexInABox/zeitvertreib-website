const PRODUCTION_HOST = 'zeitvertreib.vip';
const MASTODON_HOST = 'mastodon.zeitvertreib.vip';
const MATRIX_HOST = 'matrix.zeitvertreib.vip';
const WEBFINGER_PATH = '/.well-known/webfinger';
const MATRIX_WELL_KNOWN_PREFIX = '/.well-known/matrix/';

type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === PRODUCTION_HOST && url.pathname === WEBFINGER_PATH) {
      const target = new URL(request.url);
      target.protocol = 'https:';
      target.hostname = MASTODON_HOST;
      target.port = '';
      return new Response(null, {
        status: 301,
        headers: {
          Location: target.toString(),
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Matrix delegation: the homeserver lives on matrix.zeitvertreib.vip, but
    // user and room IDs use the root domain. Tuwunel generates the delegation
    // files from its own config, so proxy them instead of duplicating values.
    if (url.hostname === PRODUCTION_HOST && url.pathname.startsWith(MATRIX_WELL_KNOWN_PREFIX)) {
      const target = new URL(request.url);
      target.protocol = 'https:';
      target.hostname = MATRIX_HOST;
      target.port = '';

      const upstream = await fetch(target, { method: request.method });
      const response = new Response(upstream.body, upstream);
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }

    return env.ASSETS.fetch(request);
  },
};
