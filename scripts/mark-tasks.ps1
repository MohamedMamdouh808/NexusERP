param(
  [Parameter(Mandatory = $true)][string[]]$Ids
)

$path = 'specs\011-purchasing-end-to-end\tasks.md'
$lines = Get-Content $path -Encoding UTF8
$marked = 0

for ($i = 0; $i -lt $lines.Count; $i++) {
  foreach ($id in $Ids) {
    if ($lines[$i] -match "^- \[ \] $([regex]::Escape($id))\b") {
      $lines[$i] = $lines[$i] -replace '^- \[ \]', '- [X]'
      $marked++
    }
  }
}

Set-Content -Path $path -Value $lines -Encoding UTF8
"marked $marked task(s): $($Ids -join ', ')"
