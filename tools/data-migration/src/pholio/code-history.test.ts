import { describe, expect, it } from 'vitest';

import { parseCodeHistory } from './code-history.ts';

const header = 'GEOGCD,GEOGNM,OPER_DATE,TERM_DATE,STATUS\n';

describe('parseCodeHistory', () => {
  it('reads a live code and a terminated one as ISO dates', () => {
    const validity = parseCodeHistory(
      `${header}E06000063,Cumberland,01/04/2023 00:00,,live\nE10000006,Cumbria,01/01/2009 00:00,31/03/2023 00:00,terminated\n`,
    );

    expect(validity.get('E06000063')).toEqual({ from: '2023-04-01', to: null });
    expect(validity.get('E10000006')).toEqual({ from: '2009-01-01', to: '2023-03-31' });
  });

  it('takes the earliest start and, unless a row is live, the latest end', () => {
    const validity = parseCodeHistory(
      `${header}E1,A,01/04/2009 00:00,31/03/2015 00:00,terminated\nE1,A,01/04/2015 00:00,31/03/2019 00:00,terminated\nE2,B,01/04/2009 00:00,31/03/2015 00:00,terminated\nE2,B,01/04/2015 00:00,,live\n`,
    );

    expect(validity.get('E1')).toEqual({ from: '2009-04-01', to: '2019-03-31' });
    expect(validity.get('E2')).toEqual({ from: '2009-04-01', to: null });
  });
});
