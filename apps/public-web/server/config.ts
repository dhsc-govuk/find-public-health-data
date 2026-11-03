import { loadWebServerConfig } from '@fphd/config';

export const {
  basicAuth,
  development,
  host,
  port,
  revision,
  apiUrl,
  trustedProxyHops,
  log,
  session,
  shutdown,
} = loadWebServerConfig(process.env, {
  port: 3000,
  apiUrl: 'http://localhost:4000',
});
