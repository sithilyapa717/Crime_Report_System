# Runs Word's own mail merge for each job in a JSON file (used by compare-with-word.ts).
# Windows only, needs Microsoft Word. Each job: { template, dataSource, values: [{name, value}], out }.
#   template    a copy of the original with the Access link removed (merge fields intact)
#   dataSource  where to save a one-record Word table holding the values
#   out         where to save Word's merged result (.docx)
param([Parameter(Mandatory = $true)][string]$JobsFile)

$ErrorActionPreference = 'Stop'
$jobs = Get-Content -Raw -Encoding UTF8 $JobsFile | ConvertFrom-Json
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  foreach ($job in $jobs) {
    try {
      $values = @($job.values)
      # one-record data source: header row of field names, one row of values
      $ds = $word.Documents.Add()
      $table = $ds.Tables.Add($ds.Range(), 2, [Math]::Max(1, $values.Count))
      for ($i = 0; $i -lt $values.Count; $i++) {
        $table.Cell(1, $i + 1).Range.Text = [string]$values[$i].name
        $table.Cell(2, $i + 1).Range.Text = [string]$values[$i].value
      }
      $ds.SaveAs2([string]$job.dataSource, 16)
      $ds.Close(0)

      $doc = $word.Documents.Open([string]$job.template, $false, $true, $false)
      $doc.MailMerge.MainDocumentType = 0          # form letters
      $doc.MailMerge.OpenDataSource([string]$job.dataSource, 0, $false, $true, $false, $false)
      $doc.MailMerge.Destination = 0               # new document
      $doc.MailMerge.SuppressBlankLines = $false
      $doc.MailMerge.Execute($false)
      $result = $word.ActiveDocument
      $result.SaveAs2([string]$job.out, 16)
      $result.Close(0)
      $doc.Close(0)
      Write-Output "ok   $($job.template)"
    } catch {
      Write-Output "FAIL $($job.template): $($_.Exception.Message)"
      while ($word.Documents.Count -gt 0) { $word.Documents.Item(1).Close(0) }
    }
  }
} finally {
  $word.Quit()
}
