# Environment Setup

<cite>
**Referenced Files in This Document**
- [docker-compose.yml](file://docker-compose.yml)
- [src/lib/integrations/index.ts](file://src/lib/integrations/index.ts)
- [src/db/index.ts](file://src/db/index.ts)
- [drizzle.config.json](file://drizzle.config.json)
- [backend/app/core/config.py](file://backend/app/core/config.py)
- [backend/app/db/session.py](file://backend/app/db/session.py)
- [backend/app/main.py](file://backend/app/main.py)
- [services/start-all.sh](file://services/start-all.sh)
- [src/app/api/auth/login/route.ts](file://src/app/api/auth/login/route.ts)
- [src/app/api/auth/callback/route.ts](file://src/app/api/auth/callback/route.ts)
- [src/lib/auth/oidc.ts](file://src/lib/auth/oidc.ts)
- [src/lib/auth/session.ts](file://src/lib/auth/session.ts)
- [src/app/api/minio/status/route.ts](file://src/app/api/minio/status/route.ts)
- [src/app/api/settings/system/route.ts](file://src/app/api/settings/system/route.ts)
- [.gitignore](file://.gitignore)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion
10. Appendices

## Introduction
This document provides a complete environment setup guide for GeraldOS development and production environments. It covers all required environment variables, configuration validation, environment-specific differences, and security best practices. You will find step-by-step instructions to run the full stack locally with Docker Compose, guidance for production deployment configurations, and examples of .env files for different scenarios. The guide also includes troubleshooting tips for common environment-related issues.

## Project Structure
GeraldOS is composed of:
- A Next.js application (server-side API routes read environment variables)
- A FastAPI backend service
- A PostgreSQL database
- Redis for caching/queues
- MinIO for object storage
- Orthanc PACS and OHIF viewer
- HAPI FHIR server
- n8n workflow automation
- LangGraph agent runtime
- Keycloak for identity and SSO

```mermaid
graph TB
subgraph "Next.js App"
A["API Routes"]
B["Integration Layer"]
end
subgraph "FastAPI Backend"
C["FastAPI App"]
D["DB Session"]
end
E["PostgreSQL"]
F["Redis"]
G["MinIO"]
H["Orthanc PACS"]
I["OHIF Viewer"]
J["HAPI FHIR"]
K["n8n"]
L["LangGraph"]
M["Keycloak"]
A --> B
B --> E
B --> F
B --> G
B --> H
B --> I
B --> J
B --> K
B --> L
A --> M
C --> D
D --> E
```

**Diagram sources**
- [docker-compose.yml:4-110](file://docker-compose.yml#L4-L110)
- [src/lib/integrations/index.ts:8-52](file://src/lib/integrations/index.ts#L8-L52)
- [backend/app/db/session.py:7-8](file://backend/app/db/session.py#L7-L8)

**Section sources**
- [docker-compose.yml:1-118](file://docker-compose.yml#L1-L118)

## Core Components
Environment variables are consumed by:
- Next.js integration layer (server-side only)
- Next.js database connection
- Drizzle migrations tooling
- FastAPI backend settings and DB session
- Auth flows (OIDC discovery, token exchange, session signing)
- Storage integrations (MinIO)
- System settings endpoints

Key responsibilities:
- Centralize non-secret client config for the browser via a dedicated endpoint
- Validate required secrets at startup or on first use
- Provide health checks for external services
- Keep secrets out of the browser

**Section sources**
- [src/lib/integrations/index.ts:8-52](file://src/lib/integrations/index.ts#L8-L52)
- [src/db/index.ts:4-8](file://src/db/index.ts#L4-L8)
- [drizzle.config.json:1-8](file://drizzle.config.json#L1-L8)
- [backend/app/core/config.py:4-19](file://backend/app/core/config.py#L4-L19)
- [backend/app/db/session.py:7-8](file://backend/app/db/session.py#L7-L8)
- [src/lib/auth/session.ts:13-16](file://src/lib/auth/session.ts#L13-L16)
- [src/app/api/minio/status/route.ts:7-15](file://src/app/api/minio/status/route.ts#L7-L15)

## Architecture Overview
The Next.js app reads environment variables server-side to connect to Postgres, Redis, MinIO, Orthanc, OHIF, FHIR, n8n, LangGraph, and Keycloak. The FastAPI backend uses its own settings module to connect to Postgres and other services. Authentication uses OIDC discovery from Keycloak and issues httpOnly JWT sessions signed with a secret.

```mermaid
sequenceDiagram
participant Client as "Browser"
participant Next as "Next.js API"
participant OIDC as "Keycloak"
participant DB as "PostgreSQL"
participant Cache as "Redis"
participant Store as "MinIO"
Client->>Next : GET /api/integrations/client-config
Next-->>Client : {keycloakEnabled, ohifUrl, orthancUrl, ...}
Client->>Next : GET /api/auth/login
Next->>OIDC : Discover OIDC endpoints
OIDC-->>Next : Discovery JSON
Next-->>Client : Redirect to Keycloak
Client->>OIDC : Login + authorize
OIDC-->>Next : Callback with code
Next->>OIDC : Exchange code for tokens
OIDC-->>Next : id_token + access_token
Next->>Next : Create session token (signed with AUTH_SECRET)
Next-->>Client : Set session cookie
Next->>DB : Query/Write data
Next->>Cache : Optional cache operations
Next->>Store : Upload/list objects
```

**Diagram sources**
- [src/app/api/integrations/client-config/route.ts:1-8](file://src/app/api/integrations/client-config/route.ts#L1-L8)
- [src/app/api/auth/login/route.ts:7-29](file://src/app/api/auth/login/route.ts#L7-L29)
- [src/app/api/auth/callback/route.ts:13-44](file://src/app/api/auth/callback/route.ts#L13-L44)
- [src/lib/auth/oidc.ts:18-87](file://src/lib/auth/oidc.ts#L18-L87)
- [src/lib/auth/session.ts:18-29](file://src/lib/auth/session.ts#L18-L29)
- [src/db/index.ts:14-24](file://src/db/index.ts#L14-L24)
- [src/lib/integrations/index.ts:134-266](file://src/lib/integrations/index.ts#L134-L266)

## Detailed Component Analysis

### Environment Variables Reference
All variables below are consumed server-side. Secrets must never be exposed to the browser.

- Database
  - DATABASE_URL: Required by Next.js database pool
  - Drizzle credentials URL used by migration tooling

- Redis
  - REDIS_URL: Used by integration health checks and optional features

- Object Storage (MinIO)
  - MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_REGION

- Identity (Keycloak)
  - KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET
  - AUTH_SECRET: Secret used to sign session cookies

- Imaging and Clinical
  - ORTHANC_URL, ORTHANC_USERNAME, ORTHANC_PASSWORD
  - OHIF_URL
  - DICOOGLE_URL
  - FHIR_URL

- Automation and AI
  - N8N_URL, N8N_API_KEY, N8N_WEBHOOK_BASE
  - LANGGRAPH_URL, LANGGRAPH_API_KEY, LANGGRAPH_ASSISTANT_ID

- FastAPI Backend
  - DATABASE_URL, REDIS_URL, MINIO_* keys, KEYCLOAK_*, ORTHANC_URL, FHIR_URL, GEMINI_API_KEY

Notes:
- Non-secret client configuration is safely exposed via a dedicated endpoint; secrets remain server-side.
- Some services can be omitted in minimal setups; the system reports not_configured when missing.

**Section sources**
- [src/lib/integrations/index.ts:8-52](file://src/lib/integrations/index.ts#L8-L52)
- [src/db/index.ts:4-8](file://src/db/index.ts#L4-L8)
- [drizzle.config.json:4-6](file://drizzle.config.json#L4-L6)
- [backend/app/core/config.py:4-19](file://backend/app/core/config.py#L4-L19)
- [src/lib/auth/session.ts:13-16](file://src/lib/auth/session.ts#L13-L16)
- [src/app/api/minio/status/route.ts:7-15](file://src/app/api/minio/status/route.ts#L7-L15)

### Development vs Production Differences
- Local development
  - Use docker-compose to start all services on localhost ports
  - Minimal credentials for convenience; rotate before any shared or production use
  - Optional local scripts to start services without containers

- Production
  - Replace all default credentials with strong, unique values
  - Use managed databases and caches where possible
  - Restrict network exposure; do not publish internal ports directly
  - Ensure HTTPS termination at the reverse proxy
  - Use secrets management (e.g., platform secrets store) instead of plain env files
  - Tune timeouts, connection pools, and resource limits per workload

**Section sources**
- [docker-compose.yml:4-110](file://docker-compose.yml#L4-L110)
- [services/start-all.sh:10-97](file://services/start-all.sh#L10-L97)

### Configuration Validation and Feature Flags
- Required variables
  - DATABASE_URL must be set; otherwise the database module throws an error at initialization
  - MinIO requires endpoint and credentials for operations; status endpoint returns not_configured if missing

- Feature flags
  - Integrations are enabled/disabled based on presence of their URLs/keys
  - Browser receives a safe subset of configuration indicating which features are available

- Health checks
  - Integration health checker probes each configured service and reports connected/unreachable/not_configured with latency

```mermaid
flowchart TD
Start(["Process Startup"]) --> CheckDB["Check DATABASE_URL"]
CheckDB --> |Missing| ThrowErr["Throw error"]
CheckDB --> |Present| InitPool["Initialize DB pool"]
InitPool --> CheckIntegrations["Load integrationConfig"]
CheckIntegrations --> BuildFlags["Build public client flags"]
BuildFlags --> Ready(["App ready"])
```

**Diagram sources**
- [src/db/index.ts:4-8](file://src/db/index.ts#L4-L8)
- [src/lib/integrations/index.ts:54-69](file://src/lib/integrations/index.ts#L54-L69)
- [src/lib/integrations/index.ts:134-266](file://src/lib/integrations/index.ts#L134-L266)

**Section sources**
- [src/db/index.ts:4-8](file://src/db/index.ts#L4-L8)
- [src/lib/integrations/index.ts:54-69](file://src/lib/integrations/index.ts#L54-L69)
- [src/app/api/minio/status/route.ts:7-15](file://src/app/api/minio/status/route.ts#L7-L15)

### Authentication Flow and Settings
- OIDC discovery from Keycloak using configured issuer
- Authorization redirect with state cookie
- Token exchange and ID token verification against JWKS
- Roles extracted from claims and stored in session
- Session cookie signed with AUTH_SECRET

```mermaid
sequenceDiagram
participant UI as "Browser"
participant Next as "Next.js"
participant KC as "Keycloak"
UI->>Next : GET /api/auth/login
Next->>KC : /.well-known/openid-configuration
KC-->>Next : Discovery
Next-->>UI : Redirect to authorization endpoint
UI->>KC : Authorize
KC-->>Next : Callback with code
Next->>KC : Exchange code for tokens
KC-->>Next : id_token + access_token
Next->>Next : Verify id_token and create session
Next-->>UI : Set httpOnly session cookie
```

**Diagram sources**
- [src/app/api/auth/login/route.ts:7-29](file://src/app/api/auth/login/route.ts#L7-L29)
- [src/app/api/auth/callback/route.ts:13-44](file://src/app/api/auth/callback/route.ts#L13-L44)
- [src/lib/auth/oidc.ts:18-87](file://src/lib/auth/oidc.ts#L18-L87)
- [src/lib/auth/session.ts:18-29](file://src/lib/auth/session.ts#L18-L29)

**Section sources**
- [src/app/api/auth/login/route.ts:7-29](file://src/app/api/auth/login/route.ts#L7-L29)
- [src/app/api/auth/callback/route.ts:13-44](file://src/app/api/auth/callback/route.ts#L13-L44)
- [src/lib/auth/oidc.ts:18-87](file://src/lib/auth/oidc.ts#L18-L87)
- [src/lib/auth/session.ts:13-29](file://src/lib/auth/session.ts#L13-L29)

### Storage and Imaging Integrations
- MinIO status endpoint validates endpoint and credentials; returns buckets list when reachable
- Orthanc, OHIF, Dicoogle, and FHIR endpoints are probed during integration health checks
- These services are optional; absence is reported as not_configured

**Section sources**
- [src/app/api/minio/status/route.ts:7-23](file://src/app/api/minio/status/route.ts#L7-L23)
- [src/lib/integrations/index.ts:152-204](file://src/lib/integrations/index.ts#L152-L204)

### System Settings Endpoint
- Provides a key-value store for runtime settings
- Supports reading and updating settings with audit metadata

**Section sources**
- [src/app/api/settings/system/route.ts:6-32](file://src/app/api/settings/system/route.ts#L6-L32)

## Dependency Analysis
Services defined in the compose file and how they depend on environment variables:

```mermaid
graph LR
PG["PostgreSQL :5432"]
RDS["Redis :6379"]
MC["MinIO :9000/:9001"]
OR["Orthanc :8042"]
OH["OHIF :3001"]
FH["HAPI FHIR :8090"]
N8["n8n :5678"]
LG["LangGraph :8123"]
KC["Keycloak :8180"]
NEXT["Next.js App"]
FAST["FastAPI Backend"]
NEXT --> PG
NEXT --> RDS
NEXT --> MC
NEXT --> OR
NEXT --> OH
NEXT --> FH
NEXT --> N8
NEXT --> LG
NEXT --> KC
FAST --> PG
FAST --> RDS
FAST --> MC
FAST --> OR
FAST --> FH
FAST --> KC
```

**Diagram sources**
- [docker-compose.yml:4-110](file://docker-compose.yml#L4-L110)
- [src/lib/integrations/index.ts:8-52](file://src/lib/integrations/index.ts#L8-L52)
- [backend/app/core/config.py:4-19](file://backend/app/core/config.py#L4-L19)

**Section sources**
- [docker-compose.yml:4-110](file://docker-compose.yml#L4-L110)

## Performance Considerations
- Connection pooling
  - PostgreSQL: ensure appropriate pool size for concurrent requests
  - Redis: reuse connections; avoid per-request connects
- Timeouts
  - External HTTP calls use timeouts; tune per service SLAs
- Health checks
  - Use integration health endpoint to detect slow or unhealthy dependencies early
- Caching
  - Prefer Redis for frequently accessed data; invalidate appropriately
- Storage
  - MinIO: use presigned URLs for large uploads/downloads to reduce server load

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:

- Missing DATABASE_URL
  - Symptom: Application fails to initialize database pool
  - Resolution: Set DATABASE_URL in your environment

- Keycloak not configured
  - Symptom: Login redirects to error page indicating Keycloak not configured
  - Resolution: Set KEYCLOAK_URL and related keys; verify OIDC discovery endpoint

- MinIO not configured or unreachable
  - Symptom: Status endpoint returns not_configured or unreachable
  - Resolution: Set MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY; ensure service is healthy

- Integration health failures
  - Symptom: Health check shows unreachable for a service
  - Resolution: Verify service port mapping, network reachability, and credentials

- Session signature mismatch
  - Symptom: Users cannot stay logged in across requests
  - Resolution: Ensure AUTH_SECRET is consistent across deployments and restarts

- Drizzle migrations fail
  - Symptom: Migration tool cannot connect to database
  - Resolution: Confirm drizzle dbCredentials URL matches your database

Security notes:
- Never commit .env files; they are ignored by default
- Rotate secrets regularly and restrict access to secrets stores

**Section sources**
- [src/db/index.ts:4-8](file://src/db/index.ts#L4-L8)
- [src/app/api/auth/login/route.ts:7-29](file://src/app/api/auth/login/route.ts#L7-L29)
- [src/app/api/minio/status/route.ts:7-23](file://src/app/api/minio/status/route.ts#L7-L23)
- [src/lib/integrations/index.ts:134-266](file://src/lib/integrations/index.ts#L134-L266)
- [src/lib/auth/session.ts:13-16](file://src/lib/auth/session.ts#L13-L16)
- [drizzle.config.json:4-6](file://drizzle.config.json#L4-L6)
- [.gitignore:9-15](file://.gitignore#L9-L15)

## Conclusion
GeraldOS centralizes environment configuration in server-side modules, exposing only safe, non-secret flags to the browser. Use Docker Compose for local development and hardened secrets for production. Validate required variables early, monitor integration health, and follow security best practices to keep credentials safe and systems reliable.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Local Development with Docker Compose
- Start the full stack
  - Run the compose file to launch PostgreSQL, Redis, MinIO, Orthanc, Keycloak, HAPI FHIR, n8n, OHIF, and LangGraph
- Configure environment variables
  - Set DATABASE_URL, Redis, MinIO, Keycloak, and other integration variables for the Next.js app and FastAPI backend
- Verify health
  - Use the integration health endpoint to confirm connectivity
- Optional: run services locally without containers
  - Use the provided script to start services on localhost ports

**Section sources**
- [docker-compose.yml:4-110](file://docker-compose.yml#L4-L110)
- [services/start-all.sh:10-97](file://services/start-all.sh#L10-L97)

### Production Deployment Checklist
- Replace all default credentials with strong, unique values
- Use managed services for database and cache where feasible
- Terminate TLS at the reverse proxy; enforce HTTPS
- Store secrets in a secure vault; inject via platform secrets
- Limit network exposure; do not publish internal service ports
- Configure resource limits and monitoring/alerting
- Test failover and backup procedures

[No sources needed since this section provides general guidance]

### Example .env Templates

- Local development (Docker Compose)
  - DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db
  - REDIS_URL=redis://localhost:6379
  - MINIO_ENDPOINT=http://localhost:9000
  - MINIO_ACCESS_KEY=geraldos
  - MINIO_SECRET_KEY=geraldos-secret
  - MINIO_BUCKET=geraldos
  - MINIO_REGION=us-east-1
  - KEYCLOAK_URL=http://localhost:8180
  - KEYCLOAK_REALM=geraldos
  - KEYCLOAK_CLIENT_ID=geraldos-frontend
  - KEYCLOAK_CLIENT_SECRET=<your-client-secret>
  - AUTH_SECRET=<strong-random-secret>
  - ORTHANC_URL=http://localhost:8042
  - ORTHANC_USERNAME=orthanc
  - ORTHANC_PASSWORD=orthanc
  - OHIF_URL=http://localhost:3001
  - DICOOGLE_URL=http://localhost:8095
  - FHIR_URL=http://localhost:8090/fhir
  - N8N_URL=http://localhost:5678
  - N8N_API_KEY=<your-n8n-api-key>
  - N8N_WEBHOOK_BASE=http://localhost:5678
  - LANGGRAPH_URL=http://localhost:8123
  - LANGGRAPH_API_KEY=<your-langgraph-api-key>
  - LANGGRAPH_ASSISTANT_ID=geraldos-agent

- Production (example)
  - DATABASE_URL=postgresql://user:password@db-host:5432/app_db
  - REDIS_URL=redis://cache-host:6379
  - MINIO_ENDPOINT=https://storage.example.com
  - MINIO_ACCESS_KEY=<prod-access-key>
  - MINIO_SECRET_KEY=<prod-secret-key>
  - MINIO_BUCKET=geraldos-prod
  - MINIO_REGION=us-east-1
  - KEYCLOAK_URL=https://auth.example.com
  - KEYCLOAK_REALM=geraldos
  - KEYCLOAK_CLIENT_ID=geraldos-prod
  - KEYCLOAK_CLIENT_SECRET=<prod-client-secret>
  - AUTH_SECRET=<prod-strong-secret>
  - ORTHANC_URL=https://pacs.example.com
  - ORTHANC_USERNAME=<orthanc-user>
  - ORTHANC_PASSWORD=<orthanc-password>
  - OHIF_URL=https://viewer.example.com
  - DICOOGLE_URL=https://dicoogle.example.com
  - FHIR_URL=https://fhir.example.com/fhir
  - N8N_URL=https://n8n.example.com
  - N8N_API_KEY=<prod-n8n-api-key>
  - N8N_WEBHOOK_BASE=https://n8n.example.com
  - LANGGRAPH_URL=https://langgraph.example.com
  - LANGGRAPH_API_KEY=<prod-langgraph-api-key>
  - LANGGRAPH_ASSISTANT_ID=geraldos-agent

Note: Do not commit these files. Use your platform’s secrets management to inject them at runtime.

**Section sources**
- [src/lib/integrations/index.ts:8-52](file://src/lib/integrations/index.ts#L8-L52)
- [src/db/index.ts:4-8](file://src/db/index.ts#L4-L8)
- [backend/app/core/config.py:4-19](file://backend/app/core/config.py#L4-L19)
- [.gitignore:9-15](file://.gitignore#L9-L15)