// Template engine (D3): fill an original .docx with one CR's values.
//
// Only three kinds of change are made, everything else stays byte-identical:
//   1. merge fields in the document, headers, footers, footnotes and endnotes become plain
//      runs holding the value (formatting of the result run is kept);
//   2. the Access mail-merge link (<w:mailMerge> in settings.xml) is removed, so Word does not
//      ask for the old .accdb when the file is opened;
//   3. the matching mailMergeSource relationships are removed from settings.xml.rels.
import { lookupField, formatValue, type DocumentValue } from '../mapping/fields.ts';
import { replaceMergeFields } from './fields.ts';
import { DocxZip } from './zip.ts';

export type DocumentData = Record<string, DocumentValue>;

export interface FillOptions {
  /** 'empty' (default) leaves the field blank like Word does; 'error' throws. */
  onMissing?: 'empty' | 'error';
  /** Throw if the template uses a field the mapping does not know. Default true. */
  failOnUnknownField?: boolean;
}

export interface FillReport {
  /** Field names as written in the template, unique, in first-use order. */
  templateFields: string[];
  occurrences: number;
  /** Canonical fields that got a value. */
  filled: string[];
  /** Canonical fields used by the template that had no value (left empty). */
  missing: string[];
  /** Template field names not in the mapping (left empty). */
  unknown: string[];
  /** Merge fields nested in other fields, left untouched. */
  unsupported: string[];
  mailMergeLinkRemoved: boolean;
}

export interface FillResult {
  docx: Buffer;
  report: FillReport;
}

const CONTENT_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

export function fillTemplate(template: Buffer, data: DocumentData, options: FillOptions = {}): FillResult {
  const { onMissing = 'empty', failOnUnknownField = true } = options;
  const zip = DocxZip.read(template);
  const templateFields: string[] = [];
  const filled = new Set<string>();
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const unsupported = new Set<string>();
  let occurrences = 0;

  const resolve = (name: string): string | undefined => {
    if (!templateFields.includes(name)) templateFields.push(name);
    const def = lookupField(name);
    if (!def) {
      unknown.add(name);
      return undefined;
    }
    const value = formatValue(def, data[def.name]);
    if (value === undefined) missing.add(def.name);
    else filled.add(def.name);
    return value;
  };

  for (const part of zip.names().filter((p) => CONTENT_PART.test(p))) {
    const xml = zip.getText(part) ?? '';
    const result = replaceMergeFields(xml, resolve);
    occurrences += result.occurrences.length;
    result.unsupported.forEach((u) => unsupported.add(u));
    zip.setText(part, result.xml);
  }

  if (unknown.size && failOnUnknownField) {
    throw new Error(`template uses fields not in the mapping: ${[...unknown].join(', ')}`);
  }
  if (missing.size && onMissing === 'error') {
    throw new Error(`no value for: ${[...missing].join(', ')}`);
  }

  const mailMergeLinkRemoved = removeMailMergeLink(zip);
  return {
    docx: zip.write(),
    report: {
      templateFields,
      occurrences,
      filled: [...filled],
      missing: [...missing],
      unknown: [...unknown],
      unsupported: [...unsupported],
      mailMergeLinkRemoved,
    },
  };
}

/** Removes the Access mail-merge link. Returns false if the document had none. */
export function removeMailMergeLink(zip: DocxZip): boolean {
  const settings = zip.getText('word/settings.xml');
  if (!settings) return false;
  const block = /<w:mailMerge\b[\s\S]*?<\/w:mailMerge>|<w:mailMerge\b[^>]*\/>/.exec(settings);
  if (!block) return false;
  zip.setText('word/settings.xml', settings.replace(block[0], ''));

  const relsName = 'word/_rels/settings.xml.rels';
  const rels = zip.getText(relsName);
  if (rels) {
    const ids = new Set([...block[0].matchAll(/\br:id="([^"]+)"/g)].map((m) => m[1]));
    const cleaned = rels.replace(/<Relationship\b[^>]*\/>/g, (rel) => {
      const id = /\bId="([^"]+)"/.exec(rel)?.[1];
      return id && ids.has(id) ? '' : rel;
    });
    zip.setText(relsName, cleaned);
  }
  return true;
}
