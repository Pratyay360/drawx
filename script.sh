#!/bin/bash

set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

yarn version patch --immediate

cd src-tauri

cargo bump patch
