$package = Get-Content -Raw -Path "package.json" | ConvertFrom-Json
$version = [string]$package.version
$tag = "v$version"
$file = "dist-electron/TMPOS.Setup.$version.exe"

if (-not (Test-Path -LiteralPath $file)) {
  throw "No existe el instalador $file. Ejecuta npm run electron:build primero."
}

gh release view $tag --repo tmpos/tmpos-online *> $null
if ($LASTEXITCODE -ne 0) {
  gh release create $tag $file --repo tmpos/tmpos-online --title "TMPOS $version" --generate-notes --latest
} else {
  gh release upload $tag $file --repo tmpos/tmpos-online --clobber
}
