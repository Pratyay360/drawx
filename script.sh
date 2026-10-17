#!/bin/bash

set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

bun pm version patch

cd src-tauri

cargo bump patch
