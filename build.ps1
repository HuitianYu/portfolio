$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$previewHugo = Join-Path $PSScriptRoot '../hugo-runtime/hugo.exe'
if (-not (Test-Path -LiteralPath $previewHugo)) { $previewHugo = 'hugo' }
& $previewHugo --minify
if ($LASTEXITCODE -ne 0) { throw 'Hugo failed. Use Hugo 0.167.0 or newer.' }
