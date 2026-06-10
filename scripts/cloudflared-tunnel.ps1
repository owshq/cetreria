# Tunel publico gratis via trycloudflare.com (requiere npm run dev activo).
$port = if ($env:CRM_TUNNEL_PORT) { $env:CRM_TUNNEL_PORT } else { "3000" }
$url = "http://localhost:$port"
# http2 evita reintentos QUIC ("control stream encountered a failure") en Windows/red movil.
# Override: CRM_TUNNEL_PROTOCOL=quic
$protocol = if ($env:CRM_TUNNEL_PROTOCOL) { $env:CRM_TUNNEL_PROTOCOL } else { "http2" }

$portOpen = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue |
  Select-Object -ExpandProperty TcpTestSucceeded
if (-not $portOpen) {
  Write-Error "Nada escuchando en localhost:$port. Arranca antes: npm run dev"
  exit 1
}

$candidates = @(
  (Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe",
  "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
  "$env:ProgramFiles\cloudflared\cloudflared.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique -First 1

if (-not $candidates) {
  $found = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "cloudflared.exe" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
  if ($found) { $candidates = $found }
}

if (-not $candidates) {
  Write-Error "cloudflared no encontrado. Instala con: winget install Cloudflare.cloudflared"
  exit 1
}

Write-Host "Usando: $candidates"
Write-Host "Tunel hacia $url (protocolo: $protocol, Ctrl+C para cerrar)"
& $candidates tunnel --protocol $protocol --url $url
