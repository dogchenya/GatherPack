#!/bin/bash
set -euo pipefail
# Keep Ubuntu's signed repositories and suites; avoid a slow Azure mirror.
# This is used only by disposable GitHub-hosted Ubuntu runners.
for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  if [ -f "$source" ] && grep -q 'azure.archive.ubuntu.com' "$source"; then
    sudo sed -i 's#https\?://azure.archive.ubuntu.com/ubuntu#https://archive.ubuntu.com/ubuntu#g' "$source"
  fi
done
