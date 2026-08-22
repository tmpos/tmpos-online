$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourceFile = Join-Path $root 'build\LogoTM3.jpeg'
if (-not (Test-Path -LiteralPath $sourceFile)) {
    throw "No se encontro la imagen maestra: $sourceFile"
}

function New-Png([System.Drawing.Image]$source, [int]$size) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.CompositingQuality = 'HighQuality'
        $graphics.InterpolationMode = 'HighQualityBicubic'
        $graphics.SmoothingMode = 'HighQuality'
        $graphics.PixelOffsetMode = 'HighQuality'
        $graphics.DrawImage($source, 0, 0, $size, $size)
        $stream = New-Object System.IO.MemoryStream
        try {
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            return $stream.ToArray()
        } finally { $stream.Dispose() }
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Write-Bytes([string]$path, [byte[]]$bytes) {
    $directory = Split-Path -Parent $path
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    [System.IO.File]::WriteAllBytes($path, $bytes)
}

function Write-Zip([string]$path, [hashtable]$files) {
    Add-Type -AssemblyName System.IO.Compression
    $stream = [IO.File]::Open($path, [IO.FileMode]::Create)
    $archive = New-Object IO.Compression.ZipArchive $stream, 'Create'
    try {
        foreach ($item in $files.GetEnumerator()) {
            $entry = $archive.CreateEntry($item.Key, 'Optimal')
            $entry.LastWriteTime = [DateTimeOffset]::Parse('1980-01-01T00:00:00Z')
            $entryStream = $entry.Open()
            try {
                $bytes = [byte[]]$item.Value
                $entryStream.Write($bytes, 0, $bytes.Length)
            } finally { $entryStream.Dispose() }
        }
    } finally {
        $archive.Dispose()
        $stream.Dispose()
    }
}

function Write-Ico([string]$path, [hashtable]$images) {
    $sizes = @($images.Keys | ForEach-Object { [int]$_ } | Sort-Object)
    $stream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter $stream
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        foreach ($size in $sizes) {
            $bytes = [byte[]]$images[$size]
            $dimension = if ($size -eq 256) { [byte]0 } else { [byte]$size }
            $writer.Write($dimension)
            $writer.Write($dimension)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$bytes.Length)
            $writer.Write([uint32]$offset)
            $offset += $bytes.Length
        }
        foreach ($size in $sizes) { $writer.Write([byte[]]$images[$size]) }
        Write-Bytes $path $stream.ToArray()
    } finally {
        $writer.Dispose()
        $stream.Dispose()
    }
}

function Write-Icns([string]$path, [hashtable]$images) {
    $types = [ordered]@{ 16='icp4'; 32='icp5'; 64='icp6'; 128='ic07'; 256='ic08'; 512='ic09'; 1024='ic10' }
    $chunks = New-Object System.Collections.Generic.List[byte[]]
    $total = 8
    foreach ($item in $types.GetEnumerator()) {
        $payload = [byte[]]$images[[int]$item.Key]
        $chunk = New-Object System.IO.MemoryStream
        try {
            $type = [Text.Encoding]::ASCII.GetBytes($item.Value)
            $chunk.Write($type, 0, 4)
            $length = [BitConverter]::GetBytes([uint32]($payload.Length + 8))
            [Array]::Reverse($length)
            $chunk.Write($length, 0, 4)
            $chunk.Write($payload, 0, $payload.Length)
            $bytes = $chunk.ToArray()
            $chunks.Add($bytes)
            $total += $bytes.Length
        } finally { $chunk.Dispose() }
    }
    $output = New-Object System.IO.MemoryStream
    try {
        $header = [Text.Encoding]::ASCII.GetBytes('icns')
        $output.Write($header, 0, 4)
        $length = [BitConverter]::GetBytes([uint32]$total)
        [Array]::Reverse($length)
        $output.Write($length, 0, 4)
        foreach ($chunk in $chunks) { $output.Write($chunk, 0, $chunk.Length) }
        Write-Bytes $path $output.ToArray()
    } finally { $output.Dispose() }
}

$source = [System.Drawing.Image]::FromFile($sourceFile)
try {
    $sizes = @(16,24,32,48,64,72,96,108,128,144,162,192,216,256,324,432,512,1024)
    $png = @{}
    foreach ($size in $sizes) { $png[$size] = New-Png $source $size }

    Write-Bytes (Join-Path $root 'build\icon.png') $png[512]
    Write-Bytes (Join-Path $root 'build\tmpos-256.png') $png[256]
    Write-Bytes (Join-Path $root 'build\tmpos-256-valid.png') $png[256]

    $ico = @{}
    foreach ($size in @(16,24,32,48,64,128,256)) { $ico[$size] = $png[$size] }
    foreach ($file in @('build\icon.ico','build\tmpos-valid.ico','build\tmpos-windows.ico','src\assets\icon.ico')) {
        Write-Ico (Join-Path $root $file) $ico
    }
    $icoBytes = [IO.File]::ReadAllBytes((Join-Path $root 'build\icon.ico'))
    Write-Zip (Join-Path $root 'build\icon.zip') @{
        'icon.ico'=$icoBytes
        'icon.png'=[byte[]]$png[512]
    }
    Write-Zip (Join-Path $root 'src\assets\icon.zip') @{ 'icon.ico'=$icoBytes }

    $icns = @{}
    foreach ($size in @(16,32,64,128,256,512,1024)) { $icns[$size] = $png[$size] }
    Write-Icns (Join-Path $root 'build\icon.icns') $icns
    Write-Icns (Join-Path $root 'build\icon2.icns') $icns

    $android = [ordered]@{
        'mipmap-mdpi'=@(48,108); 'mipmap-hdpi'=@(72,162)
        'mipmap-xhdpi'=@(96,216); 'mipmap-xxhdpi'=@(144,324)
        'mipmap-xxxhdpi'=@(192,432)
    }
    foreach ($item in $android.GetEnumerator()) {
        $dir = Join-Path $root ('android\app\src\main\res\' + $item.Key)
        Write-Bytes (Join-Path $dir 'ic_launcher.png') $png[$item.Value[0]]
        Write-Bytes (Join-Path $dir 'ic_launcher_round.png') $png[$item.Value[0]]
        Write-Bytes (Join-Path $dir 'ic_launcher_foreground.png') $png[$item.Value[1]]
    }
} finally { $source.Dispose() }

Write-Output 'Iconos regenerados desde build\LogoTM3.jpeg.'
