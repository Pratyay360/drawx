#!/bin/bash

set -euo pipefail

bun pm version patch

cd src-tauri

cargo bump patch
