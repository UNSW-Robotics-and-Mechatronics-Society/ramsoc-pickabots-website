# Pickabots OBS Relay

Runs on the OBS streaming PC. Bridges the hosted control panel (`/control` on
the website) to the local OBS instance. Full setup — including the OBS scene
and browser-source layout — is in [`../docs/OBS.md`](../docs/OBS.md).

## Quick start

```bash
cd relay
npm install            # or pnpm install
copy .env.example .env # then fill in the four values
npm start
```

Leave the window open for the duration of the stream. It reconnects to both
OBS and Supabase by itself if either drops.

## Requirements

- Node 18+ on the OBS PC
- OBS 28+ with **Tools → WebSocket Server Settings → Enable WebSocket server**
- The Supabase URL + service role key of the shared sumobots/pickabots project
