#!/usr/bin/env bash
# GeraldOS — Start all integration services
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

check_port() { curl -sf "http://127.0.0.1:$1${2:-/}" > /dev/null 2>&1; }

echo "=== Starting GeraldOS services ==="

# Redis (:6379)
if ! redis-cli ping > /dev/null 2>&1; then
  echo "[redis] starting..."
  redis-server --daemonize yes --logfile /tmp/redis.log --bind 127.0.0.1 --port 6379
  sleep 1
fi
echo "[redis] $(redis-cli ping)"

# Orthanc (:8042)
if ! check_port 8042 "/system"; then
  echo "[orthanc] starting..."
  mkdir -p /tmp/orthancdb
  /usr/sbin/Orthanc "$DIR/orthanc.json" > /tmp/orthanc.log 2>&1 &
  for i in $(seq 1 15); do
    check_port 8042 "/system" && break || sleep 1
  done
fi
echo "[orthanc] $(curl -s -u orthanc:orthanc http://127.0.0.1:8042/system | python3 -c 'import json,sys;print("v"+json.load(sys.stdin)["Version"])' 2>/dev/null || echo 'starting...')"

# MinIO (:9000)
if ! check_port 9000 "/minio/health/live"; then
  echo "[minio] starting..."
  mkdir -p /tmp/miniodata
  MINIO_ROOT_USER=geraldos MINIO_ROOT_PASSWORD=geraldos-secret \
    minio server /tmp/miniodata --address ":9000" --console-address ":9001" > /tmp/minio.log 2>&1 &
  for i in $(seq 1 10); do
    check_port 9000 "/minio/health/live" && break || sleep 1
  done
  mc alias set geraldos http://127.0.0.1:9000 geraldos geraldos-secret > /dev/null 2>&1
  mc mb --ignore-existing geraldos/geraldos > /dev/null 2>&1
fi
echo "[minio] $(curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:9000/minio/health/live)"

# Keycloak (:8180)
if ! check_port 8180 "/realms/geraldos"; then
  echo "[keycloak] starting..."
  node "$DIR/keycloak.mjs" > /tmp/keycloak.log 2>&1 &
  sleep 2
fi
echo "[keycloak] $(curl -sf http://127.0.0.1:8180/realms/geraldos | python3 -c 'import json,sys;print(json.load(sys.stdin).get("issuer","ok"))' 2>/dev/null || echo 'ok')"

# FHIR (:8090)
if ! check_port 8090 "/fhir/metadata"; then
  echo "[fhir] starting..."
  node "$DIR/fhir.mjs" > /tmp/fhir.log 2>&1 &
  sleep 2
fi
echo "[fhir] $(curl -sf http://127.0.0.1:8090/fhir/metadata | python3 -c 'import json,sys;print("R"+json.load(sys.stdin)["fhirVersion"])' 2>/dev/null || echo 'ok')"

# Dicoogle (:8095)
if ! check_port 8095 "/search?query=*"; then
  echo "[dicoogle] starting..."
  node "$DIR/dicoogle.mjs" > /tmp/dicoogle.log 2>&1 &
  sleep 2
fi
echo "[dicoogle] $(curl -sf 'http://127.0.0.1:8095/search?query=*' | python3 -c 'import json,sys;print(json.load(sys.stdin)["numResults"],"indexed")' 2>/dev/null || echo 'ok')"

# n8n (:5678)
if ! check_port 5678 "/healthz"; then
  echo "[n8n] starting..."
  node "$DIR/n8n.mjs" > /tmp/n8n.log 2>&1 &
  sleep 2
fi
echo "[n8n] $(curl -sf http://127.0.0.1:5678/healthz | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["status"],d.get("version",""))' 2>/dev/null || echo 'ok')"

# OHIF (:3001)
if ! check_port 3001; then
  echo "[ohif] starting..."
  node "$DIR/ohif.mjs" > /tmp/ohif.log 2>&1 &
  sleep 2
fi
echo "[ohif] $(curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3001)"

# LangGraph (:8123)
if ! check_port 8123 "/ok"; then
  echo "[langgraph] starting..."
  cd "$DIR"
  LANGGRAPH_RUNTIME_EDITION=inmem \
    REDIS_URI=redis://127.0.0.1:6379 \
    DATABASE_URI=postgresql://postgres:postgres@127.0.0.1:5432/geraldos \
    python3 -m uvicorn "langgraph_api.server:app" \
      --host 127.0.0.1 --port 8123 --log-level warning \
      > /tmp/langgraph.log 2>&1 &
  for i in $(seq 1 15); do
    check_port 8123 "/ok" && break || sleep 1
  done
fi
echo "[langgraph] $(curl -sf http://127.0.0.1:8123/ok 2>/dev/null || echo 'starting...')"

echo "=== All services started ==="
