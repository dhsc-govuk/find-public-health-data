/** The ids of the teams' `team` rows, which the migration in @fphd/db-operations inserts. */
export const TEAM_IDS = Object.freeze({
  teamA: '01a13c69-96aa-70af-81f9-10856a4023b2',
  teamB: '01a13c69-96ab-7598-9ce0-eae589a6c7e7',
  teamC: '01a13c69-96ab-7598-9ce0-ef35bcca9627',
  fingertips: '01a13ca4-5b80-76ba-bda8-93cbb4a49f64',
});

export interface Team {
  readonly id: string;
  readonly name: string;
}

/** The teams publishers belong to, and Fingertips, which holds imported indicators and no one. */
export const TEAMS: readonly Team[] = Object.freeze([
  Object.freeze({ id: TEAM_IDS.teamA, name: 'Team A' }),
  Object.freeze({ id: TEAM_IDS.teamB, name: 'Team B' }),
  Object.freeze({ id: TEAM_IDS.teamC, name: 'Team C' }),
  Object.freeze({ id: TEAM_IDS.fingertips, name: 'Fingertips' }),
]);
