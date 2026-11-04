interface SeriesObservation {
  fromDate: string;
  toDate: string;
  dimensions: { type: string; value: string }[];
}

export function observationSegmentKey(observation: SeriesObservation): string {
  return observation.dimensions.map(({ type, value }) => `${type}:${value}`).join('|');
}

export function isRollingPeriod(
  observation: Pick<SeriesObservation, 'fromDate' | 'toDate'>,
): boolean {
  return (Date.parse(observation.toDate) - Date.parse(observation.fromDate)) / 86_400_000 > 400;
}

export function headlineSeries<T extends SeriesObservation>(observations: T[]): T[] {
  if (!observations.length) return [];
  const minimum = Math.min(...observations.map(({ dimensions }) => dimensions.length));
  const candidates = observations.filter(({ dimensions }) => dimensions.length === minimum);
  const sizes = new Map<string, number>();
  for (const point of candidates) {
    const key = observationSegmentKey(point);
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  const winner = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0];
  return candidates
    .filter((point) => observationSegmentKey(point) === winner)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.toDate.localeCompare(b.toDate));
}

/** Keep complete headline histories for every table sex/period choice and England's benchmarks. */
export function tableAreaSeries<T extends { areaCode: string; observations: SeriesObservation[] }>(
  areas: T[],
): T[] {
  const selected = areas.map((area) => {
    const sexes = [
      ...new Set(
        area.observations.flatMap(({ dimensions }) =>
          dimensions.filter(({ type }) => type === 'Sex').map(({ value }) => value),
        ),
      ),
    ];
    const groups = [
      area.observations,
      area.observations.filter(({ dimensions }) => !dimensions.some(({ type }) => type === 'Sex')),
      ...sexes.map((sex) =>
        area.observations.filter(({ dimensions }) =>
          dimensions.some(({ type, value }) => type === 'Sex' && value === sex),
        ),
      ),
    ];
    const keep = new Set<SeriesObservation>();
    for (const group of groups) {
      for (const points of [
        group,
        group.filter(isRollingPeriod),
        group.filter((point) => !isRollingPeriod(point)),
      ])
        for (const point of headlineSeries(points)) keep.add(point);
    }
    return { ...area, observations: area.observations.filter((point) => keep.has(point)) };
  });
  const benchmarkSegments = new Set(
    selected.flatMap(({ observations }) => observations.map(observationSegmentKey)),
  );
  return selected.map((area) => {
    if (area.areaCode !== 'E92000001' || areas.length === 1) return area;
    const england = areas.find(({ areaCode }) => areaCode === 'E92000001');
    return {
      ...area,
      observations: (england?.observations ?? []).filter((point) =>
        benchmarkSegments.has(observationSegmentKey(point)),
      ),
    };
  });
}
