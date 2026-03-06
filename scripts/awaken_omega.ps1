# Miya-Omega Final Awakening Script v4 (THE DEFINITIVE FIX)
# 
# ROOT CAUSE ANALYSIS:
# - "ADAPTER C:\MiyaOmega" → Ollama FINDS the .safetensors but looks for
#   adapter_config.json in the SERVER's working directory (not the adapter folder).
# - "ADAPTER ." → Ollama can't find anything (wrong format).
#
# THE FIX: Restart the server FROM C:\MiyaOmega (so CWD has adapter_config.json)
#          AND use ADAPTER C:\MiyaOmega (so it finds the safetensors via absolute path).

$folderPath = "C:\MiyaOmega"

Write-Host "--- Miya-Omega: DEFINITIVE Awakening (v4) ---" -ForegroundColor Cyan

# 1. Verify Core Files
$coreFiles = @("adapter_model.safetensors", "adapter_config.json", "tokenizer.json")
foreach ($file in $coreFiles) {
    $fp = Join-Path $folderPath $file
    if (-not (Test-Path $fp)) {
        Write-Host "MISSING: $file" -ForegroundColor Red
        exit
    }
    $size = (Get-Item $fp).Length
    Write-Host "  Found: $file ($size bytes)" -ForegroundColor Gray
}

# 2. Create Modelfile with ABSOLUTE FOLDER PATH
$modelfilePath = Join-Path $folderPath "Modelfile"
$lines = @("FROM deepseek-r1:70b", "ADAPTER $folderPath")
$Utf8NoBom = New-Object System.Text.UTF8Encoding $False
[System.IO.File]::WriteAllLines($modelfilePath, $lines, $Utf8NoBom)

Write-Host "  Modelfile content:" -ForegroundColor Gray
Get-Content $modelfilePath | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

# 3. Kill ALL Ollama processes
Write-Host "`nStopping ALL Ollama processes..." -ForegroundColor Yellow
Get-Process -Name "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 3

# 4. Restart Ollama server FROM INSIDE the adapter folder
Write-Host "Starting Ollama server from $folderPath..." -ForegroundColor Yellow
$env:OLLAMA_HOST = "127.0.0.1:11434"
Start-Process -FilePath "ollama" -ArgumentList "serve" -WorkingDirectory $folderPath -WindowStyle Hidden
Start-Sleep 5

# Verify server is running
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:11434" -UseBasicParsing -TimeoutSec 5
    Write-Host "Ollama server is ALIVE." -ForegroundColor Green
} catch {
    Write-Host "WARNING: Server may not be ready yet. Trying anyway..." -ForegroundColor Yellow
}

# 5. Create the model
Write-Host "`n--- INITIATING LOGIC FUSE ---" -ForegroundColor Cyan
Write-Host "Using: ADAPTER $folderPath (absolute folder)" -ForegroundColor Gray
Write-Host "Server CWD: $folderPath (has adapter_config.json)" -ForegroundColor Gray

& ollama create miya-omega -f $modelfilePath 2>&1

Write-Host ""
Write-Host "If you see 'success' above, run: ollama run miya-omega" -ForegroundColor Cyan
Write-Host "If you see an error, copy the EXACT error text and share it." -ForegroundColor Yellow
