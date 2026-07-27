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

    & npm.cmd run dev -- --port 5173 --strictPort
    if ($LASTEXITCODE -ne 0) {
        throw "开发服务器异常退出，npm 退出代码：$LASTEXITCODE"
    }
} finally {
    Pop-Location
}
