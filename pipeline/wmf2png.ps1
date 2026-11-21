# Convert WMF/EMF metafiles to PNG using GDI+ (built into Windows, no install needed).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File wmf2png.ps1 -Dir <ascii_dir> [-Scale 2]
param(
  [Parameter(Mandatory=$true)][string]$Dir,
  [double]$Scale = 2.0
)
Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem -Path $Dir -File | Where-Object { $_.Extension -match '^\.(wmf|emf)$' }
foreach ($f in $files) {
  try {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $w = [int][Math]::Ceiling($img.Width * $Scale)
    $h = [int][Math]::Ceiling($img.Height * $Scale)
    if ($w -lt 1) { $w = 1 }
    if ($h -lt 1) { $h = 1 }
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $w, $h)
    $out = [System.IO.Path]::ChangeExtension($f.FullName, '.png')
    if (Test-Path $out) { Remove-Item $out -Force }
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
    Remove-Item $f.FullName -Force
    Write-Output "ok $($f.Name)"
  } catch {
    Write-Output "fail $($f.Name) $($_.Exception.Message)"
  }
}
