$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
npm run sync:shared
if ($LASTEXITCODE -ne 0) { throw 'Shared UI build failed.' }
npm run check
if ($LASTEXITCODE -ne 0) { throw 'Source checks failed.' }
$previewHugo = Join-Path $PSScriptRoot '../hugo-runtime/hugo.exe'
if (-not (Test-Path -LiteralPath $previewHugo)) { $previewHugo = 'hugo' }
& $previewHugo --minify
if ($LASTEXITCODE -ne 0) { throw 'Hugo failed. Use Hugo 0.167.0 or newer.' }
