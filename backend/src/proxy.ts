export async function proxyFetch(
  url: string,
  options: RequestInit = {},
  env: Env,
): Promise<Response> {
  const target = new URL(url);

  return fetch(`${env.PROXY_HOST}/${target}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}
