param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$workspace = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $workspace 'assets'
$buildDir = Join-Path $workspace 'build'
$pngPath = Join-Path $assetsDir 'app-icon.png'
$icoPath = Join-Path $buildDir 'icon.ico'

New-Item -ItemType Directory -Force -Path $assetsDir, $buildDir | Out-Null

function New-ResizedPngBytes {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($Image, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))

    $stream = [System.IO.MemoryStream]::new()
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      return $stream.ToArray()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function New-RoundedRectanglePath {
  param(
    [System.Drawing.RectangleF]$Bounds,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $arc = [System.Drawing.RectangleF]::new($Bounds.X, $Bounds.Y, $diameter, $diameter)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($arc, 180, 90)
  $arc.X = $Bounds.Right - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $Bounds.Bottom - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = $Bounds.X
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()
  return $path
}

$source = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $SourcePath))
try {
  $master = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($master)
  $clipPath = New-RoundedRectanglePath -Bounds ([System.Drawing.RectangleF]::new(28, 34, 968, 956)) -Radius 190
  $backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#FAF9F6'))
  $imageAttributes = [System.Drawing.Imaging.ImageAttributes]::new()
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.FillPath($backgroundBrush, $clipPath)

    # Keep the selected sprout/orbit artwork while removing the generated tile
    # background and all fringe artifacts. The clean rounded tile above becomes
    # the only background layer.
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.SetClip([System.Drawing.Rectangle]::new(110, 145, 804, 730))
    $imageAttributes.SetColorKey(
      [System.Drawing.Color]::FromArgb(230, 230, 225),
      [System.Drawing.Color]::FromArgb(255, 255, 255)
    )
    $graphics.DrawImage(
      $source,
      [System.Drawing.Rectangle]::new(0, 0, 1024, 1024),
      0,
      0,
      $source.Width,
      $source.Height,
      [System.Drawing.GraphicsUnit]::Pixel,
      $imageAttributes
    )
  } finally {
    $imageAttributes.Dispose()
    $backgroundBrush.Dispose()
    $clipPath.Dispose()
    $graphics.Dispose()
  }

  [System.IO.File]::WriteAllBytes($pngPath, (New-ResizedPngBytes -Image $master -Size 1024))

  $sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
  $images = foreach ($size in $sizes) {
    [pscustomobject]@{
      Size = $size
      Bytes = New-ResizedPngBytes -Image $master -Size $size
    }
  }

  $file = [System.IO.File]::Create($icoPath)
  $writer = [System.IO.BinaryWriter]::new($file)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)

    $offset = 6 + (16 * $images.Count)
    foreach ($image in $images) {
      $dimension = if ($image.Size -eq 256) { 0 } else { $image.Size }
      $writer.Write([byte]$dimension)
      $writer.Write([byte]$dimension)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$image.Bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $image.Bytes.Length
    }

    foreach ($image in $images) {
      $writer.Write([byte[]]$image.Bytes)
    }
  } finally {
    $writer.Dispose()
    $file.Dispose()
  }
  $master.Dispose()
} finally {
  $source.Dispose()
}

Write-Output "Generated $pngPath"
Write-Output "Generated $icoPath"
