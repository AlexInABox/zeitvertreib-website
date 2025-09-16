export async function proxyFetch(
  url: string,
  options: RequestInit = {},
  env: Env,
): Promise<Response> {
  try {
    const target = new URL(url);

    const response = await fetch(`${env.PROXY_HOST}/${target}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'x-requested-with': 'cf-worker',
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
