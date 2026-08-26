$ErrorActionPreference = 'Stop'

trap {
    [Console]::Error.WriteLine("构建脚本执行失败：$($_.Exception.Message)")
    exit 1
}

Push-Location $PSScriptRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw "站点构建失败，npm 退出代码：$LASTEXITCODE"
    }

    # 清理占用 4173 端口的旧进程
    $portLine = netstat -ano | Select-String ':4173' | Select-String 'LISTENING' | Select-Object -First 1
    if ($portLine) {
        $pid4173 = ($portLine.ToString().Trim() -split '\s+')[-1]
        if ($pid4173) {
            Stop-Process -Id $pid4173 -Force -ErrorAction SilentlyContinue
            Start-Sleep 1
        }
    }

    & npm.cmd run dev -- --port 4173 --strictPort
    if ($LASTEXITCODE -ne 0) {
        throw "开发服务器异常退出，npm 退出代码：$LASTEXITCODE"
    }
} finally {
    Pop-Location
}
