# ---- Base Node ----
# Use a specific Node.js version known to work, Alpine for smaller size
FROM node:23-alpine AS base
WORKDIR /usr/src/app
#ENV NODE_ENV=production

ENV MCP_TRANSPORT_TYPE=http 
ARG USER_ID
ARG GROUP_ID
ARG MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_HOST=${MCP_HTTP_HOST}
ARG MCP_HTTP_PORT=3015
ENV MCP_HTTP_PORT=${MCP_HTTP_PORT}
ARG MCP_LOG_LEVEL=info
ENV MCP_LOG_LEVEL=${MCP_LOG_LEVEL}
ARG GIT_USER_EMAIL
ARG GIT_USER_NAME

# The user/group ID must match your local user/group ID
RUN test -n "$USER_ID" || (echo "ERROR: USER_ID build argument is required" && exit 1)
RUN test -n "$GROUP_ID" || (echo "ERROR: GROUP_ID build argument is required" && exit 1)
RUN test -n "$GIT_USER_EMAIL" || (echo "ERROR: GIT_USER_EMAIL build argument is required" && exit 1)
RUN test -n "$GIT_USER_NAME" || (echo "ERROR: GIT_USER_NAME build argument is required" && exit 1)

ENV GIT_USER_EMAIL=${GIT_USER_EMAIL}
ENV GIT_USER_NAME=${GIT_USER_NAME}

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

# The container has a default user called node(1000), we need to delete it
# in case this conflicts with our local user/group ID
RUN deluser node

# Create a non-root user and switch to ituse
RUN addgroup -g ${GROUP_ID} appgroup 
RUN adduser -u ${USER_ID} -G appgroup -D appuser

# This seems to need to exist, though we really just want to log to the console
RUN mkdir logs && chown appuser:appgroup logs

USER appuser:appgroup

# Configure git before switching to non-root user
RUN git config --global user.email "${GIT_USER_EMAIL}"
RUN git config --global user.name "${GIT_USER_NAME}"

EXPOSE ${MCP_HTTP_PORT}

# Command to run the application
CMD ["node", "dist/index.js"]
