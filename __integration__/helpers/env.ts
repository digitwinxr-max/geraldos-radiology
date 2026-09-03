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
  /**
   * Direct address of the OHIF container. The app serves the viewer at
   * `/viewer` on its own origin, so the suite compares proxied responses
   * against the upstream's own — that is what proves the rewrite set covers
   * every path the real bundle asks for, without hardcoding its build output.
   */
  ohifUrl: process.env.OHIF_URL ?? "http://localhost:53001",
  orthancUrl: required("ORTHANC_URL"),
  orthancUsername: process.env.ORTHANC_USERNAME ?? "orthanc",
  orthancPassword: required("ORTHANC_PASSWORD"),
  postgresContainer: "geraldos-it-postgres",
};

/**
 * Native-auth staff identities. The suite provisions these rows into the IT
 * PostgreSQL directly (see provisionStaff in helpers/http.ts) so login works
 * exactly like production: scrypt hash in staff.password_hash, HS256 session.
 * "noroles" intentionally maps to an unknown role so RBAC denies everything.
 */
export const USERS = {
  admin: { email: "it-admin@gerald.test", password: "it-password", firstName: "Ada", lastName: "Administrator", role: "administrator" },
  radiologist: { email: "it-radiologist@gerald.test", password: "it-password", firstName: "Ruth", lastName: "Radiologist", role: "radiologist" },
  receptionist: { email: "it-receptionist@gerald.test", password: "it-password", firstName: "Rona", lastName: "Receptionist", role: "receptionist" },
  noroles: { email: "it-noroles@gerald.test", password: "it-password", firstName: "Noah", lastName: "Noroles", role: "noroles" },
} as const;

/** Scrypt hash of "it-password" (N=16384, r=8, p=1, 64-byte key, 16-byte salt). */
export const STAFF_PASSWORD_HASH =
  "scrypt$16384$8$1$68f76b8e21f47fc61060a3b659cf7193$8bc24640de18bfcea12cd7f63d266cfbe554bbeb68bfd4d9d62f3b923ea2b387bd7f2ff422428460524d2ebaa5437737783ceaa5850e774d4a4370d2ec83e920";

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
