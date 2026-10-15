#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
pattern='^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^()[:space:]]+\))?: [^[:space:]].*$'

validate_subject() {
  if [[ ! "$1" =~ $pattern ]]; then
    printf 'Invalid commit %s: %s\n' "$2" "$1" >&2
    echo "Use type(scope): summary or type: summary (for example, feat: add OAuth support)." >&2
    echo "Allowed types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test." >&2
    echo "For breaking changes, use a BREAKING CHANGE: footer with the Angular release preset." >&2
    return 1
  fi
}

if [[ "${1:-}" == "--message-file" ]]; then
  if [[ "$#" -ne 2 || ! -f "$2" ]]; then
    echo "Usage: scripts/commit.sh --message-file <commit-message-file>" >&2
    exit 1
  fi
  # Match Git's cleanup of comments and blank lines before reading the subject.
  message="$(git stripspace --strip-comments < "$2")"
  subject="${message%%$'\n'*}"
  validate_subject "$subject" "message"
  echo "Commit message follows the release convention."
  exit 0
fi

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

failed=0
while IFS= read -r commit; do
  subject="$(git show -s --format=%s "$commit")"
  if ! validate_subject "$subject" "$commit"; then
    failed=1
  fi
done <<< "$commits"

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi
echo "All pull request commit subjects follow the release convention."
