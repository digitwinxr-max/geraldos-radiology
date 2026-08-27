/**
 * Integration environment — the SAME variables the app server was started
 * with (see docker-compose.integration.yml and docs/INTEGRATION_TESTS.md).
 * Defaults match the compose file's fixed ports so `npm run test:integration`
 * works with zero configuration on a fresh checkout.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} — start the integration stack first (docs/INTEGRATION_TESTS.md)`);
  return value;
}

export const env = {
  appUrl: process.env.IT_APP_URL ?? "http://localhost:3000",
  keycloakInternal: required("KEYCLOAK_URL"),
  keycloakPublic: process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:58080",
  realm: process.env.KEYCLOAK_REALM ?? "geraldos",
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? "geraldos-frontend",
  redisUrl: required("REDIS_URL"),
  orthancUrl: required("ORTHANC_URL"),
  orthancUsername: process.env.ORTHANC_USERNAME ?? "orthanc",
  orthancPassword: required("ORTHANC_PASSWORD"),
  postgresContainer: "geraldos-it-postgres",
  redisContainer: "geraldos-it-redis",
};

export const USERS = {
  admin: { username: "it-admin", password: "it-password" },
  radiologist: { username: "it-radiologist", password: "it-password" },
  receptionist: { username: "it-receptionist", password: "it-password" },
  noroles: { username: "it-noroles", password: "it-password" },
} as const;

/** Run a command inside a compose container (docker exec). */
export async function dockerExec(
  container: string,
  args: string[],
): Promise<{ code: number; out: string }> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile("docker", ["exec", container, ...args], { timeout: 30_000 }, (err, stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === "number"
        ? (err as unknown as { code: number }).code
        : err ? 1 : 0;
      resolve({ code, out: `${stdout}${stderr}` });
    });
  });
}
