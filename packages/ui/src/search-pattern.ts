export function searchPattern(query: string): RegExp | undefined {
  const term = query.trim().replace(/\s+/g, ' ');
  return term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu') : undefined;
}
