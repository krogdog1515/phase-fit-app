/**
 * Generate the movements seed SQL from the vetted CSV.
 *
 *   npx tsx scripts/generate-movement-seed.ts
 *
 * Reads  supabase/seed/movements_t1.csv
 * Writes supabase/seed/20260806_movements_t1_v2.sql
 *
 * Emits only vetted ('Y') rows, normalizes the three array columns
 * (comma-separated -> text[], 'none'/empty -> '{}'), maps the media_url
 * placeholder to NULL, drops the non-column `open_questions`, and uses
 * `on conflict (slug) do update` so re-running is idempotent.
 *
 * This script NEVER touches the database. It only reads a CSV and writes SQL.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CSV_PATH = join(ROOT, 'supabase/seed/movements_t1.csv');
const OUT_PATH = join(ROOT, 'supabase/seed/20260806_movements_t1_v2.sql');

const MEDIA_PLACEHOLDER = 'TODO - curated link only';

// Columns emitted to the movements table, in order. `open_questions` is
// intentionally absent — it is not a database column.
const ARRAY_COLUMNS = ['focus_tags', 'equipment', 'exclusion_flags'] as const;
const TEXT_COLUMNS = ['name', 'slug', 'category', 'cues', 'modifications', 'source_ref', 'benefit'] as const;
const STAGE_COLUMNS = ['min_stage', 'max_stage'] as const;

/** Minimal RFC-4180-ish CSV parser: quoted fields, embedded commas/newlines, "" escapes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  // Normalize CRLF -> LF so newline handling is uniform.
  const src = text.replace(/\r\n?/g, '\n');

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush trailing field/row if the file doesn't end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Escape a value for a single-quoted SQL string literal. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Comma-separated cell -> Postgres text[] literal. 'none'/empty -> '{}'. */
function toTextArray(cell: string): { sql: string; normalizedNone: boolean } {
  const tokens = cell
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const onlyNone = tokens.length === 1 && tokens[0].toLowerCase() === 'none';
  if (tokens.length === 0 || onlyNone) {
    return { sql: `'{}'::text[]`, normalizedNone: onlyNone };
  }
  const elements = tokens.map((t) => sqlString(t)).join(', ');
  return { sql: `array[${elements}]::text[]`, normalizedNone: false };
}

function main(): void {
  const raw = readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(raw);
  const header = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''));

  const idx = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`CSV missing expected column: ${name}`);
    return i;
  };

  const cell = (r: string[], name: string): string => (r[idx(name)] ?? '').trim();

  const emitted: string[] = [];
  const skipped: string[] = [];
  const noneCounts: Record<string, number> = {
    focus_tags: 0,
    equipment: 0,
    exclusion_flags: 0,
  };

  const valuesRows: string[] = [];

  for (const r of dataRows) {
    const slug = cell(r, 'slug');
    if (cell(r, 'vetted') !== 'Y') {
      skipped.push(slug || '(no slug)');
      continue;
    }

    const parts: string[] = [];

    // text columns (name, slug, category, cues, modifications, source_ref, benefit)
    // and stage columns are emitted as escaped string literals.
    // media_url placeholder -> NULL.
    const columnOrder = [
      'name',
      'slug',
      'category',
      'min_stage',
      'max_stage',
      'focus_tags',
      'equipment',
      'exclusion_flags',
      'cues',
      'modifications',
      'source_ref',
      'benefit',
      'media_url',
    ] as const;

    for (const col of columnOrder) {
      const value = cell(r, col);
      if ((ARRAY_COLUMNS as readonly string[]).includes(col)) {
        const { sql, normalizedNone } = toTextArray(value);
        if (normalizedNone) noneCounts[col]++;
        parts.push(sql);
      } else if (col === 'media_url') {
        parts.push(value === MEDIA_PLACEHOLDER || value === '' ? 'null' : sqlString(value));
      } else if ((TEXT_COLUMNS as readonly string[]).includes(col) || (STAGE_COLUMNS as readonly string[]).includes(col)) {
        parts.push(sqlString(value));
      }
    }

    valuesRows.push(`  (${parts.join(', ')})`);
    emitted.push(slug);
  }

  const insertCols = [
    'name',
    'slug',
    'category',
    'min_stage',
    'max_stage',
    'focus_tags',
    'equipment',
    'exclusion_flags',
    'cues',
    'modifications',
    'source_ref',
    'benefit',
    'media_url',
  ];

  const updateCols = insertCols.filter((c) => c !== 'slug');
  const updateClause = updateCols.map((c) => `  ${c} = excluded.${c}`).join(',\n');

  const sql = `-- Generated by scripts/generate-movement-seed.ts — do not edit by hand.
-- Source: supabase/seed/movements_t1.csv
-- Vetted rows only. Idempotent via on conflict (slug) do update.

insert into public.movements (
  ${insertCols.join(',\n  ')}
) values
${valuesRows.join(',\n')}
on conflict (slug) do update set
${updateClause};
`;

  writeFileSync(OUT_PATH, sql, 'utf8');

  // Report.
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Emitted ${emitted.length} vetted rows.`);
  console.log(`Skipped ${skipped.length} unvetted rows${skipped.length ? `: ${skipped.join(', ')}` : ''}.`);
  console.log('Cells normalized none/empty -> \'{}\' per column:');
  for (const col of ARRAY_COLUMNS) {
    console.log(`  ${col}: ${noneCounts[col]}`);
  }
}

main();
