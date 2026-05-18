export async function proxyFetch(url: string, options: RequestInit = {}, env: Env): Promise<Response> {
  // if the proxy api key isn't configured (e.g. local development), just do a normal fetch
  if (!env.PROXIED_API_KEY) {
    return fetch(url, options);
  }

  try {
    const proxyUrl = `https://cors.zeitvertreib.vip/unrestricted?url=${encodeURIComponent(url)}`;

    const response = await fetch(proxyUrl, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'PROXIED-Authorization': `Bearer ${env.PROXIED_API_KEY}`,
      },
    });

    // If proxy responds successfully, return the response
    return response;
  } catch (error) {
    console.warn('Proxy failed, falling back to direct fetch:', error);
    // Fallback to normal fetch if proxy fails
    return fetch(url, options);
  }
}
