# Deploy and Host OpenConnector on Railway

OpenConnector provides a web console, MCP endpoint, HTTP and OpenAPI interfaces, and more than 1,000
provider integrations from a single self-hosted runtime.

## About Hosting OpenConnector

This template builds the maintained OpenConnector `railway` branch with its production Dockerfile.
Railway runs one service replica, checks `/health`, and mounts persistent storage at `/app/data` for
the SQLite database and transit files.

Connections, encrypted credentials, OAuth configuration, tokens, run history, and transit files
remain on the attached volume across normal redeployments.

## Why Deploy OpenConnector on Railway

- Run the web console, MCP, HTTP APIs, and provider actions from one managed service.
- Keep connection credentials and runtime state in infrastructure you control.
- Use Railway's GitHub deployments, TLS domain, health checks, logs, and persistent volumes.
- Update from the maintained `railway` branch without rebuilding deployment configuration manually.

## Common Use Cases

- Give AI agents scoped access to SaaS applications through MCP or HTTP tools.
- Manage reusable API key and OAuth connections through the web console.
- Expose OpenAPI-compatible provider actions to internal applications and automation.
- Self-host connector credentials and audit history with persistent SQLite storage.

## Dependencies for OpenConnector Hosting

### Deployment Dependencies

- A Railway service built from
  [`wsbjj/open-connector-railway`](https://github.com/wsbjj/open-connector-railway), branch
  `railway`.
- A Railway volume mounted at `/app/data`.
- `PORT=3000`, `HOST=0.0.0.0`, and `OOMOL_CONNECT_DATA_DIR=/app/data`.
- Independent secret values supplied during deployment for `OOMOL_CONNECT_ENCRYPTION_KEY`,
  `OOMOL_CONNECT_ADMIN_TOKEN`, and `OOMOL_CONNECT_RUNTIME_TOKEN`.
- A Railway public domain used as `OOMOL_CONNECT_ORIGIN`.

## After Deployment

Open the generated Railway domain to access the web console. Use the administrator token when the
console asks for authentication. Create scoped runtime tokens from the Access page for agents and
applications instead of broadly sharing the bootstrap token.

The deployment form asks for all eight runtime variables. Generate each secret independently, for
example with `openssl rand -base64 32`, and store a secure external copy of the encryption key. The
template does not copy secret values from its source project.

For OAuth2 providers, set `OOMOL_CONNECT_ORIGIN` to the generated HTTPS domain without a trailing
slash. The callback URL registered with provider OAuth applications is then:

```text
https://your-service.up.railway.app/oauth/callback
```

Do not remove the volume during routine redeployments. Keep a secure external copy of
`OOMOL_CONNECT_ENCRYPTION_KEY`; data encrypted with this key cannot be recovered if the key is lost.

The default template uses one replica because SQLite does not support concurrent application
writers across multiple containers. Scale vertically when more capacity is needed.

See the [Railway deployment guide](https://github.com/wsbjj/open-connector-railway/blob/railway/docs/railway.md)
for CLI deployment, variables, verification, and upstream update instructions.
