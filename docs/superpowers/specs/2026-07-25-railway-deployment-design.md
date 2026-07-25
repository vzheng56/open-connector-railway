# Railway Deployment Design

## Goal

Maintain a Railway-specific deployment branch for OpenConnector while keeping `main` suitable for
syncing changes from the official `oomol-lab/open-connector` repository. Deploy the application to
Railway with persistent SQLite storage, then publish the working project as a Railway template.

## Branch And Remote Model

- `origin` remains `wsbjj/open-connector-railway`.
- `upstream` points to `oomol-lab/open-connector`.
- `main` tracks official source changes and contains no Railway-only configuration.
- `railway` is based on `main` and owns Railway configuration and documentation.
- Official updates are fetched into `main`, then merged from `main` into `railway`.

## Runtime Architecture

Railway builds the existing `docker/Dockerfile`. This preserves the repository's supported Node
runtime, generated catalog and web console build, production dependency install, and startup
command. Railway routes traffic to the service port exposed through `PORT`; the container binds to
`0.0.0.0` through `HOST`.

The service uses `/health` for deployment health checks. Railway restarts failed containers using a
bounded retry policy.

## Persistent Data

A Railway volume is mounted at `/app/data`, matching the Docker image's
`OOMOL_CONNECT_DATA_DIR`. The volume stores `connect.sqlite` and transit files. The initial
deployment uses one service replica because the SQLite database is not designed for concurrent
writes from multiple replicas.

## Configuration And Secrets

The deployment defines these non-secret values:

- `HOST=0.0.0.0`
- `PORT=3000`
- `OOMOL_CONNECT_DATA_DIR=/app/data`
- `NODE_ENV=production`

The fixed port matches the public Railway domain target and the production Docker image. The
deployed project receives generated values for `OOMOL_CONNECT_ENCRYPTION_KEY`,
`OOMOL_CONNECT_ADMIN_TOKEN`, and `OOMOL_CONNECT_RUNTIME_TOKEN`. Secret values are set through
Railway and never committed.

After Railway assigns a public domain, `OOMOL_CONNECT_ORIGIN` is set to its HTTPS origin so OAuth
callback URLs use the public service address.

## Repository Configuration

The `railway` branch adds:

- `railway.json` selecting `docker/Dockerfile`, `/health`, and the restart policy.
- `docs/railway.md` with deployment, secret, volume, verification, update, and template guidance.
- A Railway deployment entry in the main README.

The configuration will not contain project IDs, service IDs, account identifiers, or secret values.

## Deployment Flow

1. Create and link a Railway project named `open-connector-railway`.
2. Create an `open-connector` service from the current repository contents.
3. Attach a volume at `/app/data`.
4. Set non-secret runtime variables and generated secrets without triggering intermediate deploys.
5. Upload the `railway` branch contents with `railway up`.
6. Generate a Railway domain and set `OOMOL_CONNECT_ORIGIN` to that domain.
7. Redeploy and verify `/health`, deployment status, and recent logs.
8. Push the `railway` branch to GitHub.

## Template Publication

Once the deployment is healthy, create a Railway template from the project and publish it in the
`Automation` category. The template overview explains OpenConnector, the persistent volume, OAuth
origin behavior, and the required security variables.

The template must not embed the deployment's actual secrets. Template consumers receive variable
definitions or generated values according to Railway's captured project configuration. The public
template uses the working project as its source and includes a concise marketplace description.

## Verification

- `npm run fix-check` succeeds before deployment.
- The Docker image builds successfully from `docker/Dockerfile`.
- Railway reports a successful deployment.
- `GET /health` on the Railway-assigned public HTTPS domain returns `{ "ok": true }`.
- The service has exactly one persistent volume mounted at `/app/data`.
- The published template is visible in the owner's template list and has a public template code.
- Git status is clean after commits and the `railway` branch exists on `origin`.

## Failure Handling

If the build or runtime fails, inspect Railway build/deployment logs before changing configuration.
Do not publish the template until the deployed service is healthy. If template publication exposes
captured secret values rather than variable definitions, unpublish it immediately and correct the
project/template configuration before republishing.
