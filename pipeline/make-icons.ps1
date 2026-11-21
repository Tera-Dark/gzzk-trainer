# Generate PWA icons with the system GDI+ (no extra tools required)
# Usage: powershell -ExecutionPolicy Bypass -File pipeline/make-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'app\public'

function New-Icon([int]$size, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(23, 163, 74))

  $s = $size / 192.0
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

  $g.FillRectangle($white, [single](50 * $s), [single](58 * $s), [single](92 * $s), [single](14 * $s))
  $g.FillRectangle($white, [single](50 * $s), [single](92 * $s), [single](92 * $s), [single](14 * $s))
  $g.FillRectangle($white, [single](50 * $s), [single](126 * $s), [single](52 * $s), [single](14 * $s))

  $g.FillEllipse($white, [single](122 * $s), [single](112 * $s), [single](38 * $s), [single](38 * $s))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(23, 163, 74)), ([single](7 * $s))
  $pen.StartCap = 'Round'
  $pen.EndCap = 'Round'
  $pen.LineJoin = 'Round'
  $pts = @(
    (New-Object System.Drawing.PointF ([single](131 * $s), [single](131 * $s))),
    (New-Object System.Drawing.PointF ([single](138 * $s), [single](138 * $s))),
    (New-Object System.Drawing.PointF ([single](151 * $s), [single](124 * $s)))
  )
  $g.DrawLines($pen, $pts)

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host ("  {0}  ({1} x {1})" -f $file, $size)
}

Write-Host "Generating icons into app/public ..."
New-Icon 192 'icon-192.png'
New-Icon 512 'icon-512.png'
New-Icon 180 'apple-touch-icon.png'
Write-Host "Done."
