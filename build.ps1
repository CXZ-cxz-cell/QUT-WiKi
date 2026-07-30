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

    # 清理占用 5173 端口的旧进程
    $pid5173 = (netstat -ano | Select-String ':5173' | Select-String 'LISTENING').ToString().Trim() -split '\s+' | Select-Object -Last 1
    if ($pid5173) {
        Stop-Process -Id $pid5173 -Force -ErrorAction SilentlyContinue
        Start-Sleep 1
    }

    & npm.cmd run dev -- --port 5173 --strictPort
    if ($LASTEXITCODE -ne 0) {
        throw "开发服务器异常退出，npm 退出代码：$LASTEXITCODE"
    }
} finally {
    Pop-Location
}
