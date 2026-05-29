# Duplo auth onboarding

LVV now has a small Duplo adapter in `duploAuth.ts`. It is disabled by default and expects
the Duplo authenticator to be registered at runtime once Splat provides the final config.

Expected runtime wiring:

```ts
window.__LVV_DUPLO_CONFIG__ = { enabled: true };
window.__LVV_DUPLO_AUTH__ = duploAuthenticator;
```

`duploAuthenticator` should implement the Duplo `TokenAuthenticator` methods LVV uses:

- `authenticateUser()`
- `tryRefreshToken(force, region)`
- `getFetchApi()`

When enabled:

- app bootstrap calls `authenticateUser()`
- token refresh calls `tryRefreshToken(true, region)`
- shared LVV API calls made through `fetchWithRetry()` use `getFetchApi()` for signed requests

When disabled or running on localhost, LVV keeps the existing SPLAT callback/session behavior.
