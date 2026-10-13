$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$previewHugo = Join-Path $PSScriptRoot '../hugo-runtime/hugo.exe'
if (-not (Test-Path -LiteralPath $previewHugo)) { $previewHugo = 'hugo' }
& $previewHugo server --bind 127.0.0.1 --port 1313 --disableFastRender --disableLiveReload --cleanDestinationDir=false
if ($LASTEXITCODE -ne 0) { throw 'Hugo failed. Use Hugo 0.167.0 or newer.' }
