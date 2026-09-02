$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectPath
& node (Join-Path $projectPath 'src\connector.js')
exit $LASTEXITCODE
