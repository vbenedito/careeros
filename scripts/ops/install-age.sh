#!/usr/bin/env bash
# Installs `age` and `age-keygen` into /usr/local/bin on a GitHub-hosted Linux runner, pinned to
# one release and verified by checksum (#31, ENV-09). The single place where the version is set:
# used by ci.yml (backup round trip), backup.yml and migrate.yml (#147).
set -euo pipefail
version=v1.2.1
sha256=7df45a6cc87d4da11cc03a539a7470c15b1041ab2b396af088fe9990f7c79d50
work=${RUNNER_TEMP:-$(mktemp -d)}
curl -sSfL -o "$work/age.tgz" \
  "https://github.com/FiloSottile/age/releases/download/${version}/age-${version}-linux-amd64.tar.gz"
echo "${sha256}  $work/age.tgz" | sha256sum --check
tar xzf "$work/age.tgz" -C "$work"
sudo install "$work/age/age" "$work/age/age-keygen" /usr/local/bin/
