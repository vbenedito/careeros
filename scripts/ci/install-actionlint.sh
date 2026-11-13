#!/usr/bin/env bash
# Installs `actionlint` into /usr/local/bin on a GitHub-hosted Linux runner, pinned to one release
# and verified by checksum (ENV-08, ENV-09, grill T7). The single place where the version is set.
set -euo pipefail
version=1.7.12
sha256=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8
work=${RUNNER_TEMP:-$(mktemp -d)}
curl -sSfL -o "$work/actionlint.tgz" \
  "https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_linux_amd64.tar.gz"
echo "${sha256}  $work/actionlint.tgz" | sha256sum --check
tar xzf "$work/actionlint.tgz" -C "$work" actionlint
sudo install "$work/actionlint" /usr/local/bin/
