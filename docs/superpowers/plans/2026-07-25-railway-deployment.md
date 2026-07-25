# Railway Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maintained Railway deployment path, deploy it with persistent storage, and publish the healthy project as a Railway marketplace template.

**Architecture:** Reuse the supported production Dockerfile and keep all Railway-specific source changes on the `railway` branch. Railway owns runtime secrets, the public domain, and a volume mounted at `/app/data`; the repository owns only portable build, health-check, and operator documentation.

**Tech Stack:** Railway CLI 4.66, Railway Dockerfile builder, Node.js 24, SQLite, JSON Schema, Markdown

---

### Task 1: Railway Service Manifest

**Files:**

- Create: `railway.json`

- [ ] **Step 1: Create the Railway manifest**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "docker/Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 2: Validate the manifest against Railway's published schema**

Run:

```bash
curl --fail --location --silent --show-error https://railway.com/railway.schema.json --output /tmp/open-connector-railway-schema.json
npx --yes ajv-cli validate -s /tmp/open-connector-railway-schema.json -d railway.json
```

Expected: `railway.json valid`.

### Task 2: Railway Operator Documentation

**Files:**

- Create: `docs/railway.md`
- Create: `docs/railway-template.md`
- Modify: `README.md`
- Modify: `docs/README.zh-CN.md`

- [ ] **Step 1: Document direct Railway deployment**

Document the Docker builder, `/app/data` volume, required variables, generated secrets, public
domain, `OOMOL_CONNECT_ORIGIN`, health verification, logs, and the `main` to `railway` update flow.

- [ ] **Step 2: Write the marketplace template overview**

Write standalone template documentation that explains the service, persistent data, generated
security values, first-login URL, OAuth callback path, one-replica SQLite limit, and upgrade path.

- [ ] **Step 3: Add README links**

Add a Railway section next to Fly.io in both the English and Simplified Chinese READMEs. Link to
`docs/railway.md` and describe persistent SQLite storage and the published template.

- [ ] **Step 4: Verify documentation formatting**

Run:

```bash
npm run format
```

Expected: exit code 0 after `oxfmt` reports no formatting differences.

### Task 3: Repository Verification And Commit

**Files:**

- Verify all modified repository files.

- [ ] **Step 1: Run the required repository check**

Run:

```bash
npm run fix-check
```

Expected: lint fixes, formatting fixes, generated registry, and TypeScript checks all exit 0.

- [ ] **Step 2: Build the production Docker image**

Run:

```bash
docker build -f docker/Dockerfile -t open-connector-railway:local .
```

Expected: Docker completes successfully and tags `open-connector-railway:local`.

- [ ] **Step 3: Commit repository changes**

```bash
git add railway.json README.md docs/README.zh-CN.md docs/railway.md docs/railway-template.md docs/superpowers/plans/2026-07-25-railway-deployment.md
git commit -m "feat: add Railway deployment"
```

### Task 4: Create And Deploy Railway Project

**Files:**

- No repository file changes; Railway project state only.

- [ ] **Step 1: Create and link the project**

Run:

```bash
railway init --name open-connector-railway --workspace "Bu Junjie's Projects" --json
railway add --service open-connector --json
```

Expected: a linked project and an `open-connector` service in the production environment.

- [ ] **Step 2: Add persistent storage**

Run:

```bash
railway service link open-connector
railway volume add --mount-path /app/data --json
```

Expected: one volume attached to `open-connector` at `/app/data`.

- [ ] **Step 3: Set non-secret variables and generated secrets**

Set `NODE_ENV=production`, `PORT=3000`, `HOST=0.0.0.0`, and
`OOMOL_CONNECT_DATA_DIR=/app/data` with `--skip-deploys`. Generate 32-byte random values with
`openssl rand -base64 32` and pipe them to `railway variable set ... --stdin --skip-deploys` for
`OOMOL_CONNECT_ENCRYPTION_KEY`, `OOMOL_CONNECT_ADMIN_TOKEN`, and
`OOMOL_CONNECT_RUNTIME_TOKEN`. Do not print the values.

- [ ] **Step 4: Upload and deploy**

Run:

```bash
railway up --service open-connector --environment production --detach --json --message "Initial Railway deployment"
```

Expected: Railway returns a deployment ID.

- [ ] **Step 5: Wait for a successful deployment**

Poll `railway deployment list --service open-connector --environment production --json` and inspect
`railway logs --service open-connector --environment production --json --lines 100` if the status
does not become `SUCCESS`.

- [ ] **Step 6: Assign the domain and origin**

Generate a Railway domain for `open-connector`, set `OOMOL_CONNECT_ORIGIN` to its HTTPS URL, and wait
for the triggered deployment to become successful.

- [ ] **Step 7: Verify the runtime**

Read the assigned domain from `railway domain --json`, request its `/health` path with
`curl --fail --silent --show-error`, and verify the response is `{"ok":true}`. Confirm one attached
volume at `/app/data` and one service replica.

### Task 5: Push And Publish The Railway Template

**Files:**

- No repository file changes; GitHub and Railway template state only.

- [ ] **Step 1: Push the deployment branch**

Run:

```bash
git push -u origin railway
```

Expected: `origin/railway` points at the verified deployment commit.

- [ ] **Step 2: Generate an unpublished template**

Run:

```bash
railway templates create --environment production --json > /tmp/open-connector-railway-template.json
```

Expected: Railway returns a template ID and template code.

- [ ] **Step 3: Publish marketplace metadata**

Run:

```bash
railway templates publish "$(jq -r '.id' /tmp/open-connector-railway-template.json)" \
  --category Automation \
  --description "Deploy OpenConnector with 1,000+ provider integrations, a web console, MCP, HTTP APIs, and persistent SQLite storage." \
  --readme-file docs/railway-template.md \
  --json
```

Expected: the template status is `PUBLISHED` and Railway returns its public code.

- [ ] **Step 4: Verify publication and final repository state**

Run `railway templates list --json`, confirm the new template is published, then run
`git status --short --branch` and confirm the branch is clean and tracks `origin/railway`.
