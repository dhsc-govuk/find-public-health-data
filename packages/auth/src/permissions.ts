import type { Role } from './roles.ts';

/** Who is asking, as a verified session states it. */
export interface SessionUser {
  readonly roles: readonly string[];
  readonly sub: string;
  readonly teams: readonly string[];
}

/** What the checks need to know about an indicator. */
export interface IndicatorAccess {
  readonly teamId: string | null;
  /** The IMRG reviewers assigned to its draft's latest submission. */
  readonly reviewerIds: readonly string[];
}

/** The indicators a list shows: every one, or those of the given teams. */
export type IndicatorListScope =
  | { readonly all: true }
  | { readonly all: false; readonly teamIds: readonly string[] };

const INTERNAL_ROLES: readonly Role[] = ['publisher', 'imrg-manager', 'imrg-reviewer', 'admin'];

function holds(user: Pick<SessionUser, 'roles'>, role: Role): boolean {
  return user.roles.includes(role);
}

/** Whether the user may use the internal service at all: they hold one of its four roles. */
export function canUseInternalService(user: Pick<SessionUser, 'roles'>): boolean {
  return INTERNAL_ROLES.some((role) => holds(user, role));
}

/** Whether the user may open the indicator list; `canSeeIndicator` decides which ones it shows. */
export function canListIndicators(user: SessionUser): boolean {
  return INTERNAL_ROLES.some((role) => holds(user, role));
}

/** The teams a new indicator may join: its creator's, who chooses one when there are several. */
export function teamsForNewIndicator(user: SessionUser): readonly string[] {
  return holds(user, 'publisher') ? user.teams : [];
}

export function canCreateIndicator(user: SessionUser): boolean {
  return teamsForNewIndicator(user).length > 0;
}

export function canCreateIndicatorInTeam(user: SessionUser, teamId: string): boolean {
  return teamsForNewIndicator(user).includes(teamId);
}

/** Whether the user edits indicators at all; `canEditIndicator` decides which ones. */
export function canEditIndicators(user: SessionUser): boolean {
  return holds(user, 'publisher');
}

export function canEditIndicator(
  user: SessionUser,
  { teamId }: Pick<IndicatorAccess, 'teamId'>,
): boolean {
  return canEditIndicators(user) && teamId !== null && user.teams.includes(teamId);
}

/** Whether the user may submit the indicator's draft for approval. The editors, for now. */
export function canSubmitIndicator(
  user: SessionUser,
  indicator: Pick<IndicatorAccess, 'teamId'>,
): boolean {
  return canEditIndicator(user, indicator);
}

/** Whether the user may withdraw the draft's submission before a response. As `canSubmitIndicator`. */
export function canWithdrawSubmission(
  user: SessionUser,
  indicator: Pick<IndicatorAccess, 'teamId'>,
): boolean {
  return canSubmitIndicator(user, indicator);
}

/** Whether the user may be assigned indicators to review; `canReviewIndicator` decides which. */
export function canReviewIndicators(user: Pick<SessionUser, 'roles'>): boolean {
  return holds(user, 'imrg-reviewer');
}

export function canReviewIndicator(
  user: SessionUser,
  { reviewerIds }: Pick<IndicatorAccess, 'reviewerIds'>,
): boolean {
  return canReviewIndicators(user) && reviewerIds.includes(user.sub);
}

/** Whether the user may respond to the indicator's submission: one of its assigned reviewers. */
export function canRespondToReview(
  user: SessionUser,
  indicator: Pick<IndicatorAccess, 'reviewerIds'>,
): boolean {
  return canReviewIndicator(user, indicator);
}

/**
 * Whether the user may read and write their own notes on the indicator: one of its assigned
 * reviewers. Nobody reads another user's notes.
 */
export function canWriteReviewerNotes(
  user: SessionUser,
  indicator: Pick<IndicatorAccess, 'reviewerIds'>,
): boolean {
  return canReviewIndicator(user, indicator);
}

/**
 * Whether the user may read what the publisher wrote for the indicator's reviewers. It admits
 * the users `canSeeIndicator` does, and is kept apart from it so the notes stay closed to anyone
 * a wider overview access lets in later.
 */
export function canSeeNotesForReviewers(user: SessionUser, indicator: IndicatorAccess): boolean {
  return (
    holds(user, 'imrg-manager') ||
    holds(user, 'admin') ||
    canEditIndicator(user, indicator) ||
    canReviewIndicator(user, indicator)
  );
}

/**
 * Whether the user may read the indicator's history. It admits the users `canSeeIndicator` does,
 * and is kept apart from it so a wider overview access decides the history on its own.
 */
export function canSeeIndicatorHistory(user: SessionUser, indicator: IndicatorAccess): boolean {
  return (
    holds(user, 'admin') ||
    holds(user, 'imrg-manager') ||
    canEditIndicator(user, indicator) ||
    canReviewIndicator(user, indicator)
  );
}

export function canSeeIndicator(user: SessionUser, indicator: IndicatorAccess): boolean {
  return (
    holds(user, 'admin') ||
    holds(user, 'imrg-manager') ||
    canEditIndicator(user, indicator) ||
    canReviewIndicator(user, indicator)
  );
}

export function canAssignReviewers(user: SessionUser): boolean {
  return holds(user, 'imrg-manager');
}

/** Whether the user may confirm an approved indicator's publication date, and change it after. */
export function canSchedulePublication(user: SessionUser): boolean {
  return holds(user, 'admin');
}

/** Whether the user may manage the service's shared content, such as its topics. */
export function canManage(user: SessionUser): boolean {
  return holds(user, 'admin');
}

export function canMoveIndicatorBetweenTeams(user: SessionUser): boolean {
  return holds(user, 'admin');
}

/** Whether the user browses every indicator from the dashboard, whatever other roles they hold. */
export function canBrowseAllIndicators(user: SessionUser): boolean {
  return holds(user, 'admin');
}

export function canSeeTeamsAndUsers(user: SessionUser): boolean {
  return holds(user, 'admin');
}

/**
 * The indicators `canSeeIndicator` lets the user see, as a list query filters them. Being
 * assigned to review an indicator adds nothing to the scope.
 */
export function indicatorListScope(user: SessionUser): IndicatorListScope {
  if (holds(user, 'admin') || holds(user, 'imrg-manager')) return { all: true };

  return ownTeamsListScope(user);
}

/** The indicators of the teams the user publishes for, however many more they may see. */
export function ownTeamsListScope(user: SessionUser): IndicatorListScope {
  return { all: false, teamIds: holds(user, 'publisher') ? user.teams : [] };
}
