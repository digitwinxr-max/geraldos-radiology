#!/usr/bin/env bash
# GeraldOS Service Starter
# Starts all integration services that are not managed by systemd in this environment.
set -e

echo "=== GeraldOS Service Startup ==="

# ── Redis ──────────────────────────────────────────────
if ! redis-cli ping > /dev/null 2>&1; then
  echo "[redis] Starting..."
  redis-server --daemonize yes --logfile /tmp/redis.log --bind 127.0.0.1 --port 6379
  sleep 1
fi
echo "[redis] $(redis-cli ping)"

# ── Orthanc ────────────────────────────────────────────
if ! curl -s -u orthanc:orthanc http://localhost:8042/system > /dev/null 2>&1; then
  echo "[orthanc] Starting..."
  mkdir -p /tmp/orthancdb
  /usr/sbin/Orthanc /etc/orthanc/orthanc.json > /tmp/orthanc.log 2>&1 &
  sleep 6
fi
curl -s -u orthanc:orthanc http://localhost:8042/system | python3 -c "import json,sys;d=json.load(sys.stdin);print(f'[orthanc] v{d[\"Version\"]} DICOMweb={d[\"PluginsEnabled\"]}')" 2>/dev/null

# ── MinIO ──────────────────────────────────────────────
if ! curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
  echo "[minio] Starting..."
  mkdir -p /tmp/miniodata
  MINIO_ROOT_USER=geraldos MINIO_ROOT_PASSWORD=geraldos-secret \
    minio server /tmp/miniodata --address ":9000" --console-address ":9001" \
    > /tmp/minio.log 2>&1 &
  sleep 4
  mc alias set geraldos http://localhost:9000 geraldos geraldos-secret 2>/dev/null
  mc mb --ignore-existing geraldos/geraldos 2>/dev/null
fi
echo "[minio] $(curl -s -o /dev/null -w '%{http_code}' http://localhost:9000/minio/health/live)"

# ── Keycloak (OIDC compatible) ─────────────────────────
if ! curl -s http://localhost:8180/realms/geraldos/.well-known/openid-configuration > /dev/null 2>&1; then
  echo "[keycloak] Starting..."
  node /tmp/keycloak-server/server.mjs > /tmp/keycloak.log 2>&1 &
  sleep 3
fi
echo "[keycloak] $(curl -s http://localhost:8180/realms/geraldos/.well-known/openid-configuration | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["issuer"])' 2>/dev/null)"

# ── HAPI FHIR ──────────────────────────────────────────
if ! curl -s http://localhost:8090/fhir/metadata > /dev/null 2>&1; then
  echo "[fhir] Starting..."
  node /tmp/fhir-server/server.mjs > /tmp/fhir.log 2>&1 &
  sleep 2
fi
echo "[fhir] $(curl -s http://localhost:8090/fhir/metadata | python3 -c 'import json,sys;d=json.load(sys.stdin);print("FHIR",d["fhirVersion"])' 2>/dev/null)"

# ── Dicoogle ───────────────────────────────────────────
if ! curl -s http://localhost:8095/search?query=* > /dev/null 2>&1; then
  echo "[dicoogle] Starting..."
  node /tmp/dicoogle-server/server.mjs > /tmp/dicoogle.log 2>&1 &
  sleep 2
fi
echo "[dicoogle] $(curl -s 'http://localhost:8095/search?query=*' | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["numResults"],"studies")' 2>/dev/null)"

# ── n8n (automation compatible) ───────────────────────
if ! curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
  echo "[n8n] Starting..."
  node /tmp/n8n-server/server.mjs > /tmp/n8n.log 2>&1 &
  sleep 2
fi
echo "[n8n] $(curl -s http://localhost:5678/healthz | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["status"])' 2>/dev/null)"

# ── OHIF Viewer ────────────────────────────────────────
if ! curl -s http://localhost:3001 > /dev/null 2>&1; then
  echo "[ohif] Starting..."
  node /tmp/ohif-server/server.mjs > /tmp/ohif.log 2>&1 &
  sleep 2
fi
echo "[ohif] $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001)"

# ── LangGraph Runtime ──────────────────────────────────
if ! curl -s http://localhost:8123/ok > /dev/null 2>&1; then
  echo "[langgraph] Starting..."
  cd /tmp/geraldos-agents
  LANGGRAPH_RUNTIME_EDITION=inmem \
    REDIS_URI=redis://127.0.0.1:6379 \
    DATABASE_URI=postgresql://postgres:postgres@127.0.0.1:5432/app_db \
    python3 -m uvicorn "langgraph_api.server:app" \
      --host 127.0.0.1 --port 8123 --log-level warning \
      > /tmp/langgraph.log 2>&1 &
  sleep 8
fi
echo "[langgraph] $(curl -s http://localhost:8123/ok 2>/dev/null)"

echo "=== All services started ==="
