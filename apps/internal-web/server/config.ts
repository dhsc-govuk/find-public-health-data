import { loadWebServerConfig } from '@fphd/config';

export const {
  basicAuth,
  development,
  host,
  offersDevTools,
  port,
  apiUrl,
  apiUploadTimeoutMs,
  trustedProxyHops,
  log,
  session,
  webSession,
  shutdown,
} = loadWebServerConfig(process.env, {
  port: 3001,
  apiUrl: 'http://localhost:4001',
});
