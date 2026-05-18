# Zeitvertreib CORS Proxy

Small CORS proxy used by Zeitvertreib to download Medal clips from the Medal CDN.

## Endpoint

```text
https://cors.zeitvertreib.vip/?url=<encoded-target-url>
```

## Allowed Target URL (Example)

```text
https://cdn.medal.tv/mediac/dFopZ9J1kIYZUF.mp4?auth=***
```

## Quick Usage

Always encode the full target URL before passing it to `?url=`.

```js
const target = 'https://cdn.medal.tv/mediac/dFopZ9J1kIYZUF.mp4?auth=***';
const proxied = `https://cors.zeitvertreib.vip/?url=${encodeURIComponent(target)}`;

const response = await fetch(proxied, {
  headers: {
    Origin: 'https://zeitvertreib.vip',
  },
});
```

## Why Encode?

Encoding prevents query parsing issues with characters like `?`, `&`, and `=`.

## Header Passthrough

Response headers from Medal are passed through. Useful for integrity checks, for example:

- `x-amz-checksum-crc32c`
- `etag`

## Origin Restriction

This proxy only serves requests with one of these `Origin` values:

- `https://dev.zeitvertreib.vip`
- `https://zeitvertreib.vip`

## Unrestricted Endpoint

The `/unrestricted` endpoint acts as a general-purpose proxy supporting all HTTP methods, with no CORS restrictions.
It requires an API key for access.

**Endpoint:**
```text
https://cors.zeitvertreib.vip/unrestricted?url=<encoded-target-url>
```

**Authentication:**
Provide the key via the `PROXIED-Authorization` header matchning the `PROXIED_API_KEY` environment variable.

```http
PROXIED-Authorization: Bearer <your-api-key>
```
