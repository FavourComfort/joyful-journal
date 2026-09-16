$ErrorActionPreference = 'SilentlyContinue'
$d = 'c:\Users\USER\Desktop\providers web\joyful-journal'
$silentOut = 'tsc-silent-out.txt'
$silentErr = 'tsc-silent-err.txt'
@"
ROUTE_FILE_TSC_CHECK
===================
timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
npx tsc --noEmit -p tsconfig.json
"@ | Set-Content 'tsc-run-header.txt' -Encoding UTF8

Write-Host "Running tsc on $d"
Push-Location $d
$cmd = "node_modules\.bin\tsc --noEmit -p tsconfig.json"
Write-Host "Command: $cmd"
Invoke-Expression $cmd 2> $silentErr | Set-Content $silentOut -Encoding UTF8
$exit = $LASTEXITCODE
Pop-Location

Write-Host "TSC exit code: $exit"

if ($exit -ne 0 -and (Test-Path $silentErr)) {
    Write-Host "=== ERR (first 120 lines) ==="
    Get-Content $silentErr | Select-Object -First 120 | Out-String -Width 3000 | Write-Host
} elseif (Test-Path $silentErr) {
    $errLines = (Get-Content $silentErr | Measure-Object -Line).Lines
    if ($errLines -gt 0) {
        Write-Host "=== ERR (non-empty, $errLines lines) ==="
        Get-Content $silentErr | Select-Object -First 120 | Out-String -Width 3000 | Write-Host
    } else {
        Write-Host "TSC_OK (empty error file, exit $exit)"
    }
} else {
    Write-Host "TSC_OK (no error file, exit $exit)"
}
