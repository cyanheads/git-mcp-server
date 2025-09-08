#!/bin/sh

# Configure Git user settings if environment variables are provided
if [ -n "$GIT_USER_EMAIL" ] && [ -n "$GIT_USER_NAME" ]; then
    echo "Configuring Git user: $GIT_USER_NAME <$GIT_USER_EMAIL>"
    git config --global user.email "$GIT_USER_EMAIL"
    git config --global user.name "$GIT_USER_NAME"
else
    echo "Warning: GIT_USER_EMAIL and/or GIT_USER_NAME not set. Git operations may fail without proper user configuration."
fi

# Execute the main command
exec "$@"