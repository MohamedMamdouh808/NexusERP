Get-ChildItem backend/src/modules/auth/__tests__/*.spec.ts | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $content = $content -replace "app\.inject\(\)\.post\(", "request(app.getHttpServer()).post(")
    $content = $content -replace "app\.inject\(\)\.get\(", "request(app.getHttpServer()).get(")
    Set-Content $_.FullName $content
}
Write-Host "Done fixing imports"
