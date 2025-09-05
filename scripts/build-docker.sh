#!/bin/bash
VERSION=$(grep -m 1 "^## v" CHANGELOG.md | sed 's/^## v\([0-9.]*\).*/\1/')
GIT_USER_NAME=$(git config user.name)
GIT_USER_EMAIL=$(git config user.email)
USER_ID=$(id -u)
GROUP_ID=$(id -g)
docker build --no-cache\
  --build-arg USER_ID="$USER_ID" \
  --build-arg GROUP_ID="$GROUP_ID" \
  --build-arg GIT_USER_NAME="$GIT_USER_NAME" \
  --build-arg GIT_USER_EMAIL="$GIT_USER_EMAIL" \
  -t git-mcp-server:$VERSION \
  -t git-mcp-server:latest \
  .