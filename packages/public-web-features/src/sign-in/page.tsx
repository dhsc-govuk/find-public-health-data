import { type AppAudience, type FakeUser, type Role, TEAMS } from '@fphd/auth';
import { canUseInternalService } from '@fphd/auth/permissions';
import { A, Button, PageIntro, Radios } from '@fphd/ui';

const ROLE_LABELS: Partial<Record<Role, string>> = {
  'imrg-manager': 'IMRG manager',
  'imrg-reviewer': 'IMRG reviewer',
  admin: 'Admin',
};

function listed(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** The user's roles and teams, as the radio's hint states them. */
export function fakeUserAccess(user: FakeUser): string {
  const teams = TEAMS.filter(({ id }) => user.teamIds.includes(id)).map(({ name }) => name);
  const roles = user.roles.flatMap((role) => {
    if (role === 'publisher') return [`Publisher in ${listed(teams)}`];
    const label = ROLE_LABELS[role];
    return label === undefined ? [] : [label];
  });

  return roles.length === 0 ? 'Public service only' : roles.map((role) => `${role}.`).join(' ');
}

export interface SignInSession {
  readonly roles: readonly string[];
  readonly subject: string;
}

interface SignInPageProps {
  audience: AppAudience;
  returnTo: string;
  session?: SignInSession | undefined;
  users: readonly FakeUser[];
}

export function SignInPage({ audience, returnTo, session, users }: SignInPageProps) {
  if (session !== undefined) {
    const user = users.find((candidate) => candidate.id === session.subject);

    return (
      <PageIntro title="Your account">
        <p className="govuk-body">
          You are signed in as <strong>{user?.name ?? session.subject}</strong>.
        </p>
        {audience === 'internal' && !canUseInternalService(session) ? (
          <p className="govuk-body">This account cannot access the internal service.</p>
        ) : (
          <p className="govuk-body">
            <A href={returnTo}>Continue to the service</A>
          </p>
        )}
        <form action="/auth/sign-out" method="post">
          <input name="returnTo" type="hidden" value="/sign-in" />
          <Button type="submit">Sign out</Button>
        </form>
      </PageIntro>
    );
  }

  return (
    <PageIntro title="Sign in">
      <p className="govuk-body">
        Select a fake user to test the {audience} service. No password is required.
      </p>
      <p className="govuk-body">IMRG is the Indicator Methodology Review Group.</p>
      <form action="/auth/sign-in" method="post">
        <input name="returnTo" type="hidden" value={returnTo} />
        <Radios
          label="Choose a user"
          name="userId"
          options={users.map((user) => ({
            hint: fakeUserAccess(user),
            label: user.name,
            value: user.id,
          }))}
          required
        />
        <Button type="submit">Sign in</Button>
      </form>
    </PageIntro>
  );
}
