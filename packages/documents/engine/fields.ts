// Finding and replacing Word merge fields inside one XML part.
//
// Word stores a field in two ways:
//   simple:  <w:fldSimple w:instr=" MERGEFIELD x "> result runs </w:fldSimple>
//   complex: run(fldChar begin) run(instrText)… [run(fldChar separate) result runs…] run(fldChar end)
// The instruction may be split over several instrText runs, and "separate" plus the result
// may be missing. Like a Word mail merge, a filled field becomes plain runs: the field code
// is removed, the result runs keep their formatting (rPr) and get the new text.
// Runs outside fields and every non-run element (bookmarks, proofErr, paragraphs) are untouched.
import { decodeXmlEntities, valueToRunContent } from './xml.ts';

export interface FieldOccurrence {
  /** Field name as written in the template, e.g. "Name_of_Accused". */
  name: string;
  instruction: string;
  kind: 'simple' | 'complex';
}

export interface ReplaceResult {
  xml: string;
  occurrences: FieldOccurrence[];
  /** MERGEFIELDs nested in or containing other fields: left untouched and reported. */
  unsupported: string[];
}

/** Value for a field name, or undefined when no value is available. */
export type FieldResolver = (name: string) => string | undefined;

/** MERGEFIELD name from an instruction such as ` MERGEFIELD "Name_of_Accused" \* MERGEFORMAT `. */
export function mergeFieldName(instruction: string): string | null {
  const m = /^\s*MERGEFIELD\s+(?:"([^"]+)"|(\S+))/i.exec(instruction);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/**
 * Switches that change what Word prints (\b text before, \f text after, \* Upper, \@ date
 * format, \# number format, …). The engine does not apply them, so a field using one is reported
 * as unsupported instead of printing something different from Word. \* MERGEFORMAT and
 * \* CHARFORMAT only keep formatting and are fine. None of the original templates use others.
 */
export function unsupportedSwitches(instruction: string): string[] {
  const afterName = instruction.replace(/^\s*MERGEFIELD\s+(?:"[^"]+"|\S+)/i, '');
  return (afterName.match(/\\[^\s"]+(?:\s+(?:"[^"]*"|[^\s\\]+))?/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => !/^\\\*\s*(MERGEFORMAT|CHARFORMAT)$/i.test(s));
}

/**
 * Innermost runs only. A run that holds a drawing or text box contains whole paragraphs with
 * runs of their own; matching it from its start would cut through the text box (most merge
 * fields in the templates are inside text boxes). The tempered pattern refuses to cross a nested
 * <w:r, so the outer run is left alone and the inner runs are matched one by one.
 */
const RUN_RE = /<w:r\b[^>]*\/>|<w:r\b[^>]*>(?:(?!<w:r\b)[\s\S])*?<\/w:r>/g;

interface Run {
  start: number;
  end: number;
  xml: string;
}

function runOpenTag(run: string): string {
  return /^<w:r\b[^>]*>/.exec(run)?.[0] ?? '<w:r>';
}

function runProps(run: string): string {
  return /<w:rPr\b[^>]*\/>|<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/.exec(run)?.[0] ?? '';
}

function hasText(run: string): boolean {
  return /<w:t\b|<w:tab\/>|<w:br\b|<w:sym\b/.test(run);
}

/** A run with the same open tag and formatting as `like`, holding `value`. */
function makeRun(like: string, value: string): string {
  return `${runOpenTag(like)}${runProps(like)}${valueToRunContent(value)}</w:r>`;
}

function fieldValue(name: string, resolve: FieldResolver): string {
  return resolve(name) ?? '';
}

/** Replace the result runs of a field: first text run gets the value, other text runs go. */
function resultReplacement(resultRuns: string[], fallbackLike: string, value: string): string[] {
  const firstText = resultRuns.findIndex(hasText);
  if (firstText < 0) return [...resultRuns, makeRun(resultRuns[0] ?? fallbackLike, value)];
  return resultRuns.flatMap((r, i) => (i === firstText ? [makeRun(r, value)] : hasText(r) ? [] : [r]));
}

function replaceSimpleFields(
  xml: string,
  resolve: FieldResolver,
  found: FieldOccurrence[],
  unsupported: string[],
): string {
  return xml.replace(
    /<w:fldSimple\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w:fldSimple>)/g,
    (whole, attrs: string, inner: string | undefined) => {
      const instruction = decodeXmlEntities(/\bw:instr="([^"]*)"/.exec(attrs)?.[1] ?? '');
      const name = mergeFieldName(instruction);
      if (!name) return whole;
      if (unsupportedSwitches(instruction).length) {
        unsupported.push(name);
        return whole;
      }
      found.push({ name, instruction: instruction.trim(), kind: 'simple' });
      const value = fieldValue(name, resolve);
      const body = inner ?? '';
      const runs = body.match(RUN_RE) ?? [];
      const replaced = resultReplacement(runs, '<w:r>', value);
      // keep any non-run content of the field body (bookmarks etc.) after the runs
      const rest = body.replace(RUN_RE, '');
      return replaced.join('') + rest;
    },
  );
}

export function replaceMergeFields(xml: string, resolve: FieldResolver): ReplaceResult {
  const occurrences: FieldOccurrence[] = [];
  const unsupported: string[] = [];
  xml = replaceSimpleFields(xml, resolve, occurrences, unsupported);

  const runs: Run[] = [...xml.matchAll(RUN_RE)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    xml: m[0],
  }));
  const runAt = (i: number): Run => {
    const run = runs[i];
    if (!run) throw new Error(`no run ${i}`);
    return run;
  };

  interface Open {
    begin: number;
    instr: string;
    instrRuns: number[];
    separate: number;
    resultRuns: number[];
    hasChild: boolean;
    nested: boolean;
  }
  interface Field extends Open {
    end: number;
  }
  const stack: Open[] = [];
  const fields: Field[] = [];

  runs.forEach((run, i) => {
    const chars = [...run.xml.matchAll(/<w:fldChar\b[^>]*\bw:fldCharType="(begin|separate|end)"/g)].map((m) => m[1]);
    if (chars.length > 1) throw new Error(`run with more than one fldChar at offset ${run.start}`);
    // removing a field-character run must never remove text with it
    if (chars.length && /<w:t\b|<w:instrText\b/.test(run.xml)) {
      throw new Error(`run with a fldChar and text at offset ${run.start}; not supported`);
    }
    const top = stack[stack.length - 1];
    if (chars[0] === 'begin') {
      if (top) top.hasChild = true;
      stack.push({ begin: i, instr: '', instrRuns: [], separate: -1, resultRuns: [], hasChild: false, nested: !!top });
    } else if (chars[0] === 'separate') {
      if (top) top.separate = i;
    } else if (chars[0] === 'end') {
      const f = stack.pop();
      if (f) fields.push({ ...f, end: i });
    } else if (top) {
      const instrText = [...run.xml.matchAll(/<w:instrText\b[^>]*>([^<]*)<\/w:instrText>/g)];
      if (top.separate < 0) {
        top.instr += instrText.map((m) => decodeXmlEntities(m[1] ?? '')).join('');
        top.instrRuns.push(i);
      } else {
        top.resultRuns.push(i);
      }
    }
  });
  if (stack.length) throw new Error('field begin without end');

  // run index → replacement (null = remove); runs not in the map are kept as they are
  const edits = new Map<number, string | null>();
  for (const f of fields) {
    const name = mergeFieldName(f.instr);
    if (!name) continue;
    if (f.nested || f.hasChild || unsupportedSwitches(f.instr).length) {
      unsupported.push(name);
      continue;
    }
    occurrences.push({ name, instruction: f.instr.trim(), kind: 'complex' });
    const value = fieldValue(name, resolve);
    edits.set(f.begin, null);
    for (const r of f.instrRuns) edits.set(r, null);
    if (f.separate >= 0) edits.set(f.separate, null);
    const resultXml = f.resultRuns.map((r) => runAt(r).xml);
    const like = runAt(f.instrRuns[0] ?? f.begin).xml;
    const replaced = resultReplacement(resultXml, like, value);
    f.resultRuns.forEach((r) => edits.set(r, null));
    // the end run's slot carries the result, so it lands exactly where the field was
    edits.set(f.end, replaced.join(''));
  }

  let out = '';
  let pos = 0;
  runs.forEach((run, i) => {
    if (!edits.has(i)) return;
    out += xml.slice(pos, run.start) + (edits.get(i) ?? '');
    pos = run.end;
  });
  out += xml.slice(pos);
  return { xml: out, occurrences, unsupported };
}
