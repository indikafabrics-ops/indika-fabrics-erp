import { readJson, writeJson } from './masterStore';
import { num } from './helpers';

/**
 * Model-wise cost sheet (cloth + "Cut to Pack" lines), kept in Storage JSON (no DB change).
 * Each line belongs to a stage so a batch's value grows as it moves forward.
 */
export type CostStage = 'Cutting' | 'Stitching' | 'QC Check' | 'Packing' | 'Overhead';
export const COST_STAGES: CostStage[] = ['Cutting', 'Stitching', 'QC Check', 'Packing', 'Overhead'];
export interface CostLine { name: string; stage: CostStage; rate: number }
export interface CostSheet { model: string; consumption: number; clothRate: number; lines: CostLine[]; updated?: string }

const PATH = 'catalog/costsheets.json';
export const modelKey = (m: string) => String(m || '').toUpperCase().replace(/\s+/g, ' ').trim();

/** the owner's own sample format (Night Suit Cut to Pack) – starting point for a new model */
export const SAMPLE_LINES: CostLine[] = [
  ['Cutting', 'Cutting', 5], ['Assorting', 'Cutting', 1],
  ['Stitching', 'Stitching', 35], ['Overlock', 'Stitching', 3], ['Yarn', 'Stitching', 5], ['Main Label', 'Stitching', 1.25], ['Size Label', 'Stitching', 0.5],
  ['Button & Kaja', 'Stitching', 7.5], ['Zip', 'Stitching', 0], ['Canvass', 'Stitching', 3], ['Lace', 'Stitching', 0], ['Piping', 'Stitching', 2], ['Plain Cloth', 'Stitching', 0], ['Elastic / Embroid', 'Stitching', 3],
  ['Trimming & Q.C', 'QC Check', 2], ['Ironing', 'QC Check', 3],
  ['Tag', 'Packing', 1], ['Tag Rope', 'Packing', 0.2], ['Cover', 'Packing', 1.5], ['Card', 'Packing', 1], ['Carton Box', 'Packing', 1], ['Packing Kistan', 'Packing', 0.5],
  ['E.B & Rent', 'Overhead', 2], ['Labour Welfare', 'Overhead', 2], ['Freight', 'Overhead', 2]
].map(([name, stage, rate]) => ({ name: name as string, stage: stage as CostStage, rate: rate as number }));

export async function loadCostSheets(): Promise<Record<string, CostSheet>> {
  return readJson<CostSheet>(PATH);
}
export async function saveCostSheet(s: CostSheet): Promise<void> {
  const all = await readJson<CostSheet>(PATH); // re-read so two people do not overwrite each other
  all[modelKey(s.model)] = { ...s, model: s.model.trim(), updated: new Date().toISOString() };
  await writeJson(PATH, all);
}
export async function deleteCostSheet(model: string): Promise<void> {
  const all = await readJson<CostSheet>(PATH);
  delete all[modelKey(model)];
  await writeJson(PATH, all);
}

export const clothCost = (s: CostSheet) => num(s.consumption) * num(s.clothRate);
export const stageSum = (s: CostSheet, st: CostStage) => s.lines.filter(l => l.stage === st).reduce((a, l) => a + num(l.rate), 0);
export const cutToPack = (s: CostSheet) => s.lines.reduce((a, l) => a + num(l.rate), 0);
export const totalCost = (s: CostSheet) => clothCost(s) + cutToPack(s);

export type ValueStage = 'Cloth' | 'Cutting' | 'Stitching' | 'QC Check' | 'Packing' | 'Ready';
const ORDER: CostStage[] = ['Cutting', 'Stitching', 'QC Check', 'Packing', 'Overhead'];
/** cost of ONE piece that has reached the given stage (cloth + all stages up to and including it) */
export function costAt(s: CostSheet | undefined, stage: ValueStage): number | undefined {
  if (!s || !(num(s.consumption) > 0 && num(s.clothRate) > 0)) return undefined;
  if (stage === 'Cloth') return clothCost(s);
  if (stage === 'Ready') return totalCost(s);
  const upto = ORDER.slice(0, ORDER.indexOf(stage as CostStage) + 1);
  return clothCost(s) + upto.reduce((a, st) => a + stageSum(s, st), 0);
}
export const sheetFor = (sheets: Record<string, CostSheet>, model: string) => sheets[modelKey(model)];
