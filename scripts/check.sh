#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
npm run lint -- --max-warnings=0
npm run format:check
npm run check-types
