# Converts one .docx to PDF with Microsoft Word (used by pdf.ts). Windows only.
# Opens the document read-only, so the .docx itself is never changed.
param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [Parameter(Mandatory = $true)][string]$Pdf
)
$ErrorActionPreference = 'Stop'
try {
  $word = New-Object -ComObject Word.Application
} catch {
  Write-Error 'WORD_NOT_AVAILABLE'
  exit 3
}
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($Docx, $false, $true, $false)
  $doc.ExportAsFixedFormat($Pdf, 17)   # 17 = wdExportFormatPDF
  $doc.Close(0)
} finally {
  $word.Quit()
}
