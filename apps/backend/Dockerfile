# syntax=docker/dockerfile:1
#
# Medusa v2 POS backend image.
#
# Built from the repo ROOT (see docker-compose.yml `build.context: .`) so the
# workspace package @pos/shared can be linked. We deliberately trim the monorepo
# down to just the backend-relevant workspaces inside the image so we never pull
# in Electron (desktop app) or Expo / native SQLite (mobile app) — none of which
# belong in, or build cleanly in, a headless Linux server image.
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=development \
    # The backend never needs these heavyweight binaries; skip their downloads
    # in case a transitive dep tries to fetch them.
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    HUSKY=0

# Build toolchain for any native npm deps that fall back to compiling, plus curl
# for the compose healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy only the workspaces the backend actually needs.
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Reduce root workspaces to backend + shared, then install. With only these two
# workspace dirs present, npm resolves a clean dependency tree (no Electron/Expo)
# and runs the shared package's `prepare` build so its dist/ is ready to import.
# We also drop the root-only `field-sales-platform` dep: it's a host file: link
# (../../../ayush/FieldSales) that doesn't exist in the build context, and the
# backend doesn't import it.
RUN node -e "const fs=require('fs');const p=require('./package.json');p.workspaces=['packages/shared','apps/backend'];delete p.scripts;if(p.dependencies)delete p.dependencies['field-sales-platform'];fs.writeFileSync('package.json',JSON.stringify(p,null,2));" \
 && npm install --no-audit --no-fund

# Normalize line endings (in case of a CRLF checkout on Windows) and make the
# entrypoint executable.
RUN sed -i 's/\r$//' /app/apps/backend/docker-entrypoint.sh \
 && chmod +x /app/apps/backend/docker-entrypoint.sh

WORKDIR /app/apps/backend
EXPOSE 9000

ENTRYPOINT ["/app/apps/backend/docker-entrypoint.sh"]
# `medusa develop` — serves the API + admin on $PORT (9000), hot-reloads source.
CMD ["npm", "run", "dev"]
