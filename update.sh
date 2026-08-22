#!/usr/bin/env bash
# squad-signup 更新入口：更新服务器上所有战队网站到同一版本。
# 实际逻辑在 install.sh 的 --update-all 中，本脚本只负责取最新 install.sh 并执行。
set -euo pipefail

REPO="yoorme/squad-signup"
BRANCH="${BRANCH:-main}"

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  INSTALL_DIR="${INSTALL_DIR:-/opt/squad-signup}"
else
  INSTALL_DIR="${INSTALL_DIR:-$HOME/squad-signup}"
fi

if [[ -f "$INSTALL_DIR/install.sh" ]]; then
  exec bash "$INSTALL_DIR/install.sh" --update-all
fi

TMP_INSTALL=$(mktemp)
trap 'rm -f "$TMP_INSTALL"' EXIT
curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/install.sh" -o "$TMP_INSTALL"
exec bash "$TMP_INSTALL" --update-all
