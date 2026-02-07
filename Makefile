.PHONY: all predeploy deploy-apply approve-deploy dev test migrate db-up db-down demo demo-reset demo-dev infra-build ecr-login image-build image-push image-release pulumi-set-tag pulumi-preview pulumi-up web-build web-sync web-deploy

DATABASE_URL ?= postgresql+psycopg://ce_user:ce_pass@localhost:5432/ce_tracker
DEV_USER_ID ?= dev-user-1
DEV_EMAIL ?= dev@example.com
AWS_REGION ?= us-east-1
ECR_REPO ?= 339757511793.dkr.ecr.us-east-1.amazonaws.com/ceu-website
IMAGE_TAG ?= $(shell git rev-parse --short HEAD)
PUSH_LATEST ?= 1
DOCKER_PLATFORM ?= linux/amd64
PULUMI_STACK ?= prod
PULUMI_DIR ?= infra
PULUMI_CONFIG_KEY ?= ceuplanner-infra:apiImageTag

export DATABASE_URL DEV_USER_ID DEV_EMAIL

all:
	$(MAKE) predeploy
	$(MAKE) pulumi-preview
	$(MAKE) approve-deploy
	$(MAKE) deploy-apply

predeploy:
	$(MAKE) test
	$(MAKE) infra-build
	$(MAKE) image-build
	$(MAKE) pulumi-set-tag

deploy-apply:
	$(MAKE) ecr-login
	$(MAKE) image-push
	$(MAKE) pulumi-up
	$(MAKE) web-deploy

dev:
	./scripts/dev.sh

test:
	./scripts/test.sh

infra-build:
	cd $(PULUMI_DIR) && npm run build

migrate:
	cd apps/api && uv run alembic upgrade head

db-up:
	docker compose up -d db

db-down:
	docker compose down

demo:
	docker compose up -d db
	./scripts/wait_for_db.sh
	cd apps/api && uv run alembic upgrade head
	cd apps/api && CERT_STORAGE_DIR=apps/api/.data/certificates uv run python -m ce_api.scripts.seed_demo --reset

demo-reset: demo

demo-dev:
	-docker compose down -v
	$(MAKE) demo
	DEV_USER_ID=demo-user-1 DEV_EMAIL=demo@example.com ./scripts/dev.sh

demo-check: demo
	cd apps/api && uv run python -m ce_api.scripts.demo_check

ecr-login:
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_REPO)

image-build:
	docker build --platform $(DOCKER_PLATFORM) -f Dockerfile.prod -t $(ECR_REPO):$(IMAGE_TAG) .
ifeq ($(PUSH_LATEST),1)
	docker tag $(ECR_REPO):$(IMAGE_TAG) $(ECR_REPO):latest
endif

image-push:
	docker push $(ECR_REPO):$(IMAGE_TAG)
ifeq ($(PUSH_LATEST),1)
	docker push $(ECR_REPO):latest
endif

image-release: ecr-login image-build image-push

pulumi-set-tag:
	cd $(PULUMI_DIR) && pulumi config set $(PULUMI_CONFIG_KEY) $(IMAGE_TAG) -s $(PULUMI_STACK)

pulumi-preview:
	cd $(PULUMI_DIR) && pulumi preview -s $(PULUMI_STACK)

approve-deploy:
	@printf "Proceed with deploy (push image, pulumi up, web sync)? [y/N] "; \
	read answer; \
	case "$$answer" in \
		[Yy]|[Yy][Ee][Ss]) echo "Continuing deploy...";; \
		*) echo "Deploy cancelled."; exit 1;; \
	esac

pulumi-up:
	cd $(PULUMI_DIR) && pulumi up -s $(PULUMI_STACK)

web-build:
	@AUTH_URL=$$(cd $(PULUMI_DIR) && pulumi stack output authUrl -s $(PULUMI_STACK)); \
	APP_URL=$$(cd $(PULUMI_DIR) && pulumi stack output appUrl -s $(PULUMI_STACK)); \
	CLIENT_ID=$$(cd $(PULUMI_DIR) && pulumi stack output cognitoUserPoolClientId -s $(PULUMI_STACK)); \
	if [ -z "$$AUTH_URL" ] || [ -z "$$APP_URL" ] || [ -z "$$CLIENT_ID" ]; then \
		echo "Missing Pulumi outputs for web auth config."; \
		exit 1; \
	fi; \
	case "$$AUTH_URL $$APP_URL $$CLIENT_ID" in *"[unknown]"*|*"not-deployed"*) \
		echo "Pulumi outputs are not ready yet: AUTH_URL=$$AUTH_URL APP_URL=$$APP_URL CLIENT_ID=$$CLIENT_ID"; \
		exit 1 ;; \
	esac; \
	AUTH_DOMAIN=$${AUTH_URL#https://}; \
	AUTH_DOMAIN=$${AUTH_DOMAIN#http://}; \
	AUTH_DOMAIN=$${AUTH_DOMAIN%/}; \
	APP_URL=$${APP_URL%/}; \
	if [ -z "$$AUTH_DOMAIN" ] || [ -z "$$APP_URL" ]; then \
		echo "Derived web auth env is invalid."; \
		exit 1; \
	fi; \
	cd apps/web && \
	export VITE_COGNITO_DOMAIN=$$AUTH_DOMAIN; \
	export VITE_COGNITO_CLIENT_ID=$$CLIENT_ID; \
	export VITE_COGNITO_REDIRECT_URI=$$APP_URL/auth/callback; \
	export VITE_COGNITO_LOGOUT_URI=$$APP_URL; \
	npm ci && npm run build

web-sync: web-build
	@WEB_BUCKET=""; \
	DISTRIBUTION_ID=""; \
	for attempt in 1 2 3; do \
		WEB_BUCKET=$$(cd $(PULUMI_DIR) && pulumi stack output websiteBucketName -s $(PULUMI_STACK) 2>/dev/null || true); \
		DISTRIBUTION_ID=$$(cd $(PULUMI_DIR) && pulumi stack output distributionId -s $(PULUMI_STACK) 2>/dev/null || true); \
		if [ -n "$$WEB_BUCKET" ] && [ -n "$$DISTRIBUTION_ID" ] && [ "$$WEB_BUCKET" != "[unknown]" ] && [ "$$DISTRIBUTION_ID" != "[unknown]" ]; then \
			break; \
		fi; \
		echo "Could not read Pulumi web outputs (attempt $$attempt/3); retrying..."; \
		sleep 2; \
	done; \
	if [ -z "$$WEB_BUCKET" ] || [ -z "$$DISTRIBUTION_ID" ] || [ "$$WEB_BUCKET" = "[unknown]" ] || [ "$$DISTRIBUTION_ID" = "[unknown]" ]; then \
		echo "Missing Pulumi outputs for web sync. Check Pulumi backend/network and run again."; \
		exit 1; \
	fi; \
	aws s3 sync apps/web/dist s3://$$WEB_BUCKET --delete && \
	aws cloudfront create-invalidation --distribution-id $$DISTRIBUTION_ID --paths '/*'

web-deploy: web-sync
