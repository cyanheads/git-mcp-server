#!/bin/bash
VERSION=$(grep -m 1 "^## v" CHANGELOG.md | sed 's/^## v\([0-9.]*\).*/\1/')
docker build --no-cache\
  -t git-mcp-server:$VERSION \
  -t git-mcp-server:latest \
  .