import { ManagedIdentityCredential, type TokenCredential } from '@azure/identity';

const POSTGRES_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';

/**
 * A password function for postgres.js, which calls it for each new connection, so a reconnect
 * gets a current token. A failure names the identity. Otherwise a misassigned identity shows up as
 * an opaque connection error.
 */
export function entraTokenPassword(
  clientId: string,
  credential: TokenCredential = new ManagedIdentityCredential({ clientId }),
): () => Promise<string> {
  return async () => {
    try {
      const token = await credential.getToken(POSTGRES_SCOPE);
      if (!token) throw new Error('the credential returned no token');
      return token.token;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not get a database token from managed identity ${clientId}: ${reason}`,
        { cause: error },
      );
    }
  };
}
