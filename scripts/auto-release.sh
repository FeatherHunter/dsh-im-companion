#!/usr/bin/env bash
#
# scripts/auto-release.sh -- autopilot driver for wizard-release.sh.
#
# NOTE: this file is intentionally ASCII-only (repo tooling has mangled
# multibyte chars on write before). Chinese literals use $'\uXXXX' escapes,
# which bash expands to real UTF-8 at runtime.
#
# What it does (agent-led, user only scans at the browser-auth step):
#   RULE 1 (auto-run): every [y/N] gate gets "y" -- never "no", always forward.
#   RULE 2 (auto-jump): whenever the wizard wants a browser ("arrow opening"
#     line) or npm prints an auth link, open it in the Windows browser
#     automatically -- the scan page is ready when the user looks up.
#     If no opener exists, print a LOUD banner with the URL instead.
# All other pauses / the (empty) token prompt get an automatic Enter
# (empty token = browser auth later, which is exactly what we want).
#
# Usage (sidebar terminal, agent drives, user scans):
#   bash scripts/auto-release.sh
#
# Preconditions (caller's / agent's duty, NOT done here):
#   1. `npm run check` is green on native Windows for this exact tree.
#      The WSL-side tsc failure (missing linux platform package in a
#      Windows-installed node_modules) is environmental noise, not a code
#      problem -- hence WIZARD_SKIP_CHECK=1 below. Skipping is only valid
#      because Windows-side just went green.
#   2. Version already bumped (package.json / package-lock.json / CHANGELOG).
# Pushing blind on a broken tree ships a broken package to npm
# (the registry rejects dup versions, NOT bad code).
# Safety valves: occupied version aborts BEFORE entering the wizard (no blind
# push into a 409); anything unrecognized fails safe -- an unmatched gate
# keeps its default, which is to stop, not to barge through.
#
# Plumbing notes (earned the hard way -- do not "simplify"):
# - The wizard runs as a plain background job behind two FIFOs, NOT coproc:
#   bash has been observed closing the original coproc fds in our own table
#   the moment the coproc dies (later reads fail EBADF instead of EOF).
# - Exit status comes from `wait` on the DIRECT child pid (a coproc
#   intermediate shell proved unreliable as a status channel here).
# - `read -d ''` (empty delim = NUL, never occurs in terminal output) keeps
#   embedded newlines intact. Plain `read -n` eats the newline it stops at,
#   gluing consecutive lines together and ghost-triggering the URL matcher.
# - URL matches strip the FIRST occurrence only (single slash): the npm auth
#   URL contains the login-page URL as a prefix, and a global strip would
#   eat it out of the longer URL too.
# - scan_urls() runs BEFORE the gate checks: one chunk may carry links AND
#   a gate prompt together; answering first would clear the buffer and the
#   links would never be opened.
#
# Test hooks (never in production): AUTO_RELEASE_WIZARD overrides the wizard
# path; AUTO_RELEASE_NO_OPEN=1 prints links instead of opening a browser;
# AUTO_RELEASE_DEBUG=1 traces matches/answers/exit to stderr.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

PKG="dsh-im-companion"
NPM_REGISTRY="https://registry.npmjs.org"
WIZARD="${AUTO_RELEASE_WIZARD:-scripts/wizard-release.sh}"
VER="$(node -p "require('./package.json').version")"

# -- Preflight: occupied version stops here (agent bumps first).
# Skipped on resume (WIZARD_FROM>1): after a good publish the version IS
# taken, and stages 4-6 (verify/tag/Release) must still run. --
if [[ "${WIZARD_FROM:-1}" -le 1 ]] && npm view "${PKG}@${VER}" version --registry "$NPM_REGISTRY" >/dev/null 2>&1; then
  echo "ABORT: ${PKG}@${VER} already taken -- bump first (no auto-bump here)" >&2
  exit 1
fi
echo "OK: ${PKG}@${VER} free-or-resume, autopilot engaged"

# -- Browser opener probe (WSL -> Windows landing page) --
OPENER=""
if [[ "${AUTO_RELEASE_NO_OPEN:-0}" = "1" ]]; then
  OPENER="dry-run"
elif command -v wslview >/dev/null 2>&1; then       OPENER="wslview"
elif command -v explorer.exe >/dev/null 2>&1; then  OPENER="explorer.exe"
elif command -v powershell.exe >/dev/null 2>&1; then OPENER="powershell.exe"
elif command -v cmd.exe >/dev/null 2>&1; then       OPENER="cmd.exe"
else OPENER=""; fi
echo "OK: browser opener = ${OPENER:-none (links will be bannered)}"

# WSL-side check is environmental noise (see header) -- authority is Windows.
export WIZARD_SKIP_CHECK=1

# Chinese literals via escapes (file stays ASCII; bash expands at runtime).
PAT_PAUSE=$'\u6309\u56de\u8f66'
PAT_PASTE=$'\u7c98\u8d34'
RE_OPEN=$'\u2197 opening ([^[:space:]]+)'
JUMP_PRE=$'\u2605\u2605\u2605 \u81ea\u52a8\u8df3\u8f6c \u2192 '
JUMP_POST=$'\u2605\u2605\u2605'
SCAN_READY=$'\uff08\u626b\u7801\u9875\u5df2\u5c31\u7eea\uff0c\u76f4\u63a5\u626b\u5373\u53ef\uff09'
RE_NPM='https://www\.npmjs\.com/[^[:space:]"'"'"']*'

dbg() { [[ "${AUTO_RELEASE_DEBUG:-0}" = "1" ]] && printf '[dbg] %s\n' "$1" >&2 || true; }

declare -a OPENED_URLS=()
open_once() {
  local url="$1" u
  for u in ${OPENED_URLS[@]+"${OPENED_URLS[@]}"}; do [[ "$u" == "$url" ]] && return 0; done
  OPENED_URLS+=("$url")
  dbg "open url: $url"
  printf '\n  %s%s %s\n' "$JUMP_PRE" "$url" "$JUMP_POST"
  case "$OPENER" in
    dry-run)       echo "  [dry-open] $url" ;;
    wslview)       wslview "$url" >/dev/null 2>&1 || true ;;
    explorer.exe)  explorer.exe "$url" >/dev/null 2>&1 || true ;;
    powershell.exe) powershell.exe -NoProfile -NonInteractive -Command "Start-Process '$url'" >/dev/null 2>&1 || true ;;
    cmd.exe)       cmd.exe /c start "" "$url" >/dev/null 2>&1 || true ;;
    *) echo "  NO-OPENER: open the link above by hand" ;;
  esac
  printf '  %s\n\n' "$SCAN_READY"
}

# -- Run wizard as a direct background child behind two FIFOs. Open order
# matters: the wizard opens stdin first (blocks till our writer appears),
# then stdout (blocks till our reader appears) -- so open 71 before 70. --
FIFODIR="$(mktemp -d)"; FIFOIN="$FIFODIR/in"; FIFOOUT="$FIFODIR/out"
mkfifo "$FIFOIN" "$FIFOOUT"
bash "$WIZARD" <"$FIFOIN" >"$FIFOOUT" 2>&1 &
WIZPID=$!
exec 71>"$FIFOIN"
exec 70<"$FIFOOUT"
WIZ_OUT=70; WIZ_IN=71
dbg "wizard up: pid=[$WIZPID]"
trap 'kill "$WIZPID" 2>/dev/null || true' EXIT

cleanup() {
  exec 70<&- 71>&- 2>/dev/null || true
  rm -rf "$FIFODIR" || true
}

BUF=""
answer() { dbg "answer [$1]"; printf '%s\n' "$1" >&"$WIZ_IN"; BUF=""; }
scan_urls() {
  while [[ "$BUF" =~ $RE_NPM ]]; do
    dbg "re_npm hit"
    open_once "${BASH_REMATCH[0]}"
    BUF="${BUF/"${BASH_REMATCH[0]}"/}"
  done
  while [[ "$BUF" =~ $RE_OPEN ]]; do
    dbg "re_open hit"
    open_once "${BASH_REMATCH[0]#*opening }"
    BUF="${BUF/"${BASH_REMATCH[0]}"/}"
  done
  if (( ${#BUF} > 8192 )); then BUF="${BUF: -4096}"; fi
}

# EOF detection: an EOF read fails INSTANTLY, while a quiet-but-alive wizard
# makes reads time out (~1s). Three instant failures in a row = dead.
# (A boundary-straddling second can only DELAY the break by one cycle --
# safe direction, never early.)
EOF_STRIKES=0
while true; do
  chunk=""; T0=$SECONDS
  if IFS= read -r -t 1 -d '' -n 2048 chunk <&"$WIZ_OUT"; then
    EOF_STRIKES=0; printf '%s' "$chunk"; BUF+="$chunk"
  else
    if [[ -n "$chunk" ]]; then
      printf '%s' "$chunk"; BUF+="$chunk"; EOF_STRIKES=0
    elif (( SECONDS - T0 < 1 )); then
      EOF_STRIKES=$((EOF_STRIKES + 1)); dbg "eof-strike $EOF_STRIKES"
    else EOF_STRIKES=0; fi
    if (( EOF_STRIKES >= 3 )); then
      while IFS= read -r -t 1 -d '' -n 2048 tailc <&"$WIZ_OUT"; do printf '%s' "$tailc"; BUF+="$tailc"; done || true
      break
    fi
  fi
  scan_urls
  # Gates: a [y/N] must never receive an empty line (empty = default N).
  if [[ "$BUF" == *"[y/N]"* ]]; then answer "y"; continue; fi
  if [[ "$BUF" == *"$PAT_PAUSE"* || "$BUF" == *"Ready to start?"* || "$BUF" == *"$PAT_PASTE"* ]]; then
    answer ""; continue
  fi
  # npm's own post-browser gate ("press ENTER to continue"): same semantics
  # as a pause -- the human finished the browser part, move on. (An empty
  # answer to a code prompt fails safe: the publish simply aborts.)
  if [[ "${BUF,,}" == *"press enter"* ]]; then
    answer ""; continue
  fi
  # Dead/stale registry token: npm publish cannot start a browser flow by
  # itself (it needs a TTY for that). Surface a LOUD pointer instead of
  # failing cryptically: one `npm login` in a real terminal, scan once,
  # token persists in ~/.npmrc, re-run from stage 3.
  if [[ "$BUF" == *"ENEEDAUTH"* || "$BUF" == *"authorize this machine"* ]]; then
    printf '\n  !!! NPM TOKEN DEAD/MISSING -- publish cannot browser-auth from here.\n'
    printf '  Run in a REAL terminal (TTY): npm login --registry https://registry.npmjs.org --auth-type=web\n'
    printf '  Scan once, then re-run: WIZARD_FROM=3 bash scripts/auto-release.sh\n\n'
  fi
done

RC=0; wait "$WIZPID" || RC=$?
dbg "wizard rc=$RC"
cleanup
trap - EXIT
if (( RC == 0 )); then echo "DONE: wizard exit 0"; else echo "FAIL: wizard exit $RC (see above)" >&2; fi
exit "$RC"
