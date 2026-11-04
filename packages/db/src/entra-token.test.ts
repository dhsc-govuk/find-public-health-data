import type { TokenCredential } from '@azure/identity';
import { describe, expect, it, vi } from 'vitest';

import { entraTokenPassword } from './entra-token.ts';

const clientId = '11111111-1111-1111-1111-111111111111';

function credential(getToken: TokenCredential['getToken']): TokenCredential {
  return { getToken };
}

describe('entraTokenPassword', () => {
  it('asks for a token for Azure Database for PostgreSQL and returns it', async () => {
    const getToken = vi.fn().mockResolvedValue({ token: 'a-token', expiresOnTimestamp: 0 });

    await expect(entraTokenPassword(clientId, credential(getToken))()).resolves.toBe('a-token');
    expect(getToken).toHaveBeenCalledWith('https://ossrdbms-aad.database.windows.net/.default');
  });

  it('asks again for each connection', async () => {
    const getToken = vi.fn().mockResolvedValue({ token: 'a-token', expiresOnTimestamp: 0 });
    const password = entraTokenPassword(clientId, credential(getToken));

    await password();
    await password();

    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('names the identity when the credential fails', async () => {
    const getToken = vi.fn().mockRejectedValue(new Error('no identity endpoint'));

    await expect(entraTokenPassword(clientId, credential(getToken))()).rejects.toThrow(
      `Could not get a database token from managed identity ${clientId}: no identity endpoint`,
    );
  });

  it('fails when the credential returns no token', async () => {
    const getToken = vi.fn().mockResolvedValue(null);

    await expect(entraTokenPassword(clientId, credential(getToken))()).rejects.toThrow(
      /returned no token/,
    );
  });
});
