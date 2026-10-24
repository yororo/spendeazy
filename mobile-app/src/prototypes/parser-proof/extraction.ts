// Experimental reconstruction, kept separate from provider interpretation.
export interface TextRun { str: string; x: number; y: number; width: number; height: number; hasEOL: boolean }
export interface ProofPage { pageNumber: number; runs: TextRun[]; images: number }

export function reconstruct(page: ProofPage, spatial: boolean) {
  if (!spatial) return page.runs.map((run) => run.str + (run.hasEOL ? '\n' : ' ')).join('');
  const lines: { y: number; runs: TextRun[] }[] = [];
  for (const run of [...page.runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= 2);
    if (!line) { line = { y: run.y, runs: [] }; lines.push(line); }
    line.runs.push(run);
  }
  return lines.map((line) => line.runs.sort((a, b) => a.x - b.x).map((run) => run.str).join(' ')).join('\n');
}
