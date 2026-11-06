import { loadSignInWebServerConfig } from '@fphd/config';

export const {
  basicAuth,
  development,
  host,
  offersDevTools,
  port,
  revision,
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
