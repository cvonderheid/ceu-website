# CEU Planner Pulumi Infra

This Pulumi project provisions a single `prod` AWS environment in `us-east-1`:

- Route53 hosted zone
- ACM certificates (site + Cognito custom auth domain)
- CloudFront + S3 static site hosting (`ceuplanner.com` + `www` redirect)
- Cognito User Pool + SPA client + custom domain (`auth.ceuplanner.com`)
  - Default user onboarding is invite/admin-only (self-signup disabled)
- VPC + isolated subnets
- VPC endpoints for S3 (gateway) and Cognito IDP (interface), so App Runner can stay private without NAT
- RDS PostgreSQL (`db.t4g.micro`, single-AZ)
- Secrets Manager secret for `DATABASE_URL`
- ECR repository for the API image
- App Runner service for FastAPI
- Private S3 bucket for certificates/assets

## Prerequisites

- AWS credentials with permissions for Route53, ACM, CloudFront, Cognito, RDS, IAM, VPC, S3, ECR, App Runner, and Secrets Manager.
- Pulumi CLI installed.
- Pulumi state backend selected:
  - Pulumi Cloud: `pulumi login`
  - Local/file backend: `pulumi login file://$HOME/.pulumi` and set `PULUMI_CONFIG_PASSPHRASE`
- Node.js 20+.

## Stack config

`Pulumi.prod.yaml` already contains baseline values:

- domain: `ceuplanner.com`
- region: `us-east-1`
- hosted zone creation enabled
- RDS baseline values

Optional overrides:

- `ceuplanner-infra:existingHostedZoneId` (if you later stop managing zone creation)
- `ceuplanner-infra:authSubdomain` (default `auth`)
- `ceuplanner-infra:authCallbackUrls` (default `https://ceuplanner.com/auth/callback`)
- `ceuplanner-infra:authLogoutUrls` (default `https://ceuplanner.com`)
- `ceuplanner-infra:apiImageTag` (default `latest`)
- `ceuplanner-infra:deployApiService` (default `false`; set `true` after first image push)

## Deploy

```bash
cd infra
npm install
pulumi stack init prod   # only once
pulumi up -s prod
```

## Push API image

After the first `pulumi up`, use the `apiRepositoryUrl` output:

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker build -f Dockerfile.prod -t <apiRepositoryUrl>:latest .
docker push <apiRepositoryUrl>:latest
```

Then enable API service and apply again:

```bash
pulumi config set ceuplanner-infra:deployApiService true -s prod
pulumi up -s prod
```

App Runner is configured with auto-deploy enabled for the configured image tag.

## Static web deploy

Build the web app and sync `apps/web/dist` to the `websiteBucketName` output, then invalidate CloudFront:

```bash
cd apps/web
npm ci
export VITE_COGNITO_DOMAIN=auth.ceuplanner.com
export VITE_COGNITO_CLIENT_ID=<cognitoUserPoolClientId output>
export VITE_COGNITO_REDIRECT_URI=https://ceuplanner.com/auth/callback
export VITE_COGNITO_LOGOUT_URI=https://ceuplanner.com
npm run build

aws s3 sync dist s3://<websiteBucketName> --delete
aws cloudfront create-invalidation --distribution-id <distributionId> --paths '/*'
```

## DNS note

If this stack creates a new hosted zone, verify the registered domain is using the zone name servers from `hostedZoneNameServersOutput`.
