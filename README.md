# Git MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.3-green.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Beta-orange.svg)]()

A Model Context Protocol server that provides comprehensive Git functionality to Large Language Models, enabling them to perform version control operations through a secure and standardized interface.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Tools](#tools)
- [Best Practices](#best-practices)
- [Development](#development)
- [Up Next](#up-next)
- [Contributing](#contributing)
- [License](#license)

## Overview

### Model Context Protocol Server

The Git MCP Server implements the Model Context Protocol (MCP), created by Anthropic, which provides a standardized communication protocol between LLMs and external systems. The architecture consists of:

- **Clients** (Claude Desktop, IDEs) that maintain server connections
- **Servers** that provide tools and resources to clients
- **LLMs** that interact with servers through client applications

This architecture creates a secure boundary between LLMs and external systems while enabling controlled access to Git functionality. Through the MCP protocol, the Git server empowers LLMs to perform version control operations, manage repositories, and handle complex Git workflows — all within a secure and validated environment.

## Features

### Core Git Operations
- Repository initialization and cloning
- File staging and committing
- Branch management
- Remote operations
- Tag handling
- Stash management

### Bulk Operations
- Sequential operation execution
- Atomic commits
- Smart defaults
- Error resilience

### Safety Features
- Path validation
- Repository state verification
- Embedded repository handling
- Comprehensive error reporting

## Installation

### Setup Steps

1. Clone the repository:
```bash
git clone https://github.com/cyanheads/git-mcp-server.git
```

2. Navigate to the project directory:
```bash
cd git-mcp-server
```

3. Install dependencies:
```bash
npm install
```

4. Build the project:
```bash
npm run build
```

The server is now ready to be configured and used with your MCP client.

## Configuration

The Git MCP Server requires configuration in your MCP client settings:

```json
{
  "mcpServers": {
    "git": {
      "command": "node",
      "args": ["/path/to/git-mcp-server/build/index.js"],
      "env": {
        "GIT_DEFAULT_PATH": "/optional/default/path/for/git/operations"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| GIT_DEFAULT_PATH | Default path for Git operations | No |

### Path Requirements

All paths must be absolute. For example:
- Repository path: `/Users/username/projects/my-repo`
- File paths: `/Users/username/projects/my-repo/src/file.js`

## Tools

### Basic Operations

#### init
Initializes a new Git repository.
```typescript
{
  "path": string  // Path to initialize
}
```

#### clone
Clones a repository.
```typescript
{
  "url": string,  // Repository URL (required)
  "path": string  // Clone destination
}
```

#### status
Gets repository status.
```typescript
{
  "path": string  // Repository path
}
```

### Bulk Operations

#### bulk_action
Executes multiple Git operations in sequence. This is the preferred way to execute multiple operations.

```typescript
{
  "path": string,     // Repository path
  "actions": [        // Array of operations to execute
    {
      "type": "stage",
      "files": string[]  // Optional - if omitted, stages all changes
    },
    {
      "type": "commit",
      "message": string
    },
    {
      "type": "push",
      "branch": string,
      "remote": string   // Optional - defaults to "origin"
    }
  ]
}
```

### Branch Operations

#### branch_list, branch_create, branch_delete, checkout
Manage branches and working tree.

### Tag Operations

#### tag_list, tag_create, tag_delete
Manage repository tags.

### Remote Operations

#### remote_list, remote_add, remote_remove
Manage remote repositories.

### Stash Operations

#### stash_list, stash_save, stash_pop
Manage working directory changes.

## Best Practices

### Path Management
- Always use absolute paths
- Validate paths before operations
- Handle embedded repositories properly

### Bulk Operations
- Use bulk_action for multiple operations
- Handle operation dependencies correctly
- Provide clear commit messages

### Error Handling
- Check operation results
- Handle partial success scenarios
- Validate repository state

## Development

```bash
# Build the project
npm run build

# Watch for changes
npm run watch

# Run MCP inspector
npm run inspector
```

### Error Handling

The server provides detailed error information:
- Invalid paths or arguments
- Git command failures
- Repository state errors
- Permission issues

## Contributing

I welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

For bugs and feature requests, please create an issue.

## License

Apache License 2.0

---

<div align="center">
Built with the Model Context Protocol
</div>
