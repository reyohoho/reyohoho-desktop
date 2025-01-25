#!/usr/bin/env bash
electron-packager ./ "ReYohoho Desktop" --platform=win32 --arch=x64 --out=dist/win --icon=builds/icon.ico --overwrite
#npx electron-builder --win portable
