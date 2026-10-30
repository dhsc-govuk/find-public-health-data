// Re-exported so schema fragments and app schemas are always built with the same zod
// instance — depend on @fphd/config, not on zod directly.
export { z } from 'zod';
export {
  type AppEnv,
  appEnvFields,
  appEnvSchema,
  boolSchema,
  DEV_CLASS_APP_ENVS,
  isDeployedEnv,
  isDevClassEnv,
  loadWebServerConfig,
  logEnvFields,
  parseEnv,
  portSchema,
  resolveLog,
  resolveShutdown,
  serverEnvFields,
} from './env.ts';
