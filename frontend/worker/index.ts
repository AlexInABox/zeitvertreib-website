const PRODUCTION_HOST = 'zeitvertreib.vip';
const MASTODON_HOST = 'mastodon.zeitvertreib.vip';
const WEBFINGER_PATH = '/.well-known/webfinger';

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

    return env.ASSETS.fetch(request);
  },
};
