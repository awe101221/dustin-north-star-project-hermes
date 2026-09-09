#!/usr/bin/env bash
# Hermes cron runs .sh scripts via bash before invoking the research agent.
# Fixed repo and runtime path; no secret is printed or placed on the command line.
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${PATH:-}"
cd /Users/dustinawe/Documents/Codex/dustin-north-star-project-hermes
exec node --import tsx scripts/learning/cli.ts --hermes-env grade
