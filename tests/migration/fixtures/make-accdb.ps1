# Test fixture: builds a small Access database shaped like the legacy one.
# Tables and rows go in through .NET OleDb with typed parameters (PowerShell cannot set most DAO
# field values through COM); attachment fields are added afterwards with DAO, which OleDb cannot do.
# The rows come from a UTF-8 JSON file so Sinhala text never passes through this script's own
# encoding (Windows PowerShell 5.1 reads scripts without a BOM as ANSI).
#
# Spec JSON: { "tables": [ { "name", "fields": [ { "name", "type" } ], "rows": [ {...} ] } ] }
#   type: text | long | date (yyyy-MM-dd) | yesno | currency | attachment (value = file path)
# Exit 3 when the Access engine is not installed.
param(
  [Parameter(Mandatory = $true)][string]$SpecFile,
  [Parameter(Mandatory = $true)][string]$Database
)
$ErrorActionPreference = 'Stop'
try { $engine = New-Object -ComObject DAO.DBEngine.120 } catch { exit 3 }

$definition = [System.IO.File]::ReadAllText($SpecFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
if (Test-Path $Database) { Remove-Item $Database -Force }
$engine.CreateDatabase($Database, ';LANGID=0x0409;CP=1252;COUNTRY=0', 128).Close()

$sqlTypes = @{ text = 'TEXT(255)'; long = 'LONG'; date = 'DATETIME'; yesno = 'YESNO'; currency = 'CURRENCY' }
$oleTypes = @{
  text = [System.Data.OleDb.OleDbType]::VarWChar
  long = [System.Data.OleDb.OleDbType]::Integer
  date = [System.Data.OleDb.OleDbType]::Date
  yesno = [System.Data.OleDb.OleDbType]::Boolean
  currency = [System.Data.OleDb.OleDbType]::Currency
}

$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$Database")
$conn.Open()
try {
  foreach ($t in $definition.tables) {
    $plain = @($t.fields | Where-Object { $_.type -ne 'attachment' })
    $cols = ($plain | ForEach-Object { "[$($_.name)] $($sqlTypes[$_.type])" }) -join ', '
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "CREATE TABLE [$($t.name)] ($cols)"
    [void]$cmd.ExecuteNonQuery()

    foreach ($row in $t.rows) {
      $cmd = $conn.CreateCommand()
      $names = ($plain | ForEach-Object { "[$($_.name)]" }) -join ', '
      $marks = ($plain | ForEach-Object { '?' }) -join ', '
      $cmd.CommandText = "INSERT INTO [$($t.name)] ($names) VALUES ($marks)"
      foreach ($f in $plain) {
        $p = $cmd.Parameters.Add("p$($cmd.Parameters.Count)", $oleTypes[$f.type])
        $v = $row.($f.name)
        if ($null -eq $v) { $p.Value = [System.DBNull]::Value }
        elseif ($f.type -eq 'date') { $p.Value = [datetime]::ParseExact($v, 'yyyy-MM-dd', $null) }
        elseif ($f.type -eq 'currency') { $p.Value = [decimal]$v }
        else { $p.Value = $v }
      }
      [void]$cmd.ExecuteNonQuery()
    }
  }
} finally {
  $conn.Close()
}

# Attachments: add the field with DAO, then load each row's file (rows keep insertion order).
$db = $engine.OpenDatabase($Database)
try {
  foreach ($t in $definition.tables) {
    $att = @($t.fields | Where-Object { $_.type -eq 'attachment' })
    if (-not $att.Count) { continue }
    $td = $db.TableDefs.Item($t.name)
    foreach ($f in $att) { $td.Fields.Append($td.CreateField($f.name, 101)) }
    $rs = $db.OpenRecordset($t.name, 2)   # dbOpenDynaset
    foreach ($row in $t.rows) {
      foreach ($f in $att) {
        $path = $row.($f.name)
        if (-not $path) { continue }
        $rs.Edit()
        $child = $rs.Fields.Item($f.name).Value
        $child.AddNew()
        $child.Fields.Item('FileData').LoadFromFile($path)
        $child.Update()
        $child.Close()
        $rs.Update()
      }
      $rs.MoveNext()
    }
    $rs.Close()
  }
} finally {
  $db.Close()
}
exit 0
