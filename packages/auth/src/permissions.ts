import type { Role } from './roles.ts';

/** Who is asking, as a verified session states it. */
export interface SessionUser {
  readonly roles: readonly string[];
  readonly sub: string;
  readonly teams: readonly string[];
}

/** What the checks need to know about an indicator. */
export interface IndicatorAccess {
  readonly teamId: string;
  /** The IMRG reviewers assigned to its draft's latest submission. */
  readonly reviewerIds: readonly string[];
}

/**
 * The indicators a list shows: every one, less those of any teams in `exceptTeamIds`, or those of
 * the given teams.
 */
export type IndicatorListScope =
  | { readonly all: true; readonly exceptTeamIds?: readonly string[] }
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
  return canEditIndicators(user) && user.teams.includes(teamId);
}

/** Whether the user may submit the indicator's draft for approval. The editors, for now. */
export function canSubmitIndicator(
  user: SessionUser,
  indicator: Pick<IndicatorAccess, 'teamId'>,
): boolean {
  return canEditIndicator(user, indicator);
}

/**
 * Whether the user may withdraw the draft's submission before reviewers are assigned. As
 * `canSubmitIndicator`.
 */
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
 * Whether the user may add notes to the indicator's review: one of its assigned reviewers. Only
 * a note's author edits it.
 */
export function canWriteReviewerNotes(
  user: SessionUser,
  indicator: Pick<IndicatorAccess, 'reviewerIds'>,
): boolean {
  return canReviewIndicator(user, indicator);
}

/**
 * Whether the user may read every reviewer's notes on the indicator: its assigned reviewers, the
 * IMRG manager and admins. Never a publisher, for whom they are not written.
 */
export function canReadReviewerNotes(
  user: SessionUser,
  indicator: Pick<IndicatorAccess, 'reviewerIds'>,
): boolean {
  return holds(user, 'imrg-manager') || holds(user, 'admin') || canReviewIndicator(user, indicator);
}

/**
 * Whether the user may read what the publisher wrote for the indicator's reviewers. It admits
 * the users `canWorkOnIndicator` does, and is kept apart from it so the notes stay closed to
 * anyone a wider access to the indicator's work lets in later.
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
 * Whether the user may read the indicator's history. It admits the users `canWorkOnIndicator`
 * does, and is kept apart from it so a wider access to the indicator's work decides the history
 * on its own.
 */
export function canSeeIndicatorHistory(user: SessionUser, indicator: IndicatorAccess): boolean {
  return (
    holds(user, 'admin') ||
    holds(user, 'imrg-manager') ||
    canEditIndicator(user, indicator) ||
    canReviewIndicator(user, indicator)
  );
}

/**
 * Whether the user works on the indicator: an admin, an IMRG manager, one of its editors or one
 * of its assigned reviewers. Only they may open anything of the indicator's beyond its overview
 * and its metadata-only preview, and the API answers anyone else as if it did not exist.
 */
export function canWorkOnIndicator(user: SessionUser, indicator: IndicatorAccess): boolean {
  return (
    holds(user, 'admin') ||
    holds(user, 'imrg-manager') ||
    canEditIndicator(user, indicator) ||
    canReviewIndicator(user, indicator)
  );
}

/**
 * Whether the user may see the indicator's overview and preview. A publisher sees every team's
 * indicators, read only, and the preview shows them only the metadata of one they don't work on.
 */
export function canSeeIndicator(user: SessionUser, indicator: IndicatorAccess): boolean {
  return canEditIndicators(user) || canWorkOnIndicator(user, indicator);
}

export function canAssignReviewers(user: SessionUser): boolean {
  return holds(user, 'imrg-manager');
}

/** Whether the user may confirm an approved indicator's publication date, and change it after. */
export function canSchedulePublication(user: SessionUser): boolean {
  return holds(user, 'admin');
}

/**
 * Whether the user may decide what happens to a submitted update to a live indicator: send it to
 * IMRG, send it back for revisions, or approve it for publishing. The core team decides, and
 * holds the admin role.
 */
export function canDecideUpdates(user: SessionUser): boolean {
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

/**
 * Whether the dashboard lists the user's teams' indicators apart from every other team's: a
 * publisher, unless they browse every indicator in one list.
 */
export function canBrowseOtherTeamsIndicators(user: SessionUser): boolean {
  return canEditIndicators(user) && !canBrowseAllIndicators(user);
}

export function canSeeTeamsAndUsers(user: SessionUser): boolean {
  return holds(user, 'admin');
}

/**
 * The indicators `canSeeIndicator` lets the user see, as a list query filters them. Being
 * assigned to review an indicator adds nothing to the scope.
 */
export function indicatorListScope(user: SessionUser): IndicatorListScope {
  if (holds(user, 'admin') || holds(user, 'imrg-manager') || canEditIndicators(user)) {
    return { all: true };
  }

  return { all: false, teamIds: [] };
}

/** The teams the user publishes for. */
function publishingTeams(user: SessionUser): readonly string[] {
  return canEditIndicators(user) ? user.teams : [];
}

/** The indicators of the teams the user publishes for, however many more they may see. */
export function ownTeamsListScope(user: SessionUser): IndicatorListScope {
  return { all: false, teamIds: publishingTeams(user) };
}

/** The indicators the user may see outside the teams they publish for. */
export function otherTeamsListScope(user: SessionUser): IndicatorListScope {
  return indicatorListScope(user).all
    ? { all: true, exceptTeamIds: publishingTeams(user) }
    : { all: false, teamIds: [] };
}
