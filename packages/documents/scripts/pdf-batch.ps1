# Converts many .docx files to PDF in one Word session (used by review-pack.ts). Windows + Word.
# ListFile: JSON array of { docx, pdf }. Documents are opened read-only.
param([Parameter(Mandatory = $true)][string]$ListFile)

$ErrorActionPreference = 'Stop'
$items = Get-Content -Raw -Encoding UTF8 $ListFile | ConvertFrom-Json
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  foreach ($item in $items) {
    try {
      $doc = $word.Documents.Open([string]$item.docx, $false, $true, $false)
      $doc.ExportAsFixedFormat([string]$item.pdf, 17)
      $doc.Close(0)
      Write-Output "ok   $($item.docx)"
    } catch {
      Write-Output "FAIL $($item.docx): $($_.Exception.Message)"
      while ($word.Documents.Count -gt 0) { $word.Documents.Item(1).Close(0) }
    }
  }
} finally {
  $word.Quit()
}
