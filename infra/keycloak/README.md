# GeraldOS Keycloak (Render infra)

Production Keycloak image with a pre-built optimized runtime so it can run on
Render Free (512 MB) via `start --optimized` without an in-place build.

Official image: `docker.io/keycloak/keycloak:26.7.2`
Command: `/opt/keycloak/bin/kc.sh start --optimized`