# Reads every user table of an Access database (.accdb / .mdb) with DAO, read-only, and writes
# data.json plus attachment files into OutDir. Needs the Microsoft Access Database Engine (ACE),
# 64-bit to match 64-bit PowerShell. Run it on a copy: the importer copies the file first.
#
# Output (UTF-8): { "tables": { "<name>": { "columns": [{ "name", "type" }], "rows": [ {...} ] } },
#                   "attachments": [ { "table", "row", "field", "fileName", "path" } ] }
# Dates are written as "yyyy-MM-ddTHH:mm:ss" (no time zone; Access has none).
#
# Exit codes: 0 ok, 3 Access engine not installed, 1 anything else (message on stderr).
param(
  [Parameter(Mandatory = $true)][string]$Database,
  [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = 'Stop'

try {
  $engine = New-Object -ComObject DAO.DBEngine.120
} catch {
  [Console]::Error.WriteLine('ACCESS_ENGINE_NOT_AVAILABLE')
  exit 3
}

# DAO field types
$dbDate = 8; $dbLongBinary = 11; $dbAttachment = 101
$multiValued = 102..109

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$db = $engine.OpenDatabase($Database, $false, $true)   # not exclusive, read-only
$tables = [ordered]@{}
$attachments = New-Object System.Collections.ArrayList
$tableNo = 0

function Convert-Value($field) {
  $v = $field.Value
  if ($null -eq $v -or $v -is [System.DBNull]) { return $null }
  if ($field.Type -eq $dbDate) { return ([datetime]$v).ToString('yyyy-MM-ddTHH:mm:ss') }
  if ($field.Type -eq $dbLongBinary) { return '[binary]' }
  if ($v -is [decimal]) { return [double]$v }
  return $v
}

try {
  foreach ($td in $db.TableDefs) {
    $name = $td.Name
    # System (MSys*), temporary (~*) and linked tables are skipped.
    if ($name -like 'MSys*' -or $name -like '~*' -or $td.Connect) { continue }
    $tableNo++
    $columns = New-Object System.Collections.ArrayList
    foreach ($f in $td.Fields) { [void]$columns.Add([ordered]@{ name = $f.Name; type = [int]$f.Type }) }

    $rows = New-Object System.Collections.ArrayList
    $rs = $db.OpenRecordset($name, 4)   # dbOpenSnapshot
    $rowNo = 0
    while (-not $rs.EOF) {
      $row = [ordered]@{}
      foreach ($f in $rs.Fields) {
        if ($f.Type -eq $dbAttachment) {
          $files = New-Object System.Collections.ArrayList
          $child = $f.Value
          $n = 0
          while (-not $child.EOF) {
            $n++
            $fileName = [string]$child.Fields.Item('FileName').Value
            $safe = ($fileName -replace '[^\w.\-]', '_')
            $path = Join-Path $OutDir ("att-{0}-{1}-{2}-{3}" -f $tableNo, $rowNo, $n, $safe)
            $child.Fields.Item('FileData').SaveToFile($path)
            [void]$attachments.Add([ordered]@{ table = $name; row = $rowNo; field = $f.Name; fileName = $fileName; path = $path })
            [void]$files.Add($fileName)
            $child.MoveNext()
          }
          $child.Close()
          $row[$f.Name] = if ($files.Count) { $files -join '; ' } else { $null }
        } elseif ($multiValued -contains $f.Type) {
          $values = New-Object System.Collections.ArrayList
          $child = $f.Value
          while (-not $child.EOF) { [void]$values.Add([string]$child.Fields.Item(0).Value); $child.MoveNext() }
          $child.Close()
          $row[$f.Name] = if ($values.Count) { $values -join '; ' } else { $null }
        } else {
          $row[$f.Name] = Convert-Value $f
        }
      }
      [void]$rows.Add($row)
      $rowNo++
      $rs.MoveNext()
    }
    $rs.Close()
    $tables[$name] = [ordered]@{ columns = $columns; rows = $rows }
  }
} finally {
  $db.Close()
}

$json = [ordered]@{ tables = $tables; attachments = $attachments } | ConvertTo-Json -Depth 8 -Compress
[System.IO.File]::WriteAllText((Join-Path $OutDir 'data.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
exit 0
