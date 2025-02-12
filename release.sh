#!/bin/bash

# Usage: ./release.sh 0.0.1

# Check if version is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <new_version>"
  exit 1
fi

new_version="$1"

# Update version in package.json
sed -i 's/"version": ".*"/"version": "'$new_version'"/' package.json

# Commit the changes
git commit -am "Release $new_version"

# Tag the release
git tag -a v$new_version -m "lean-scribe $new_version"

# Push the changes and tags
git push
git push --tags

# Publish the extension using vsce
vsce publish $new_version