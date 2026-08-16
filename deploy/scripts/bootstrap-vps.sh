#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${INVENTORY:-$ROOT_DIR/deploy/ansible/inventory.ini}"
if [[ "$INVENTORY" != /* ]]; then
  INVENTORY="$ROOT_DIR/$INVENTORY"
fi

cd "$ROOT_DIR/deploy/ansible"
ansible-playbook -i "$INVENTORY" playbooks/bootstrap.yml "$@"
