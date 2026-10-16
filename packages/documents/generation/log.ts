// Generation log (D6): who generated which document from which template for which CR, and when.
// A's `generated_documents` table implements GenerationLog later; until then entries can live
// in memory (tests) or in a JSON-lines file.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface GenerationLogEntry {
  id: string;
  crimeReportId: string;
  crNumber: string;
  templateId: string;
  /** SHA-256 of the template file used, so a later template change is visible. */
  templateSha256: string;
  fileName: string;
  filePath: string;
  /** SHA-256 of the generated .docx. */
  sha256: string;
  generatedBy: string;
  generatedAt: string; // ISO timestamp
  /** Canonical fields the template uses that had no value (left empty in the document). */
  emptyFields: string[];
  pdfPath?: string;
}

export interface GenerationLog {
  append(entry: GenerationLogEntry): Promise<void>;
  forCrimeReport(crimeReportId: string): Promise<GenerationLogEntry[]>;
}

export class InMemoryGenerationLog implements GenerationLog {
  readonly entries: GenerationLogEntry[] = [];

  async append(entry: GenerationLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async forCrimeReport(crimeReportId: string): Promise<GenerationLogEntry[]> {
    return this.entries.filter((e) => e.crimeReportId === crimeReportId);
  }
}

/** One JSON object per line; append-only, so earlier entries are never rewritten. */
export class JsonLinesGenerationLog implements GenerationLog {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  async append(entry: GenerationLogEntry): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, JSON.stringify(entry) + '\n', 'utf8');
  }

  async forCrimeReport(crimeReportId: string): Promise<GenerationLogEntry[]> {
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch {
      return [];
    }
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as GenerationLogEntry)
      .filter((e) => e.crimeReportId === crimeReportId);
  }
}
