# Zeitvertreib Counted Service

Small API service used by Zeitvertreib to store and query historical player counts.

## Endpoints

```text
POST https://counted.zeitvertreib.vip/
GET  https://counted.zeitvertreib.vip/?startDate=<epoch-seconds>&endDate=<epoch-seconds>
```

## Database Schema

The SQLite database is initialized from schema.sql on startup.

```sql
CREATE TABLE IF NOT EXISTS readings (
	ts   BIGINT PRIMARY KEY,
	val  SMALLINT NOT NULL
);
```

## Write Behavior

POST / expects a plain-text integer in the request body.

- Allowed value range: 0 to 99
- Requires Authorization header: Bearer <API_KEY>
- Uses insert-on-change logic and only writes if the value changed from the latest row

```sql
INSERT INTO readings (ts, val)
SELECT :ts, :val
WHERE NOT EXISTS (
	SELECT 1 FROM readings
	WHERE val = :val
	AND ts = (SELECT MAX(ts) FROM readings)
);
```

## Quick Usage

Send a new count value:

```js
await fetch('https://counted.zeitvertreib.vip/', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <API_KEY>',
    'Content-Type': 'text/plain',
  },
  body: '42',
});
```

Query a range with epoch seconds:

```js
const startDate = 1714521600;
const endDate = 1714608000;

const response = await fetch(`https://counted.zeitvertreib.vip/?startDate=${startDate}&endDate=${endDate}`, {
  headers: {
    Origin: 'https://zeitvertreib.vip',
  },
});

const data = await response.json();
```

## Input Rules

GET / only accepts positive epoch seconds.

- startDate and endDate must be integers
- endDate must be after startDate
- max allowed range is 1 year

## Origin Restriction

CORS response headers are only applied for these origins:

- https://dev.zeitvertreib.vip
- https://zeitvertreib.vip
- https://www.zeitvertreib.vip
- http://localhost:4200
- http://127.0.0.1:4200
- http://localhost:4173
- http://127.0.0.1:4173
