Write-Host "parando y levantando todo nativo..." -Foreground Cyan
# 1 parar
foreach ($port in 5000,5001,8080,3000) {
  $con = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($con) { Stop-Process -Id $con[0].OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep 2
# 2 test
8080 | ForEach-Object { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('127.0.0.1',$_) } 2>$null;
