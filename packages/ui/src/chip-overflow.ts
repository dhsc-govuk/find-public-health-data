type ChipRect = Pick<DOMRectReadOnly, 'top' | 'bottom'>;

export function chipOverflow(rects: ChipRect[], maxLines = 2) {
  const lineEnds: number[] = [];
  for (const rect of rects) {
    const last = lineEnds.at(-1);
    if (last === undefined || rect.top >= last - 2) lineEnds.push(rect.bottom);
    else lineEnds[lineEnds.length - 1] = Math.max(last, rect.bottom);
  }
  const lastLineEnd = lineEnds[maxLines - 1];
  if (lineEnds.length <= maxLines || lastLineEnd === undefined) return null;

  // The button is centred on its line, so its top can sit below the chips' tops.
  const bottom = lastLineEnd - 2;
  return { bottom, shown: rects.findIndex(({ top }) => top >= bottom) };
}
