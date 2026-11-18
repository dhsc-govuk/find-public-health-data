import { loadSignInWebServerConfig } from '@fphd/config';

export const {
  basicAuth,
  development,
  environmentName,
  feedbackMailbox,
  host,
  offersDevTools,
  port,
  revision,
  searchPageSize,
  apiUrl,
  apiUploadTimeoutMs,
  trustedProxyHops,
  log,
  session,
  webSession,
  shutdown,
} = loadSignInWebServerConfig(process.env, {
  port: 3001,
  apiUrl: 'http://localhost:4001',
});
