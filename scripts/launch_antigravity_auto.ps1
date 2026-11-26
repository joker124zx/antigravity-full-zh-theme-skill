param([switch]$CheckNetwork)

$AntigravityExe = "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"
$ProxyUrl = if ($env:ANTIGRAVITY_PROXY_URL) { $env:ANTIGRAVITY_PROXY_URL } else { 'http://127.0.0.1:7890' }
$Bypass = 'localhost,127.0.0.1,::1,.local'

if ($CheckNetwork) {
    if ($ProxyUrl) {
        & curl.exe --proxy $ProxyUrl --connect-timeout 6 --max-time 15 -sS -o NUL -w "HTTP=%{http_code} EXIT=%{exitcode}`n" https://oauth2.googleapis.com/token
    } else {
        & curl.exe --noproxy '*' --connect-timeout 6 --max-time 15 -sS -o NUL -w "HTTP=%{http_code} EXIT=%{exitcode}`n" https://oauth2.googleapis.com/token
    }
    exit $LASTEXITCODE
}

# Auto-detect whether local proxy (default 127.0.0.1:7890) is listening so Antigravity always launches cleanly
$ProxyAlive = $false
try {
    $uri = [System.Uri]$ProxyUrl
    $tcp = New-Object System.Net.Sockets.TcpClient
    $ar = $tcp.BeginConnect($uri.Host, $uri.Port, $null, $null)
    if ($ar.AsyncWaitHandle.WaitOne(350, $false) -and $tcp.Connected) {
        $ProxyAlive = $true
    }
    $tcp.Close()
} catch {}

if ($ProxyAlive) {
    $env:HTTP_PROXY = $ProxyUrl
    $env:HTTPS_PROXY = $ProxyUrl
    $env:ALL_PROXY = $ProxyUrl
    $env:http_proxy = $ProxyUrl
    $env:https_proxy = $ProxyUrl
    $env:all_proxy = $ProxyUrl
    $env:NO_PROXY = $Bypass
    $env:no_proxy = $Bypass

    Start-Process -FilePath $AntigravityExe -ArgumentList @(
        '--remote-debugging-port=0'
        "--proxy-server=$ProxyUrl"
        '--proxy-bypass-list=localhost;127.0.0.1;[::1];*.local'
    )
} else {
    Start-Process -FilePath $AntigravityExe -ArgumentList @(
        '--remote-debugging-port=0'
    )
}
