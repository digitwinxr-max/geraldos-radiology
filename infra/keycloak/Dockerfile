# GeraldOS — Keycloak production build (official image + optimized runtime)
# The stock keycloak image must be built with `kc.sh build` before `start --optimized`
# can run. This Dockerfile performs that build so the service boots in production
# mode without an in-container build (which exceeds the free-tier 512 MB limit).
FROM docker.io/keycloak/keycloak:26.7.2

# Configure a production-optimized runtime. Options are baked at build time so
# the running container only needs `start --optimized`.
ENV KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true \
    KC_HTTP_ENABLED=true \
    KC_HTTP_RELATIVE_PATH=/ \
    KC_HTTP_PORT=8080 \
    JAVA_OPTS_APPEND="-Xms64m -Xmx320m -XX:MaxRAMPercentage=0.0"

# Build optimization on the image (not at runtime). Keycloak 26 uses /opt/keycloak.
USER root
RUN /opt/keycloak/bin/kc.sh build --health-enabled=true --metrics-enabled=true

USER 1000
EXPOSE 8080

# Run the optimized production server. The base image ENTRYPOINT is
# /opt/keycloak/bin/kc.sh, so CMD only needs the subcommand + flags.
CMD ["start", "--optimized"]