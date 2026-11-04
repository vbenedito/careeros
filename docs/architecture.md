# Architecture (v0)

Status: **Approved** (Gate 2, 2026-11-04). Details live in [`specs/v0`](../specs/v0/) and [`docs/adr`](adr/).

## System context

```mermaid
flowchart LR
  subgraph Browser["User's Chrome"]
    EXT["Extension (MV3)<br/>service worker + popup"]
    DASH_UI["Dashboard (browser)"]
  end
  subgraph Vercel
    NEXT["Next.js server<br/>RSC + route handlers"]
  end
  subgraph Supabase
    AUTH["Auth (Google, GitHub)"]
    PG[("Postgres + RLS<br/>tracked_domains<br/>study_sessions")]
  end
  DASH_UI -- cookies --> NEXT
  NEXT -- user JWT --> PG
  NEXT -- service role:<br/>generateLink, deleteUser --> AUTH
  DASH_UI <-- externally_connectable<br/>PING/CONNECT/STATUS/DISCONNECT --> EXT
  EXT -- own session JWT:<br/>ingest RPC, domains --> PG
  EXT -- verifyOtp, refresh --> AUTH
  DASH_UI -- OAuth PKCE --> AUTH
```

## Extension internals

```mermaid
flowchart TB
  CE["Chrome events<br/>tabs · windows · idle · alarms"] --> AD["Adapters<br/>(background/)"]
  AD -- engine events --> EN["Tracking engine<br/>pure (state, event, now) → (state, effects)"]
  EN -- effects --> AD
  AD --> ST[("chrome.storage.local<br/>state · outbox · quarantine · domains · session")]
  SY["Sync worker<br/>alarm 5 min · backoff"] --> ST
  SY -- ingest_study_sessions --> SB["Supabase"]
  PU["Popup (React)"] -- read + subscribe --> ST
  PU -- add site / settings --> AD
```

Key properties:

- **Engine is pure** (TRK-16): all rules testable with a fake clock; Chrome specifics isolated in adapters.
- **Everything persisted** (TRK-12): the service worker can die at any time.
- **Exactly-once sync** (ADR-0004): client UUIDs + `ON CONFLICT DO NOTHING` + server-confirmed removal from the outbox.
- **Independent sessions** (ADR-0003): dashboard and extension never share refresh tokens.

## Interval lifecycle

```mermaid
stateDiagram-v2
  [*] --> Open: eligible + active
  Open --> Closed: pause / domain change / 30 min / midnight / disabled / sign-out
  Closed --> Outbox: duration ≥ 5 s
  Closed --> [*]: duration < 5 s (discarded)
  Outbox --> Synced: server confirms id
  Outbox --> Quarantine: server rejects id
  Synced --> [*]: pruned after today
```
