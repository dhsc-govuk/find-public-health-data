# Decisions

## Send email with Microsoft's Communication Services SDK

Date: 2026-11-06

Sign-in links are sent through `@azure/communication-email`, Microsoft's SDK for Azure
Communication Services email, signed in with `ManagedIdentityCredential` from `@azure/identity`.

### Rationale

The alternative was a hand-written call to the email REST API with a token from `@azure/identity`.
The SDK handles the request shape and the long-running send operation, and its dependencies are
mostly the `@azure/core-*` packages `@azure/identity` already brings in. Its only use is in this
package, which only public-web depends on.
