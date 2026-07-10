#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <password>" >&2
  exit 1
fi

HASH=$(node -e "
const bcrypt = require('bcrypt');
const pw = process.env.PASSWORD;
bcrypt.hash(pw, 12).then(h => process.stdout.write(h)).catch(e => { process.stderr.write(String(e)); process.exit(1); });
" PASSWORD="$1")

echo "$HASH"
