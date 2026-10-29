import { createApiApp } from '@fphd/api-server';
import { FAKE_USER_IDS, TEAM_IDS } from '@fphd/auth';
import { createJwtSessionService, createJwtSessionVerifier } from '@fphd/auth/jwt-session';
import { schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { nullColumns, withThrowingDefaults } from '@fphd/db/testing';
import { REQUEST_ID_HEADER } from '@fphd/express';
import type { Express, Router } from 'express';
import { type Logger, pino } from 'pino';

import { indicatorSectionFieldErrors } from './contract.ts';
import type { IndicatorTeams } from './indicator-editor.ts';
import type { IndicatorSectionDraft } from './indicator-section.ts';
import type { IndicatorSection } from './indicator-section-contract.ts';
import type { InternalRepositories } from './repositories.ts';

/** Per-method stubs; anything unstubbed throws, as with `createFakeRepositories` in `@fphd/db`. */
export type FakeInternalRepositoryOverrides = {
  [K in keyof InternalRepositories]?: Partial<InternalRepositories[K]>;
};

export function createFakeInternalRepositories(
  overrides: FakeInternalRepositoryOverrides = {},
): InternalRepositories {
  return {
    ciMethods: withThrowingDefaults('ciMethods', overrides.ciMethods),
    dataProviders: withThrowingDefaults('dataProviders', overrides.dataProviders),
    dataUploads: withThrowingDefaults('dataUploads', overrides.dataUploads),
    indicators: withThrowingDefaults('indicators', overrides.indicators),
    reviewers: withThrowingDefaults('reviewers', overrides.reviewers),
    tags: withThrowingDefaults('tags', overrides.tags),
    topics: withThrowingDefaults('topics', overrides.topics),
    valueTypesAndUnits: withThrowingDefaults('valueTypesAndUnits', overrides.valueTypesAndUnits),
  };
}

const testSession = createJwtSessionService({
  audience: 'fphd-internal',
  clock: () => new Date('2026-08-04T10:00:00.000Z'),
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret: 'a-jwt-session-secret-that-is-long-enough-for-tests',
  secure: false,
});

export const testSessionVerifier = createJwtSessionVerifier(testSession);

/** The signed-in user of a test session: a fake user, so the rows it writes have a writer. */
export const TEST_USER_ID = FAKE_USER_IDS.publisherTeamA;

/** Who a handler under test writes as: the test user, in the request that got `response`. */
export function testActor(response: { headers: Record<string, string> }): Actor {
  return { userId: TEST_USER_ID, requestId: response.headers[REQUEST_ID_HEADER] ?? null };
}

/** The test session's team, which `TEST_USER_ID` belongs to. */
export const TEST_TEAM_ID = TEAM_IDS.teamA;

/** Team lookups that put every indicator in the test session's team. */
export const inTestTeam: IndicatorTeams = { findTeamId: async () => TEST_TEAM_ID };

/** A session cookie for `TEST_USER_ID` holding the given roles, in the test team unless told. */
export async function testSessionCookie(
  roles: readonly string[],
  teams: readonly string[] = [TEST_TEAM_ID],
): Promise<string> {
  const token = await testSession.issueToken({
    expiresInSeconds: 900,
    roles,
    subject: TEST_USER_ID,
    teams,
  });
  return testSession.createCookieHeader(token, 900);
}

/** An internal API app serving one router, logging nowhere unless given a logger. */
export function createRouterTestApp(
  router: Router,
  logger: Logger = pino({ level: 'silent' }),
): Express {
  const app = createApiApp({ logger, serviceName: 'internal-api' });

  app.use(router);

  return app;
}

/** The lines a handler wrote, without the request line pino-http adds once the response ends. */
export async function handlerLogLines(
  lines: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  await new Promise((resolve) => setImmediate(resolve));
  return lines.filter((line) => line.res === undefined);
}

/** The field errors a section's schema gives a submission, or undefined when it accepts it. */
export function sectionFieldErrors<Field extends string, Values, Input, ErrorField extends string>(
  section: IndicatorSection<Field, Values, Input, ErrorField, never>,
  body: unknown,
): Partial<Record<Field | ErrorField, string>> | undefined {
  const submission = section.schema.safeParse(body);
  return submission.success ? undefined : indicatorSectionFieldErrors(section, submission.error);
}

/** A draft as the name page leaves it: every column unanswered and every list empty. */
export const unansweredDraft: IndicatorSectionDraft = {
  ...nullColumns(schema.indicatorVersion),
  isAreaContext: false,
  links: [],
  ageRanges: [],
  topicIds: [],
  primaryTopicId: null,
  subtopicIds: [],
  primarySubtopicId: null,
  classifications: [],
  numeratorSources: [],
  denominatorSources: [],
};
