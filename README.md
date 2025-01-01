# Git MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.4-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)]()

A Model Context Protocol server that provides Git operations to Large Language Models. This tool enables LLMs to interact with Git repositories through a robust and flexible API.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Tools](#tools)
- [Performance](#performance)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Overview

Git MCP Server implements the Model Context Protocol (MCP), enabling standardized communication between LLMs and Git repositories through:

- **Clients** (Claude Desktop, IDEs) that maintain server connections
- **Servers** that provide tools and resources (Like our Git MCP Server)
- **LLMs** that interact with servers through client applications

### Core Components

- **GitOperations**: Core Git command execution with error handling
- **RepositoryValidator**: Comprehensive repository validation
- **PathValidator**: Path validation and security checks
- **CommandExecutor**: Secure command execution
- **PerformanceMonitor**: Performance tracking and optimization
- **RepositoryCache**: Caching system for Git operations
- **ErrorHandler**: Structured error handling with recovery

## Features

### Git Operations

- Repository initialization and cloning
- File staging and committing
- Branch management
- Tag operations
- Remote repository handling
- Stash management
- Bulk operations support

### Performance Optimization

- Repository state caching
- Command result caching
- Performance monitoring:
  - Operation timing
  - Memory usage tracking
  - Resource utilization
  - Cache hit rates
- Automatic cache invalidation
- Memory pressure monitoring

### Error Handling

Error severity levels:
- CRITICAL: System-level failures
- HIGH: Operation-blocking errors
- MEDIUM: Non-blocking issues
- LOW: Minor problems

Error categories:
- SYSTEM: System-level errors
- VALIDATION: Input validation errors
- OPERATION: Git operation errors
- REPOSITORY: Repository state errors
- NETWORK: Network-related errors
- CONFIGURATION: Configuration errors
- SECURITY: Security-related errors

Error context tracking:
- Operation details
- Timestamps
- Stack traces
- Recovery steps
- Technical context

### Security

- Path validation and sanitization
- Command injection prevention
- Repository access control
- Secure credential handling
- Input validation
- Error message sanitization

## Installation

1. Install the package:

```bash
npm install git-mcp-server
```

2. Add to your MCP client settings:

```json
{
  "mcpServers": {
    "git": {
      "command": "node",
      "args": ["/path/to/git-mcp-server/build/index.js"],
      "env": {
        "GIT_DEFAULT_PATH": "/path/to/default/repo/directory",
        "GIT_MAX_MEMORY": "1024", // Optional, in MB
        "GIT_CACHE_TTL": "300", // Optional, in seconds
        "GIT_LOG_LEVEL": "info" // Optional: debug, info, warn, error
      }
    }
  }
}
```

## Configuration

### Environment Variables

- `GIT_DEFAULT_PATH`: Default repository directory
- `GIT_MAX_MEMORY`: Maximum memory usage (MB)
- `GIT_CACHE_TTL`: Cache time-to-live (seconds)
- `GIT_LOG_LEVEL`: Logging level
- `GIT_PERFORMANCE_MONITOR`: Enable performance monitoring
- `GIT_ERROR_DETAILS`: Include detailed error information

### Performance Tuning

Cache configuration:
```json
{
  "repository": {
    "ttl": 300,
    "maxSize": 100
  },
  "command": {
    "ttl": 60,
    "maxSize": 500
  }
}
```

Resource thresholds:
```json
{
  "memory": {
    "warning": 1024,
    "critical": 2048
  },
  "operations": {
    "warning": 100,
    "critical": 200
  }
}
```

## Tools

### init
Initialize a new Git repository:
```typescript
{
  "path": "/path/to/repo" // Optional if GIT_DEFAULT_PATH is set
}
```

### clone
Clone a repository:
```typescript
{
  "url": "https://github.com/user/repo.git",
  "path": "/path/to/destination" // Optional
}
```

### status
Get repository status:
```typescript
{
  "path": "/path/to/repo" // Optional
}
```

### add
Stage files:
```typescript
{
  "path": "/path/to/repo", // Optional
  "files": ["/path/to/file1", "/path/to/file2"]
}
```

### commit
Create a commit:
```typescript
{
  "path": "/path/to/repo", // Optional
  "message": "Commit message"
}
```

### push
Push commits to remote:
```typescript
{
  "path": "/path/to/repo", // Optional
  "remote": "origin", // Optional, defaults to "origin"
  "branch": "main"
}
```

### bulk_action
Execute multiple operations atomically. This is the preferred method for executing multiple Git operations as it:
- Ensures operations are executed in the correct order
- Provides atomic execution (all succeed or all fail)
- Optimizes performance through reduced command overhead
- Maintains consistent repository state
- Automatically handles cache invalidation

Example usage:
```typescript
{
  "path": "/path/to/repo", // Optional
  "actions": [
    {
      "type": "stage",
      "files": ["file1", "file2"] // Optional - if omitted, stages all changes
    },
    {
      "type": "commit",
      "message": "Commit message"
    },
    {
      "type": "push",
      "branch": "main",
      "remote": "origin" // Optional - defaults to "origin"
    }
  ]
}
```

The bulk_action tool supports three types of operations:
1. `stage`: Stage files for commit
   - `files`: Optional array of files to stage. If omitted, stages all changes
2. `commit`: Create a new commit
   - `message`: Required commit message
3. `push`: Push changes to remote
   - `branch`: Required branch name
   - `remote`: Optional remote name (defaults to "origin")

## Performance

### Caching Strategy

The server implements a robust caching system built on top of simple-git, providing two-level caching:

1. Repository State Cache:
   - Branch information
   - Status
   - Tags
   - Remotes
   - Stash entries

2. Command Result Cache:
   - Common command outputs
   - Validation results
   - Repository metadata

Cache invalidation:
- Automatic on state-changing operations (commit, push, etc.)
- TTL-based expiration (configurable via GIT_CACHE_TTL)
- Memory pressure-based eviction (monitored via GIT_MAX_MEMORY)
- LRU eviction policy for optimal cache utilization
- Smart invalidation based on operation dependencies
- Partial cache updates for efficiency

Implementation details:
- Uses simple-git for reliable Git operations
- Implements optimistic locking for cache updates
- Maintains cache coherency across operations
- Provides cache warming for frequently accessed data
- Supports concurrent cache access with proper synchronization

### Performance Monitoring

Metrics collected:
- Operation timing
- Memory usage
- Cache hit rates
- Resource utilization
- Command execution stats

Monitoring tools:
```typescript
// Get performance statistics
const stats = await performanceMonitor.getStatistics();

// Get cache statistics
const cacheStats = await repositoryCache.getStats();

// Get operation metrics
const metrics = await performanceMonitor.getMetrics(
  MetricType.OPERATION_DURATION,
  startTime,
  endTime
);
```

## Error Handling

### Error Types

```typescript
// System errors
throw new SystemError('Disk space exhausted', {
  operation: 'clone',
  path: '/path/to/repo'
});

// Validation errors
throw new ValidationError('Invalid branch name', {
  operation: 'branch_create',
  details: { name: 'invalid/name' }
});

// Operation errors
throw new OperationError('Push failed', {
  operation: 'push',
  command: 'git push origin main'
});
```

### Error Recovery

Each error includes recovery steps:
```typescript
try {
  await gitOps.push(options);
} catch (error) {
  if (error instanceof GitMcpError) {
    console.log('Recovery steps:', error.getRecoverySteps());
  }
}
```

### Error Context

Errors include detailed context:
```typescript
{
  "name": "OperationError",
  "message": "Push failed: remote connection error",
  "code": "INTERNAL_ERROR",
  "severity": "HIGH",
  "category": "NETWORK",
  "context": {
    "operation": "push",
    "path": "/path/to/repo",
    "command": "git push origin main",
    "timestamp": 1234567890,
    "recoverySteps": [
      "Check network connection",
      "Verify remote URL",
      "Check credentials"
    ]
  }
}
```

## Best Practices

### Repository Operations

1. Use bulk operations for multiple changes:
```typescript
await gitOps.executeBulkActions({
  actions: [
    { type: 'stage', files: ['file1', 'file2'] },
    { type: 'commit', message: 'Update files' },
    { type: 'push', branch: 'main' }
  ]
});
```

2. Validate paths and inputs:
```typescript
PathValidator.validatePath(path, {
  mustExist: true,
  allowDirectory: true
});
```

3. Handle embedded repositories:
```typescript
const { path, hasEmbeddedRepo } = PathValidator.validateGitRepo(path);
if (hasEmbeddedRepo) {
  // Handle embedded .git directories
}
```

### Performance

1. Use caching appropriately:
```typescript
const result = await repositoryCache.getState(
  repoPath,
  RepoStateType.BRANCH,
  'branch -a',
  () => executeGitCommand('branch -a')
);
```

2. Monitor resource usage:
```typescript
performanceMonitor.recordMemoryUsage();
performanceMonitor.recordResourceUsage('cpu', cpuUsage);
```

3. Handle cache invalidation:
```typescript
repositoryCache.invalidateState(repoPath, RepoStateType.STATUS);
repositoryCache.invalidateCommand(repoPath, 'status');
```

### Error Handling

1. Use appropriate error types:
```typescript
if (!isValidBranch(name)) {
  throw new ValidationError(`Invalid branch name: ${name}`, {
    operation: 'branch_create',
    details: { name }
  });
}
```

2. Include recovery steps:
```typescript
throw new NetworkError('Remote unreachable', {
  operation: 'push',
  recoverySteps: [
    'Check network connection',
    'Verify remote URL'
  ]
});
```

3. Log errors appropriately:
```typescript
logger.error(
  operation,
  'Operation failed',
  path,
  error,
  { command, context }
);
```

## Development

1. Clone the repository:
```bash
git clone https://github.com/your-org/git-mcp-server.git
cd git-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Run tests:
```bash
npm test
```

## Contributing

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
