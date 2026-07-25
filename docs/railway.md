# Railway Deployment

OpenConnector can run on Railway using the repository's production Docker image and a persistent
volume for its SQLite database and transit files.

## Prerequisites

- A Railway account and the [Railway CLI](https://docs.railway.com/guides/cli) installed.
- An authenticated CLI session from `railway login`.
- A public Railway domain or custom domain for OAuth callback URLs.

## Create The Project

From the `railway` branch, create and link a project and service:

```bash
railway init --name open-connector-railway
railway add --service open-connector
```

The repository's `railway.json` selects `docker/Dockerfile`, configures `/health`, and limits the
SQLite deployment to one replica.

## Add Persistent Storage

Attach a Railway volume at the path used by the Docker image:

```bash
railway service link open-connector
railway volume add --mount-path /app/data
```

The volume stores `/app/data/connect.sqlite` and temporary transit files. Keep one service replica
unless you replace SQLite with storage designed for concurrent writers.

## Set Variables And Secrets

Set the non-secret runtime variables:

```bash
railway variable set NODE_ENV=production --skip-deploys
railway variable set HOST=0.0.0.0 --skip-deploys
railway variable set OOMOL_CONNECT_DATA_DIR=/app/data --skip-deploys
```

Generate independent secret values and store them in Railway. Do not commit or reuse these values:

```bash
openssl rand -base64 32 | railway variable set OOMOL_CONNECT_ENCRYPTION_KEY --stdin --skip-deploys
openssl rand -base64 32 | railway variable set OOMOL_CONNECT_ADMIN_TOKEN --stdin --skip-deploys
openssl rand -base64 32 | railway variable set OOMOL_CONNECT_RUNTIME_TOKEN --stdin --skip-deploys
```

Keep the encryption key in an external password manager or secrets vault. Losing it makes encrypted
credentials, OAuth configuration, and completed idempotent Action responses in the persistent
database unrecoverable.

See [configuration.md](configuration.md) for optional action, proxy, JWT, and private-network policy.

## Deploy

Upload the current branch through the Railway CLI:

```bash
railway up --service open-connector --environment production
```

Generate a Railway domain after the first deployment:

```bash
railway domain --service open-connector --port 3000
```

Set `OOMOL_CONNECT_ORIGIN` to the resulting HTTPS origin, without a trailing slash:

```bash
railway variable set OOMOL_CONNECT_ORIGIN=https://your-service.up.railway.app
```

OAuth2 providers use this origin with `/oauth/callback`. Register the resulting callback URL with
each provider OAuth application.

## Verify And Diagnose

Verify the public health endpoint:

```bash
curl https://your-service.up.railway.app/health
```

The expected response is:

```json
{ "ok": true }
```

Inspect deployment status and logs when diagnosing failures:

```bash
railway deployment list --service open-connector --environment production
railway logs --service open-connector --environment production --lines 100
```

## Update From Upstream

Keep official source changes on `main`, then merge them into the Railway deployment branch:

```bash
git switch main
git fetch upstream
git merge --ff-only upstream/main
git push origin main
git switch railway
git merge main
git push origin railway
railway up --service open-connector --environment production
```

Resolve conflicts on `railway`; do not add Railway-only files to `main`.
