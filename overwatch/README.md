# zeitvertreib-overwatch

A discord bot that reads every chat message sent in the Zeitvertreib Discord Server and filters bad stuff!

## Docker persistence

The member tracker stores its baseline in `/app/data/members.json`. This
directory must be mounted from a persistent host path in production:

```yaml
services:
  overwatch:
    image: your-overwatch-image
    env_file: .env
    volumes:
      - ./data:/app/data
```

The `./data` directory lives next to the Compose file, so it survives container
restarts.
