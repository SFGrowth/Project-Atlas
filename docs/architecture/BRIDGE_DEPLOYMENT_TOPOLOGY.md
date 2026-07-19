# Atlas Databento Bridge — Deployment Topology Reference

**Sprint 123A.2 — Gate G2 Round 2**

This document describes the three supported deployment topologies for the Atlas Databento bridge connection between the Python feed adapter and the TypeScript bridge server.

---

## Overview

The Atlas Databento bridge is a private, authenticated WebSocket connection between two components:

- **Python feed adapter** (`services/databento-feed/feed_adapter.py`) — connects to Databento Live API and normalises records.
- **TypeScript bridge server** (`server/market-data/bridge-server.ts`) — receives normalised records and emits them to the AtlasEventBus.

The bridge is **never publicly exposed**. Authentication via `BRIDGE_AUTH_TOKEN` is **always required** regardless of topology. `127.0.0.1` is the **secure default**.

---

## Security Invariants (All Topologies)

| Invariant | Requirement |
|-----------|-------------|
| Public exposure | Bridge is **NEVER** publicly exposed |
| Authentication | `BRIDGE_AUTH_TOKEN` is **ALWAYS** required |
| Secret safety | Secrets **NEVER** appear in logs or bridge payloads |
| Default host | `127.0.0.1` (loopback) is the secure default |
| TLS | Required when `BRIDGE_HOST` is not localhost or private network |

---

## Topology 1: Development (Localhost)

**Use case:** Local development, single-machine testing.

Both the Python adapter and the TypeScript server run on the same host. The bridge binds to the loopback interface.

| Parameter | Value |
|-----------|-------|
| `BRIDGE_HOST` | `127.0.0.1` (default — no env var needed) |
| `BRIDGE_PORT` | `9876` (default) |
| TLS | Not required (loopback is not network-exposed) |
| `BRIDGE_AUTH_TOKEN` | **Required** |
| `BRIDGE_TLS` | Not set |

**Configuration:**

```bash
# No BRIDGE_HOST needed — defaults to 127.0.0.1
export BRIDGE_AUTH_TOKEN="<secure-random-token>"
export BRIDGE_PORT=9876
```

**Security note:** The loopback interface (`127.0.0.1`) is not accessible from outside the host. TLS is not required because the connection never traverses a network.

---

## Topology 2: Production Same-Host (Localhost)

**Use case:** Production deployment where both components run on the same server or VM.

Identical to Topology 1. The bridge binds to `127.0.0.1:9876`. This is the **secure default** for production when both components are co-located.

| Parameter | Value |
|-----------|-------|
| `BRIDGE_HOST` | `127.0.0.1` (default — no env var needed) |
| `BRIDGE_PORT` | `9876` (default) |
| TLS | Not required (loopback is not network-exposed) |
| `BRIDGE_AUTH_TOKEN` | **Required** |
| `BRIDGE_TLS` | Not set |

**Configuration:**

```bash
# Same as development — localhost is the secure default
export BRIDGE_AUTH_TOKEN="<secure-random-token>"
```

**Security note:** This topology is preferred for production because it eliminates network exposure entirely. If both components can run on the same host, this topology should be used.

---

## Topology 3: Production Separate Containers

**Use case:** Production deployment where the Python adapter and TypeScript server run in separate containers (e.g., Docker Compose, Kubernetes).

The bridge binds to a private container network address. **TLS is required** because the connection traverses a container network.

| Parameter | Value |
|-----------|-------|
| `BRIDGE_HOST` | Private container IP or service name (e.g., `10.0.0.2`, `databento-adapter`) |
| `BRIDGE_PORT` | `9876` (default) |
| TLS | **REQUIRED** (`BRIDGE_TLS=true`) |
| `BRIDGE_AUTH_TOKEN` | **Required** |
| `BRIDGE_TLS` | `true` |
| `BRIDGE_TLS_CERT` | Path to TLS certificate |
| `BRIDGE_TLS_KEY` | Path to TLS private key |

**Configuration:**

```bash
export BRIDGE_HOST="databento-adapter"       # Docker service name or private IP
export BRIDGE_AUTH_TOKEN="<secure-random-token>"
export BRIDGE_TLS=true
export BRIDGE_TLS_CERT="/run/secrets/bridge.crt"
export BRIDGE_TLS_KEY="/run/secrets/bridge.key"
```

**Network allowlist:** The bridge listener should only accept connections from the Python adapter container's IP address. Configure firewall rules or Docker network policies to enforce this.

**Security requirements:**

- The bridge endpoint (`BRIDGE_HOST:BRIDGE_PORT`) must **not** be reachable from outside the private container network.
- TLS certificates must be issued by a trusted internal CA or self-signed with the adapter's certificate pinned.
- `BRIDGE_AUTH_TOKEN` provides a second layer of authentication beyond TLS.

**Validation:** `validateBridgeTopology()` in `bridge-server.ts` will **throw at startup** if `BRIDGE_HOST` is a non-private address and `BRIDGE_TLS` is not set to `true`.

---

## Topology Selection Guide

```
Is the Python adapter on the same host as the TypeScript server?
├── YES → Use Topology 1 (dev) or Topology 2 (prod)
│         BRIDGE_HOST=127.0.0.1 (default)
│         No TLS needed.
└── NO  → Use Topology 3 (separate containers)
          BRIDGE_HOST=<private container IP or service name>
          BRIDGE_TLS=true (REQUIRED)
          BRIDGE_TLS_CERT and BRIDGE_TLS_KEY must be set.
```

---

## Environment Variables Reference

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `BRIDGE_HOST` | `127.0.0.1` | No | Host address the bridge binds to |
| `BRIDGE_PORT` | `9876` | No | Port the bridge listens on |
| `BRIDGE_AUTH_TOKEN` | — | **Yes** | Authentication token (all topologies) |
| `BRIDGE_TLS` | — | Topology 3 only | Set to `true` to enable TLS |
| `BRIDGE_TLS_CERT` | — | Topology 3 only | Path to TLS certificate file |
| `BRIDGE_TLS_KEY` | — | Topology 3 only | Path to TLS private key file |

---

## Implementation Notes

The `validateBridgeTopology()` function in `server/market-data/bridge-server.ts` enforces these rules at server startup:

1. If `BRIDGE_HOST` is a private/loopback address → start normally (Topologies 1 and 2).
2. If `BRIDGE_HOST` is a private network address (not 127.0.0.1) → log a warning but allow startup.
3. If `BRIDGE_HOST` is a non-private address and `BRIDGE_TLS` is not `true` → **throw** (prevents insecure startup).

The Python adapter reads `BRIDGE_HOST` from the environment with the same default (`127.0.0.1`), ensuring both sides use consistent addressing.

---

*Document version: Sprint 123A.2 Gate G2 Round 2*
*See also: `server/market-data/bridge-server.ts`, `services/databento-feed/feed_adapter.py`*
