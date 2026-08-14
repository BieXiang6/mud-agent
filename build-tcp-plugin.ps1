$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $root 'nativeplugins\MudAgent-TCP\src\main\java\com\mudagent\tcp\MudTcpModule.java'
$stubRoot = Join-Path $root 'nativeplugins\MudAgent-TCP\stubs'
$classes = Join-Path $root 'build\tcp-plugin-classes'
$jar = Join-Path $root 'nativeplugins\MudAgent-TCP\android\libs\mudagent-tcp.jar'

Remove-Item -LiteralPath $classes -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $classes | Out-Null

$stubs = Get-ChildItem -LiteralPath $stubRoot -Recurse -Filter *.java | Select-Object -ExpandProperty FullName
& javac -encoding UTF-8 -source 8 -target 8 -d $classes $stubs $source
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Remove-Item -LiteralPath $jar -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $jar) | Out-Null
& jar cf $jar -C $classes com/mudagent/tcp
if ($LASTEXITCODE -ne 0) { throw "jar failed" }

Write-Host "Built $jar"
