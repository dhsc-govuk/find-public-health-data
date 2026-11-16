import Button from '@not-govuk/button';
import Checkboxes from '@not-govuk/checkboxes';
import Hint from '@not-govuk/hint';
import Input from '@not-govuk/input';
import Label from '@not-govuk/label';
import Radios from '@not-govuk/radios';
import { useEffect, useId, useRef, useState } from 'react';

export interface GeographyArea {
  code: string;
  name: string;
}

export interface GeographyRegion {
  code: string;
  name: string;
  /** Codes of the region's areas, in the order they are listed. */
  areas: string[];
}

interface GeographyTreeProps {
  lookupUrl?: string | undefined;
  flat?: boolean;
  single?: boolean;
  searchLabel?: string | undefined;
  searchHint?: string | undefined;
  groupAsOne?: boolean;
  showLimitHint?: boolean;
  fallback?:
    | {
        query: string;
        level: string;
        groups: { name: string; areas: GeographyArea[] }[];
        previews?: { name: string; areas: GeographyArea[] }[];
        error: boolean;
      }
    | undefined;
  /** The display level names, offered whether or not their areas are loaded yet. */
  levels: string[];
  /** Field name for each area checkbox, so the tree works inside a plain form. */
  name: string;
  /** Field name for each level checkbox. Defaults to 'als'. */
  levelName?: string;
  /** Maximum number of area ticks allowed. Stops accepting new ticks at the cap. */
  maxAreaTicks?: number;
  onChange: (selected: string[]) => void;
  onLevelsChange: (levels: string[]) => void;
  selected: string[];
  selectedLevels: string[];
  /**
   * Flat mode only: lists the areas under their regions, each with a checkbox that ticks or
   * unticks every area in it. The region checkbox submits under `regionName`, so the page can
   * add a region's areas without scripting.
   */
  regions?: GeographyRegion[] | undefined;
  regionName?: string;
  /** Plural noun for a region's areas, for hidden text: "upper tier local authorities". */
  regionAreasNoun?: string;
}

// The page preloads one extra row to tell us whether a level exceeds the rendered cap;
// search reaches everything server-side regardless.
const CHILD_CAP = 100;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Geography picker with bounded server-loaded previews, so normal expansion is instant
 * without putting whole GP and MSOA catalogues in the page. Search asks the server for
 * everything beyond those previews. A level's own checkbox is a real `als` form control,
 * which also makes whole-level selection work without scripting.
 */
export function GeographyTree({
  levels,
  name,
  levelName = 'als',
  maxAreaTicks,
  onChange,
  onLevelsChange,
  selected,
  selectedLevels,
  fallback,
  lookupUrl = '/geographies',
  flat = false,
  single = false,
  searchLabel = 'Add geographies',
  searchHint,
  groupAsOne = false,
  showLimitHint = true,
  regions,
  regionName = 'region',
  regionAreasNoun = 'areas',
}: GeographyTreeProps) {
  const lookup = (query: string) => `${lookupUrl}${lookupUrl.includes('?') ? '&' : '?'}${query}`;
  const idPrefix = useId();
  const [query, setQuery] = useState(fallback?.query ?? '');
  const [expanded, setExpanded] = useState<string[]>(
    fallback?.level
      ? [fallback.level]
      : levels.length === 1 && fallback?.previews?.some(({ name }) => name === levels[0])
        ? levels
        : [],
  );
  const [loaded, setLoaded] = useState<Record<string, GeographyArea[] | 'loading'>>(() =>
    Object.fromEntries(
      [...(fallback?.previews ?? []), ...(fallback?.level ? fallback.groups : [])].map(
        ({ name, areas }) => [name, areas],
      ),
    ),
  );
  const [searchGroups, setSearchGroups] = useState(fallback?.groups ?? []);
  const [completedQuery, setCompletedQuery] = useState<string | null>(
    fallback?.query.trim() && !fallback.error ? fallback.query.trim() : null,
  );
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>(
    fallback?.error ? 'error' : 'idle',
  );
  const [failedLevels, setFailedLevels] = useState<string[]>(
    fallback?.error && fallback.level ? [fallback.level] : [],
  );
  const [retry, setRetry] = useState(0);
  const [closedRegions, setClosedRegions] = useState<string[]>([]);
  const [regionAnnouncement, setRegionAnnouncement] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const levelRequests = useRef(new Map<string, AbortController>());
  const resultsRef = useRef<HTMLElement>(null);

  const searching = query.trim() !== '';

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (flat) return;
    if (!searching) {
      setSearchGroups([]);
      setCompletedQuery(null);
      setSearchStatus('idle');
      return;
    }
    setSearchStatus('loading');
    const controller = new AbortController();
    searchTimer.current = setTimeout(() => {
      fetch(lookup(`q=${encodeURIComponent(query.trim())}`), { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`geographies answered ${response.status}`);
          return response.json();
        })
        .then(({ groups }: { groups: { name: string; areas: GeographyArea[] }[] }) => {
          if (!controller.signal.aborted) {
            setSearchGroups(groups);
            setCompletedQuery(query.trim());
            setSearchStatus('idle');
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchStatus('error');
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(searchTimer.current);
      controller.abort();
    };
  }, [query, searching, retry, lookupUrl, flat]);

  useEffect(
    () => () => {
      for (const controller of levelRequests.current.values()) controller.abort();
      levelRequests.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (searchStatus === 'error' && resultsRef.current) resultsRef.current.scrollTop = 0;
  }, [searchStatus]);

  const toggleExpanded = (level: string) => {
    setExpanded((current) =>
      current.includes(level) ? current.filter((value) => value !== level) : [...current, level],
    );
    if (!loaded[level]) {
      const controller = new AbortController();
      levelRequests.current.set(level, controller);
      setFailedLevels((current) => current.filter((value) => value !== level));
      setLoaded((current) => ({ ...current, [level]: 'loading' }));
      fetch(lookup(`level=${encodeURIComponent(level)}`), { signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`geographies answered ${response.status}`);
          }
          return response.json();
        })
        .then(({ areas }: { areas: GeographyArea[] }) => {
          if (!controller.signal.aborted) {
            setLoaded((current) => ({ ...current, [level]: areas }));
          }
        })
        // A failed fetch collapses the level unloaded, so expanding again retries.
        .catch(() => {
          if (controller.signal.aborted) return;
          setLoaded(({ [level]: _, ...rest }) => rest);
          setExpanded((current) => current.filter((value) => value !== level));
          setFailedLevels((current) => [...new Set([...current, level])]);
        })
        .finally(() => {
          if (levelRequests.current.get(level) === controller) levelRequests.current.delete(level);
        });
    }
  };

  const atCap = maxAreaTicks !== undefined && selected.length >= maxAreaTicks;

  const toggleArea = (code: string, checked: boolean) => {
    if (checked && atCap) return;
    onChange(
      checked ? [...new Set([...selected, code])] : selected.filter((value) => value !== code),
    );
  };

  const toggleRegion = (region: GeographyRegion, checked: boolean) => {
    const members = new Set(region.areas);
    const next = checked
      ? [...new Set([...selected, ...region.areas])]
      : selected.filter((code) => !members.has(code));
    onChange(maxAreaTicks === undefined ? next : next.slice(0, maxAreaTicks));
    setRegionAnnouncement(
      `All ${region.areas.length} ${regionAreasNoun} in ${region.name} ${checked ? 'added' : 'removed'}`,
    );
  };

  const toggleLevel = (level: string, checked: boolean) =>
    onLevelsChange(
      checked
        ? [...new Set([...selectedLevels, level])]
        : selectedLevels.filter((value) => value !== level),
    );

  const browseGroups = levels.map((level) => ({
    name: level,
    areas: flat
      ? (fallback?.previews?.find((group) => group.name === level)?.areas ?? [])
      : Array.isArray(loaded[level])
        ? (loaded[level] as GeographyArea[])
        : [],
  }));
  const showingSearchResults =
    searching &&
    (flat ||
      (completedQuery !== null &&
        (searchGroups.length > 0 || (completedQuery === query.trim() && searchStatus === 'idle'))));
  const groups =
    flat && searching
      ? browseGroups.map((group) => ({
          ...group,
          areas: group.areas.filter(
            ({ name, code }) =>
              name.toLowerCase().includes(query.trim().toLowerCase()) ||
              code.toLowerCase() === query.trim().toLowerCase(),
          ),
        }))
      : showingSearchResults
        ? searchGroups
        : browseGroups;
  const shownFor = (group: { name: string; areas: GeographyArea[] }) =>
    // Ticked areas stay rendered past the cap, so their state remains visible.
    group.areas
      .filter((_, index) => index < CHILD_CAP)
      .concat(group.areas.slice(CHILD_CAP).filter(({ code }) => selected.includes(code)));
  const regionView =
    flat && regions?.length
      ? (() => {
          const shownAreas = groups.flatMap((group) => group.areas);
          const grouped = new Set(regions.flatMap(({ areas }) => areas));
          return {
            regions: regions
              .map((region) => {
                const members = new Set(region.areas);
                return {
                  ...region,
                  open: searching || !closedRegions.includes(region.code),
                  visible: shownAreas.filter(({ code }) => members.has(code)),
                };
              })
              .filter(({ visible }) => visible.length > 0),
            ungrouped: shownAreas.filter(({ code }) => !grouped.has(code)),
          };
        })()
      : undefined;
  const visibleCodes = new Set(
    regionView
      ? [
          ...regionView.regions.flatMap(({ open, visible }) => (open ? visible : [])),
          ...regionView.ungrouped,
        ].map(({ code }) => code)
      : groups
          .filter(
            ({ name: groupName }) => flat || showingSearchResults || expanded.includes(groupName),
          )
          .flatMap((group) => shownFor(group).map(({ code }) => code)),
  );

  return (
    <div>
      <div className="govuk-form-group govuk-!-margin-bottom-2">
        <Label classModifiers="s" htmlFor={`${idPrefix}-search`}>
          {searchLabel}
        </Label>
        {searchHint ? (
          <Hint
            className={flat ? 'govuk-body-s govuk-!-margin-bottom-1' : undefined}
            id={`${idPrefix}-hint`}
          >
            {searchHint}
          </Hint>
        ) : null}
        <Input
          aria-describedby={searchHint ? `${idPrefix}-hint` : undefined}
          autoComplete="off"
          className="fphd-geo-search"
          id={`${idPrefix}-search`}
          name="geo-q"
          maxLength={100}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={searchHint ? undefined : 'Type to find geographies'}
          type="search"
          value={query}
        />
      </div>
      <noscript>
        <Button classModifiers="secondary" type="submit">
          Find geographies
        </Button>
      </noscript>
      {showLimitHint && maxAreaTicks !== undefined ? (
        <Hint className="govuk-body-s">
          Select up to {maxAreaTicks} areas. England is included for comparison.
        </Hint>
      ) : null}
      <fieldset className={`fphd-geo-alt${flat ? ' fphd-geo-alt--flat' : ''}`}>
        <legend className="govuk-visually-hidden">Geographies grouped by level</legend>
        <section
          className="fphd-geo-alt__tree"
          ref={resultsRef}
          aria-label="Geography choices"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the choices must remain keyboard-scrollable when empty.
          tabIndex={0}
        >
          <div role="status">
            {searchStatus === 'loading' ? (
              <p className="govuk-visually-hidden">Finding geographies…</p>
            ) : null}
            {searchStatus === 'error' ? (
              <p className="govuk-body-s">Geography search is not working right now. Try again.</p>
            ) : null}
            {showingSearchResults && !groups.some(({ areas }) => areas.length > 0) ? (
              <p className="govuk-body-s">
                No geographies found. Try a different name or area code.
              </p>
            ) : null}
          </div>
          {searchStatus === 'error' ? (
            <Button
              classModifiers="secondary"
              type="submit"
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </Button>
          ) : null}
          {regionView ? (
            <div className="fphd-geo-alt__children">
              <p aria-live="polite" className="govuk-visually-hidden">
                {regionAnnouncement}
              </p>
              {regionView.regions.map((region) => {
                const regionId = `${idPrefix}-region-${region.code}`;
                const picked = region.areas.filter((code) => selected.includes(code)).length;
                return (
                  <div key={region.code}>
                    <div className="fphd-geo-alt__group fphd-geo-alt__region">
                      {searching ? null : (
                        <button
                          aria-expanded={region.open}
                          className={`fphd-geo-alt__toggle${region.open ? ' fphd-geo-alt__toggle--open' : ''}`}
                          onClick={() =>
                            setClosedRegions((current) =>
                              current.includes(region.code)
                                ? current.filter((code) => code !== region.code)
                                : [...current, region.code],
                            )
                          }
                          type="button"
                        >
                          <span className="fphd-geo-alt__chevron" aria-hidden="true" />
                          <span className="govuk-visually-hidden">
                            {`${region.open ? 'Collapse' : 'Expand'} ${region.name}`}
                          </span>
                        </button>
                      )}
                      <div className="govuk-checkboxes govuk-checkboxes--small fphd-geo-alt__group-cb">
                        <div className="govuk-checkboxes__item">
                          <input
                            // A visually hidden span would make browsers name it "North East : all…".
                            aria-label={`${region.name}: all ${region.areas.length} ${regionAreasNoun}`}
                            checked={picked === region.areas.length}
                            className="govuk-checkboxes__input"
                            id={regionId}
                            name={regionName}
                            onChange={(event) => toggleRegion(region, event.currentTarget.checked)}
                            ref={(input) => {
                              if (input) {
                                input.indeterminate = picked > 0 && picked < region.areas.length;
                              }
                            }}
                            type="checkbox"
                            value={region.code}
                          />
                          <label className="govuk-label govuk-checkboxes__label" htmlFor={regionId}>
                            {region.name}
                          </label>
                        </div>
                      </div>
                    </div>
                    {region.open ? (
                      <div className="fphd-geo-alt__children fphd-geo-alt__region-areas">
                        <Checkboxes
                          id={`${regionId}-areas`}
                          label={
                            <span className="govuk-visually-hidden">
                              {`${regionAreasNoun} in ${region.name}`}
                            </span>
                          }
                          name={name}
                          onChange={(event) => toggleArea(event.target.value, event.target.checked)}
                          classModifiers="small"
                          options={region.visible.map((area) => ({
                            label: area.name,
                            checked: selected.includes(area.code),
                            value: area.code,
                            disabled: !selected.includes(area.code) && atCap,
                          }))}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {regionView.ungrouped.length ? (
                <Checkboxes
                  id={`${idPrefix}-ungrouped-areas`}
                  label={<span className="govuk-visually-hidden">Other {regionAreasNoun}</span>}
                  name={name}
                  onChange={(event) => toggleArea(event.target.value, event.target.checked)}
                  classModifiers="small"
                  options={regionView.ungrouped.map((area) => ({
                    label: area.name,
                    checked: selected.includes(area.code),
                    value: area.code,
                    disabled: !selected.includes(area.code) && atCap,
                  }))}
                />
              ) : null}
            </div>
          ) : null}
          {(regionView ? [] : groups).map((group) => {
            const AreaChoices = single ? Radios : Checkboxes;
            const isOpen = flat || showingSearchResults || expanded.includes(group.name);
            const isLoading = !showingSearchResults && loaded[group.name] === 'loading';
            const groupId = `${idPrefix}-grp-${group.name.toLowerCase().replace(/\W+/g, '-')}`;
            const shown = shownFor(group);
            // The component's own `selected` is uncontrolled; `checked` rides the option
            // spread onto the input so React owns the state.
            const levelOption = {
              label: groupAsOne ? (
                <>
                  <span className="govuk-visually-hidden">All </span>
                  {group.name}
                  <span className="govuk-visually-hidden"> (as one group)</span>
                </>
              ) : (
                group.name
              ),
              checked: selectedLevels.includes(group.name),
              value: group.name,
            };

            return (
              <div key={group.name}>
                {flat ? null : (
                  <div
                    className={`fphd-geo-alt__group${single ? ' fphd-geo-alt__group--single' : ''}`}
                  >
                    {showingSearchResults ? null : (
                      <button
                        aria-expanded={isOpen}
                        className={`fphd-geo-alt__toggle${isOpen ? ' fphd-geo-alt__toggle--open' : ''}`}
                        onClick={() => toggleExpanded(group.name)}
                        type="button"
                      >
                        <span className="fphd-geo-alt__chevron" aria-hidden="true" />
                        <span
                          className={
                            single ? 'fphd-geo-alt__toggle-label' : 'govuk-visually-hidden'
                          }
                        >
                          {single ? group.name : `${isOpen ? 'Collapse' : 'Expand'} ${group.name}`}
                        </span>
                      </button>
                    )}
                    {single ? null : (
                      <Checkboxes
                        className="fphd-geo-alt__group-cb"
                        classModifiers="small"
                        id={groupId}
                        label={<span className="govuk-visually-hidden">All of {group.name}</span>}
                        name={levelName}
                        onChange={(event) => toggleLevel(group.name, event.currentTarget.checked)}
                        options={[levelOption]}
                      />
                    )}
                  </div>
                )}

                <noscript>
                  <Button
                    className="govuk-!-margin-bottom-2"
                    classModifiers="secondary"
                    name="geo-level"
                    type="submit"
                    value={group.name}
                  >
                    Show areas in {group.name}
                  </Button>
                </noscript>
                {failedLevels.includes(group.name) ? (
                  <p className="govuk-body-s" role="status">
                    Could not load {group.name}. Expand it to try again.
                  </p>
                ) : null}

                <p aria-live="polite" className="govuk-visually-hidden">
                  {isLoading ? `Loading ${group.name}…` : ''}
                </p>
                {isOpen ? (
                  <div
                    className={`fphd-geo-alt__children${single ? ' fphd-geo-alt__children--radios' : ''}`}
                  >
                    {isLoading ? null : (
                      <>
                        <AreaChoices
                          id={`${groupId}-areas`}
                          label={
                            <span className="govuk-visually-hidden">Areas in {group.name}</span>
                          }
                          name={name}
                          onChange={(event) =>
                            single
                              ? onChange([event.target.value])
                              : toggleArea(event.target.value, event.target.checked)
                          }
                          classModifiers="small"
                          options={shown.map((area) => ({
                            label: area.name,
                            checked: selected.includes(area.code),
                            value: area.code,
                            disabled: !single && !selected.includes(area.code) && atCap,
                          }))}
                        />
                        {group.areas.length > CHILD_CAP ? (
                          <p className="govuk-body-s fphd-geo-alt__more">
                            Showing the first {CHILD_CAP} — search to find the rest
                          </p>
                        ) : null}
                        {!single && atCap ? (
                          <p className="govuk-body-s fphd-geo-alt__more">
                            You have selected the maximum number of areas.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      </fieldset>
      {/* Ticks hidden by collapse, a search, or the cap must still submit. */}
      {(single ? [] : selectedLevels)
        .filter((level) => !groups.some(({ name }) => name === level))
        .map((level) => (
          <input key={level} name={levelName} type="hidden" value={level} />
        ))}
      {(single ? [] : selected)
        .filter((code) => !visibleCodes.has(code))
        .map((code) => (
          <input key={code} name={name} type="hidden" value={code} />
        ))}
    </div>
  );
}
