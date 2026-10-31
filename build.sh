#!/bin/sh
# Minify the shared scripts served from the apex: js/src/<name>.js (readable
# source) -> js/<name>.js (the URL pages load). Sources are copies of the ones
# in cdn-sankhacooray-com (edit there first); with the same pinned esbuild the
# outputs must be byte-identical to cdn's js/<name>.js.
set -e
cd "$(dirname "$0")"
for name in sankha-analytics sankha-weather; do
  npx -y esbuild@0.24.0 "js/src/$name.js" --minify --target=es2017 --charset=utf8 --log-level=warning \
    --banner:js="/* $name.js — minified build; source: js/src/$name.js (edit there, then run ./build.sh) */" \
    --outfile="js/$name.js"
  node --check "js/$name.js"
done
ls -l js/*.js
