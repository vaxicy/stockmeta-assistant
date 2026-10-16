# download-qwen-local.ps1
# 用途：把本地视觉模型 qwen2.5vl:7b 的权重文件下载完整。
# 为什么需要它：Ollama 自带的下载器在这个网络下会在中途断流，而且断流后不会续传，
#              文件看起来「已满大小」其实是空壳，导致校验永远失败、模型一直装不上。
# 本脚本：curl 断点续传（-C -）+ 断流自动重连 + 下完自动校验 SHA256，校验通过才算成功。
#
# 用法（任选其一）：
#   1) 在文件上右键 →「使用 PowerShell 运行」
#   2) powershell -ExecutionPolicy Bypass -File scripts\download-qwen-local.ps1
# 想关掉窗口就停？直接关掉窗口即可，下次再运行会从断点继续，不会重下。

$ErrorActionPreference = 'Continue'

# ------------------------- 配置 -------------------------
$UseProxy    = $true                        # 直连不稳就保持 true；如果你把加速器关了，改成 $false
$Proxy       = 'http://127.0.0.1:7897'      # 系统代理地址（Windows 设置 → 网络和 Internet → 代理）
$ModelsDir   = 'D:\OllamaModels'            # Ollama 的模型目录（OLLAMA_MODELS 指向这里）
$Digest      = 'a99b7f834d754b88f122d865f32758ba9f0994a83f8363df2c1e71c17605a025'
$TargetBytes = 5969233408                   # 5692.7 MiB；下面会再跟 manifest 核对一次，避免数字写少导致「下满却校验失败」
$MaxHours    = 6                            # 最多折腾这么久就停
# --------------------------------------------------------

$Url  = "https://registry.ollama.ai/v2/library/qwen2.5vl/blobs/sha256:$Digest"
$Dest = Join-Path $ModelsDir "blobs\sha256-$Digest"

# 从官方 manifest 再核对一次真实大小（拿不到就用上面的硬编码值）
try {
    $mf = Invoke-RestMethod -Uri 'https://registry.ollama.ai/v2/library/qwen2.5vl/manifests/7b' -TimeoutSec 20
    $sz = ($mf.layers | Where-Object { $_.digest -eq "sha256:$Digest" }).size
    if ($sz) { $TargetBytes = [int64]$sz }
} catch { }

New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null

$curlArgs = @('-L', '-s', '-S')
if ($UseProxy) { $curlArgs += @('--proxy', $Proxy) }
$curlArgs += @('-C', '-',
               '--speed-time', '30', '--speed-limit', '4096',   # 速度低于 4KB/s 持续 30 秒 → 判定断流并重连
               '--retry', '5', '--retry-all-errors', '--retry-delay', '2',
               '-o', $Dest, $Url)

$deadline = (Get-Date).AddHours($MaxHours)
$lastSize = 0

while ((Get-Date) -lt $deadline) {
    $have = if (Test-Path $Dest) { (Get-Item $Dest).Length } else { 0 }
    if ($have -ge $TargetBytes) { break }

    $pct  = [math]::Round($have / $TargetBytes * 100, 1)
    Write-Host ("[{0}] 已下载 {1:N1} MB / 5692.7 MB ({2}%)，继续…" -f (Get-Date -Format 'HH:mm:ss'), ($have / 1MB), $pct)

    $t0 = Get-Date
    & curl.exe @curlArgs
    $t1 = Get-Date

    $now = if (Test-Path $Dest) { (Get-Item $Dest).Length } else { 0 }
    $got = ($now - $have) / 1MB
    $spd = if (($t1 - $t0).TotalSeconds -gt 0) { $got / ($t1 - $t0).TotalSeconds } else { 0 }
    Write-Host ("          这一轮 +{0:N1} MB，平均 {1:N2} MB/s" -f $got, $spd)

    if ($now -le $lastSize) { Start-Sleep -Seconds 5 }   # 完全没进展 → 歇一下再重连
    $lastSize = $now
}

$final = if (Test-Path $Dest) { (Get-Item $Dest).Length } else { 0 }
if ($final -lt $TargetBytes) {
    Write-Host ""
    Write-Host ("未下完：{0:N1} MB / 5692.7 MB。再运行一次本脚本会接着下（已经下的不会重来）。" -f ($final / 1MB)) -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "下载完成，正在校验哈希（约 1 分钟）…"
$hash = (Get-FileHash -Path $Dest -Algorithm SHA256).Hash.ToLower()
if ($hash -ne $Digest) {
    Write-Host "校验失败：文件损坏，请删除下面这个文件后重新运行本脚本：" -ForegroundColor Red
    Write-Host "  $Dest"
    exit 1
}

Write-Host "校验通过 ✅  qwen2.5vl:7b 已就绪。" -ForegroundColor Green
Write-Host ""
Write-Host "接下来："
Write-Host "  1) 运行  ollama list   应能看到 qwen2.5vl:7b"
Write-Host "  2) 扩展设置里填："
Write-Host "       提供商     = 自定义（OpenAI 兼容）"
Write-Host "       Base URL   = http://localhost:11434/v1"
Write-Host "       视觉模型 ID = qwen2.5vl:7b"
Write-Host "       API Key    = local   （本地服务不校验，但留空会被扩展拒绝）"
