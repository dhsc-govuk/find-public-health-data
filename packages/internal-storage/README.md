# @fphd/internal-storage

The file storage behind indicator data uploads: Azure Blob Storage in Azure, and
[Azurite](https://github.com/Azure/Azurite), Microsoft's storage emulator, locally and in CI. It
wraps the Azure Storage SDK so the SDK stays out of the public images; the `internal-` prefix is
what `tools/artefact-boundary` keys on.

A `BlobStorage` keeps files by name and writes each name once: `put` streams a file in and refuses a
name already taken (`BlobExistsError`), `get` streams one out (`BlobNotFoundError` when there is
none), and `delete` removes one, succeeding whether or not it was there. Names are the caller's
choice.

Built package; consumed by `internal-api`, which builds the storage at startup, and by
`@fphd/internal-api-features`, whose routes receive it.

| Entry       | Purpose                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.`         | `createAzureBlobStorage`, the `BlobStorage` type and its errors, and `storageEnvFields` with `resolveStorage` for the API's config |
| `./testing` | `createFakeBlobStorage`, an in-memory `BlobStorage` for unit tests                                                                 |

## Configuration

`STORAGE_CONTAINER` names the container. In Azure, `STORAGE_ACCOUNT_URL` and `AZURE_CLIENT_ID`
connect with the app's managed identity, which holds a role on that container only. Outside a
deployed environment, `STORAGE_CONNECTION_STRING` connects to Azurite instead, and the container is
created if it is missing, since Azurite starts empty; in Azure the infrastructure creates it.

## Tests

`vitest run --project @fphd/internal-storage`. The in-memory and Azure implementations run the same
behaviour suite (`blob-storage.testing.ts`). The Azure one runs in the integration tier against
Azurite, reached through `STORAGE_CONNECTION_STRING` from the repo `.env` or the environment, in a
container of its own that it deletes afterwards. `pnpm services:up` starts Azurite.
