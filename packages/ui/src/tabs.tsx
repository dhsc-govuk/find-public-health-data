import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigation } from 'react-router';

interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  param?: string;
}

interface TabsProps {
  items: TabItem[];
  paramKey: string;
  title?: string;
  waitForNavigation?: boolean;
  history?: 'push' | 'replace';
  defaultParam?: string | undefined;
  sectionHeadings?: boolean;
  pageNavigation?: boolean;
  mobileTabs?: boolean;
  linkSelection?: boolean;
}

// Query parameters preserve the server-rendered view in shared links; NotGovUK tabs only track hashes.
export function Tabs(props: TabsProps) {
  if (props.pageNavigation) return <NavigationTabs {...props} waitForNavigation linkSelection />;
  return props.waitForNavigation ? <NavigationTabs {...props} /> : <TabPanels {...props} />;
}

function NavigationTabs(props: TabsProps) {
  const navigation = useNavigation();
  return <TabPanels {...props} navigation={navigation} />;
}

function TabPanels({
  items,
  paramKey,
  title = 'Contents',
  waitForNavigation = false,
  history = 'replace',
  defaultParam,
  sectionHeadings = false,
  pageNavigation = false,
  mobileTabs = false,
  linkSelection = false,
  navigation,
}: TabsProps & { navigation?: ReturnType<typeof useNavigation> }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabParam = new URLSearchParams(location.search).get(paramKey);
  const fromParam = tabParam ?? defaultParam;
  const defaultIndex = Math.max(
    0,
    items.findIndex(({ id, param }) => (param ?? id) === defaultParam),
  );
  const matchingIndex = items.findIndex(({ id, param }) => (param ?? id) === fromParam);
  const paramIndex = matchingIndex >= 0 ? matchingIndex : defaultIndex;
  const hasLinkedSelection =
    pageNavigation || (linkSelection && tabParam !== null && matchingIndex >= 0);
  const [selected, setSelected] = useState(paramIndex);
  const [mounted, setMounted] = useState(false);
  const [tabMode, setTabMode] = useState(false);
  const hashIndex = mounted ? items.findIndex(({ id }) => location.hash === `#${id}`) : -1;
  const committedIndex = pageNavigation
    ? paramIndex
    : hashIndex >= 0
      ? hashIndex
      : waitForNavigation
        ? paramIndex
        : selected;
  const pendingParam =
    waitForNavigation && navigation?.location?.pathname === location.pathname
      ? (new URLSearchParams(navigation.location.search).get(paramKey) ?? defaultParam)
      : undefined;
  const pendingIndex = Math.max(
    0,
    items.findIndex(({ id, param }) => (param ?? id) === pendingParam),
  );
  const loading =
    tabMode &&
    waitForNavigation &&
    navigation?.state === 'loading' &&
    navigation.location?.pathname === location.pathname &&
    pendingIndex !== committedIndex;
  const visibleIndex = loading ? pendingIndex : committedIndex;
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const previousTabMode = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(min-width: 40.0625em)')
        : undefined;
    const update = () => setTabMode(mobileTabs || (media?.matches ?? true));
    update();
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, [mobileTabs]);

  useEffect(() => {
    if (!mounted) return;
    const enteredContents = !tabMode && previousTabMode.current !== false;
    previousTabMode.current = tabMode;
    if (enteredContents && committedIndex > 0) {
      panels.current[committedIndex]?.scrollIntoView({ block: 'start' });
    }
  }, [mounted, tabMode, committedIndex]);

  const previousParam = useRef(fromParam);
  useEffect(() => {
    if (previousParam.current === fromParam) return;
    previousParam.current = fromParam;
    setSelected(paramIndex);
  }, [fromParam, paramIndex]);

  const searchFor = (index: number, includeDefault = false) => {
    const params = new URLSearchParams(location.search);
    const item = items[index];
    if ((!includeDefault && index === defaultIndex) || !item) params.delete(paramKey);
    else params.set(paramKey, item.param ?? item.id);
    return `?${params.toString()}`;
  };
  const choose = (index: number) => {
    if (index === visibleIndex) return;
    if (!waitForNavigation) setSelected(index);
    void navigate(
      {
        search: searchFor(index, pageNavigation),
        ...(pageNavigation ? { hash: `#${items[index]?.id}` } : {}),
      },
      { replace: history === 'replace', preventScrollReset: true },
    );
  };
  const focusTab = (index: number) => {
    choose(index);
    refs.current[index]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (!tabMode) return;
    if (event.key === 'ArrowLeft' && visibleIndex > 0) {
      event.preventDefault();
      focusTab(visibleIndex - 1);
    }
    if (event.key === 'ArrowRight' && visibleIndex < items.length - 1) {
      event.preventDefault();
      focusTab(visibleIndex + 1);
    }
  };

  return (
    <div
      className={`govuk-tabs fphd-tabs${pageNavigation ? ' fphd-tabs--page' : ''}${mobileTabs ? ' fphd-tabs--mobile' : ''}${mounted ? '' : ' fphd-tabs--ssr'}`}
      data-module=""
    >
      <h2 className="govuk-tabs__title">{title}</h2>
      <ul className="govuk-tabs__list" role={tabMode ? 'tablist' : undefined}>
        {items.map(({ id, label }, index) => (
          <li
            className={`govuk-tabs__list-item${index === visibleIndex ? ' govuk-tabs__list-item--selected' : ''}`}
            key={id}
            role={tabMode ? 'presentation' : undefined}
          >
            {pageNavigation && !tabMode && index === visibleIndex ? (
              <span className="govuk-tabs__tab" aria-current="page">
                {label}
              </span>
            ) : (
              <a
                {...(tabMode
                  ? { role: 'tab', 'aria-controls': id, 'aria-selected': index === visibleIndex }
                  : {})}
                className="govuk-tabs__tab"
                // The explicit default value preserves the selected tab through a no-JS form round-trip.
                href={
                  linkSelection || (tabMode && waitForNavigation)
                    ? `${searchFor(index, linkSelection)}#${id}`
                    : `#${id}`
                }
                id={`tab_${id}`}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  if (!tabMode && !pageNavigation) return;
                  event.preventDefault();
                  choose(index);
                }}
                onKeyDown={onKeyDown}
                ref={(el) => {
                  refs.current[index] = el;
                }}
                tabIndex={tabMode ? (index === visibleIndex ? 0 : -1) : undefined}
              >
                {label}
              </a>
            )}
          </li>
        ))}
      </ul>
      {items.map(({ content, id }, index) => (
        <div
          {...(tabMode ? { role: 'tabpanel', 'aria-labelledby': `tab_${id}` } : {})}
          aria-busy={loading && index === visibleIndex ? true : undefined}
          className={`govuk-tabs__panel${index === visibleIndex ? ' fphd-tabs__panel--open' : ''}${mounted && tabMode && index !== visibleIndex ? ' govuk-tabs__panel--hidden' : ''}`}
          hidden={(pageNavigation || (!mounted && hasLinkedSelection)) && index !== visibleIndex}
          id={id}
          key={id}
          ref={(element) => {
            panels.current[index] = element;
          }}
        >
          {sectionHeadings ? (
            <h2 className="govuk-heading-l fphd-tabs__section-title">{items[index]?.label}</h2>
          ) : null}
          {loading && index === visibleIndex ? (
            <p className="govuk-body fphd-tabs__loading" role="status">
              Loading {items[index]?.label.toLowerCase()}…
            </p>
          ) : null}
          <div
            className="fphd-tabs__content"
            aria-hidden={loading && index === visibleIndex ? true : undefined}
            inert={loading && index === visibleIndex ? true : undefined}
          >
            {!pageNavigation || index === committedIndex ? content : null}
          </div>
        </div>
      ))}
    </div>
  );
}
