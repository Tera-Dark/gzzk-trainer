# Generate Android launcher icons + splash screens for the Capacitor shell
# Usage: powershell -ExecutionPolicy Bypass -File pipeline/make-android-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root 'app\android\app\src\main\res'
if (-not (Test-Path $res)) { Write-Host "android res not found: $res"; exit 1 }

$green = [System.Drawing.Color]::FromArgb(23, 163, 74)
$bg = [System.Drawing.Color]::FromArgb(247, 247, 245)

function New-Canvas([int]$size, [bool]$transparent) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  if ($transparent) { $g.Clear([System.Drawing.Color]::Transparent) } else { $g.Clear($green) }
  return @($bmp, $g)
}

function Add-Glyph($g, [single]$cx, [single]$cy, [single]$s, $penColor, $barColor) {
  # three text lines
  $b = New-Object System.Drawing.SolidBrush $barColor
  $barH = 14 * $s
  $left = $cx - 46 * $s
  $g.FillRectangle($b, $left, $cy - 34 * $s, 92 * $s, $barH)
  $g.FillRectangle($b, $left, $cy, 92 * $s, $barH)
  $g.FillRectangle($b, $left, $cy + 34 * $s, 52 * $s, $barH)
  # check badge
  $r = 19 * $s
  $g.FillEllipse($b, $cx + 44 * $s - $r, $cy + 34 * $s - $r, 2 * $r, 2 * $r)
  $pen = New-Object System.Drawing.Pen $penColor, ([single](7 * $s))
  $pen.StartCap = 'Round'
  $pen.EndCap = 'Round'
  $pen.LineJoin = 'Round'
  $p1 = [System.Drawing.PointF]::new([single]($cx + 35 * $s), [single]($cy + 34 * $s))
  $p2 = [System.Drawing.PointF]::new([single]($cx + 42 * $s), [single]($cy + 41 * $s))
  $p3 = [System.Drawing.PointF]::new([single]($cx + 55 * $s), [single]($cy + 26 * $s))
  $g.DrawLines($pen, @($p1, $p2, $p3))
  $pen.Dispose()
  $b.Dispose()
}

function Save-Png($bmp, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# ---- legacy / round launcher icons ----
$densities = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($k in $densities.Keys) {
  $size = $densities[$k]
  $dir = Join-Path $res "mipmap-$k"

  # square icon with rounded corners
  $pair = New-Canvas $size $true
  $bmp = $pair[0]; $g = $pair[1]
  $radius = $size * 0.22
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($size - $d, 0, $d, $d, 270, 90)
  $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $path.AddArc(0, $size - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $green), $path)
  Add-Glyph $g ($size / 2) ($size / 2) ($size / 192.0) $green ([System.Drawing.Color]::White)
  $g.Dispose()
  Save-Png $bmp (Join-Path $dir 'ic_launcher.png')

  # round icon
  $pair = New-Canvas $size $true
  $bmp = $pair[0]; $g = $pair[1]
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $green), 0, 0, $size, $size)
  Add-Glyph $g ($size / 2) ($size / 2) ($size / 192.0) $green ([System.Drawing.Color]::White)
  $g.Dispose()
  Save-Png $bmp (Join-Path $dir 'ic_launcher_round.png')

  # adaptive foreground (transparent, glyph inside safe zone)
  $fgSize = [int]($size * 2.25)
  $pair = New-Canvas $fgSize $true
  $bmp = $pair[0]; $g = $pair[1]
  Add-Glyph $g ($fgSize / 2) ($fgSize / 2) ($fgSize / 260.0) $green ([System.Drawing.Color]::White)
  $g.Dispose()
  Save-Png $bmp (Join-Path $dir 'ic_launcher_foreground.png')
}

Write-Host "launcher icons done"

# ---- splash screens: replace Capacitor logo with brand background ----
$splashDirs = Get-ChildItem $res -Directory -Filter 'drawable*'
foreach ($dir in $splashDirs) {
  foreach ($f in Get-ChildItem $dir.FullName -Filter 'splash.png' -ErrorAction SilentlyContinue) {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $w = $img.Width; $h = $img.Height
    $img.Dispose()
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear($bg)
    $g.Dispose()
    Save-Png $bmp $f.FullName
  }
}
Write-Host "splash screens done"
