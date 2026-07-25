# OpenConnector On Railway

Deploy OpenConnector with its web console, MCP endpoint, HTTP and OpenAPI interfaces, and more than
1,000 provider integrations.

## Included

- Production Docker build from the maintained OpenConnector source.
- Persistent SQLite storage mounted at `/app/data`.
- Railway health checks through `/health`.
- One service replica to preserve SQLite consistency.
- Generated encryption, administrator, and bootstrap runtime tokens.

## After Deployment

Open the generated Railway domain to access the web console. Use the administrator token when the
console asks for authentication. Create scoped runtime tokens from the Access page for agents and
applications instead of broadly sharing the bootstrap token.

For OAuth2 providers, set `OOMOL_CONNECT_ORIGIN` to the generated HTTPS domain without a trailing
slash. The callback URL registered with provider OAuth applications is then:

```text
https://your-service.up.railway.app/oauth/callback
```

## Persistent Data

Connections, encrypted credentials, OAuth configuration, tokens, run history, and transit files are
stored on the attached Railway volume. Do not remove the volume during routine redeployments.

Keep a secure external copy of `OOMOL_CONNECT_ENCRYPTION_KEY`. Data encrypted with this key cannot
be recovered if the key is lost.

## Scaling And Updates

The default template uses one replica because SQLite does not support concurrent application
writers across multiple containers. Scale vertically when more capacity is needed.

The template source is the `railway` branch of
[`wsbjj/open-connector-railway`](https://github.com/wsbjj/open-connector-railway). That branch keeps
Railway configuration separate from `main`, which follows the official OpenConnector repository.

See the [Railway deployment guide](https://github.com/wsbjj/open-connector-railway/blob/railway/docs/railway.md)
for CLI deployment, variables, verification, and upstream update instructions.
