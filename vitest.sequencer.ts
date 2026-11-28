import { BaseSequencer, type TestSpecification } from 'vitest/node';

/**
 * Starts the slowest test files first, whichever project they belong to, so no long file is
 * left to run alone at the end of the run while the other workers sit idle. Vitest's own order
 * runs projects one after another in name order, which put a 95-second file at the end of the
 * integration run.
 *
 * Durations come from Vitest's results cache. On CI a pull request restores the cache from its
 * own latest run, or from main's when it has none. Local runs, the unit tier included, use the
 * developer's own cache. Files that failed last time still run first, as in Vitest's own order.
 * Files the cache does not know, such as a file a branch adds, run next, and without a cache
 * at all the order is Vitest's own.
 */
export class SlowestFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const vitestOrder = await super.sort(files);
    const position = new Map(vitestOrder.map((spec, index) => [spec, index]));
    const rank = (spec: TestSpecification) => {
      const result = this.ctx.cache.getTestSpecificationResult(spec);
      if (!result) return { group: 1, duration: 0 };
      return { group: result.failed ? 0 : 2, duration: result.duration };
    };
    const ranks = new Map(vitestOrder.map((spec) => [spec, rank(spec)]));
    return [...vitestOrder].sort((a, b) => {
      const groupOrder =
        a.project.config.sequence.groupOrder - b.project.config.sequence.groupOrder;
      if (groupOrder !== 0) return groupOrder;
      const rankA = ranks.get(a);
      const rankB = ranks.get(b);
      if (rankA && rankB) {
        if (rankA.group !== rankB.group) return rankA.group - rankB.group;
        if (rankA.duration !== rankB.duration) return rankB.duration - rankA.duration;
      }
      return (position.get(a) ?? 0) - (position.get(b) ?? 0);
    });
  }
}
