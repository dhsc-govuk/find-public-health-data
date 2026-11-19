import A from '@not-govuk/link';
import type { ReactNode } from 'react';
import { searchPattern } from './search-pattern.ts';

export interface CardListItem {
  description?: string;
  href: string;
  title: string;
}

interface CardListProps {
  columns?: 'one' | 'two' | 'three';
  /** The card titles' heading level, so a page can keep its outline sequential. Appearance is
   * fixed by `govuk-heading-s` and does not follow the level. */
  headingLevel?: 2 | 3;
  searchTerm?: string;
  items: readonly CardListItem[];
}

function highlightMatches(text: string, pattern: RegExp | undefined): ReactNode {
  if (!pattern) return text;

  const parts: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(new RegExp(pattern, `${pattern.flags}g`))) {
    parts.push(text.slice(start, match.index));
    parts.push(
      <mark className="fphd-search-highlight" key={match.index}>
        {match[0]}
      </mark>,
    );
    start = match.index + match[0].length;
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * The whole card is clickable: the link's ::after covers the wrapper. Anything else placed in a
 * card would sit under that overlay, so a card holds only its heading link and description.
 */
export function CardList({
  columns = 'one',
  headingLevel = 3,
  items,
  searchTerm = '',
}: CardListProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const pattern = searchPattern(searchTerm);

  return (
    <ul className={`fphd-card-list fphd-card-list--${columns}-column`}>
      {items.map((item) => (
        <li className="fphd-card-list__item" key={item.href}>
          <div className="fphd-card-list__item-wrapper">
            <Heading className="govuk-heading-s fphd-card-list__heading">
              <A className="fphd-card-list__link" href={item.href}>
                {highlightMatches(item.title, pattern)}
              </A>
            </Heading>
            {item.description ? (
              <p className="govuk-body fphd-card-list__description">
                {highlightMatches(item.description, pattern)}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
