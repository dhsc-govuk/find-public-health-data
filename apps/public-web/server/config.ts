import { loadWebServerConfig } from '@fphd/config';

export const {
  basicAuth,
  betaAccess,
  development,
  host,
  port,
  revision,
  apiUrl,
  trustedProxyHops,
  log,
  shutdown,
} = loadWebServerConfig(process.env, {
  port: 3000,
  apiUrl: 'http://localhost:4000',
});
