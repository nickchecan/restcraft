#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
base="${1:-${PR_BASE_SHA:-origin/main}}"
head="${2:-${PR_HEAD_SHA:-HEAD}}"
git rev-parse --verify "${base}^{commit}" >/dev/null
git rev-parse --verify "${head}^{commit}" >/dev/null

# Three dots include only commits introduced by this branch, even if main moved.
commits="$(git rev-list --reverse "${base}...${head}" --right-only)"
if [[ -z "$commits" ]]; then
  echo "No pull request commits to validate."
  exit 0
fi

pattern='^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^()[:space:]]+\))?: [^[:space:]].*$'
failed=0
while IFS= read -r commit; do
  subject="$(git show -s --format=%s "$commit")"
  if [[ ! "$subject" =~ $pattern ]]; then
    printf 'Invalid commit %s: %s\n' "$commit" "$subject" >&2
    failed=1
  fi
done <<< "$commits"

if [[ "$failed" -ne 0 ]]; then
  echo "Use type(scope): summary or type: summary (for example, feat: add OAuth support)." >&2
  echo "Allowed types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test." >&2
  echo "For breaking changes, use a BREAKING CHANGE: footer with the Angular release preset." >&2
  exit 1
fi
echo "All pull request commit subjects follow the release convention."
