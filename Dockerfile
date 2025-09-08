# ---- Base Node ----
# Use a specific Node.js version known to work, Alpine for smaller size
FROM node:23-alpine AS base
WORKDIR /usr/src/app

ENV MCP_TRANSPORT_TYPE=http 
ARG MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_HOST=${MCP_HTTP_HOST}
ARG MCP_HTTP_PORT=3015
ENV MCP_HTTP_PORT=${MCP_HTTP_PORT}
ARG MCP_LOG_LEVEL=info
ENV MCP_LOG_LEVEL=${MCP_LOG_LEVEL}

# Force to log to console
ENV MCP_LOG_LEVEL=info

# ---- Builder ----
# Build the application
FROM base AS builder
WORKDIR /usr/src/app
# Copy dependency manifests and install *all* dependencies (including dev)
COPY package.json package-lock.json* ./
# Copy the rest of the source code
COPY . .

RUN npm ci
# Build the TypeScript project
RUN npm run build
RUN npm run postbuild

# ---- Production Dependencies ----
# Install only production dependencies for the final image
FROM base AS prod-deps
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# ---- Runner ----
# Final stage with only production dependencies and built code
FROM base AS runner
WORKDIR /usr/src/app
# Copy production node_modules from the 'prod-deps' stage
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
# Copy built application from the 'builder' stage
COPY --from=builder /usr/src/app/dist ./dist
# Copy package.json (needed for potential runtime info, like version)
COPY package.json .

# Add git to the container
RUN apk update
RUN apk add git

# This seems to need to exist, though we really just want to log to the console
RUN mkdir logs && chmod 777 logs

COPY ./scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# In this base image "node" is 1000:1000. It doesn't matter what user is used to run the server;
# rather the user ID should match the uid/gid of the host user so that the server can 
# read and write files in the volume mount.
RUN chmod 777 /home/node
ENV HOME=/home/node
USER node:node

ENV NODE_ENV=production
EXPOSE ${MCP_HTTP_PORT}

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
