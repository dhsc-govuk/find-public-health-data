import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Builds the template databases the integration tier copies per test file.
// Gated on INTEGRATION_DB so the unit tier never touches Postgres; the
// test:integration script sets it.
export default async function setup(): Promise<(() => Promise<void>) | undefined> {
  if (process.env.INTEGRATION_DB !== '1') {
    return undefined;
  }
  // The test workers start after this and inherit its environment, so the repo .env loads
  // here once for every file (values already set, such as CI's, win over it), and each file
  // finds its run's templates by the run id.
  const envFile = fileURLToPath(new URL('./.env', import.meta.url));
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  const { newTestRun, setUpTestTemplate, tearDownTestTemplate, TEST_RUN_ENV } = await import(
    '@fphd/db-operations/testing'
  );
  const run = newTestRun();
  process.env[TEST_RUN_ENV] = run;
  try {
    await setUpTestTemplate(run);
  } catch (error) {
    // Vitest only runs the teardown it is handed, so a failed build (a migration being
    // written, say) would otherwise leave its templates until the stale sweep a day later.
    await tearDownTestTemplate(run);
    throw error;
  }
  return async () => {
    await tearDownTestTemplate(run);
  };
}
