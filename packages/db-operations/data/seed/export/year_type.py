"""The service's time periods answers for each Fingertips year type name.

The service holds them as the values in @fphd/utils/period-type. A year type alone gives an
indicator's yearly periods: single years of a year type, with a day and month for a year ending on
a specified date, or a specific date range that recurs every year. Rolling year types roll on by
the quarter or the month, and the cumulative quarter types answer that values are cumulative.
tools/data-migration/src/pholio/year-type.ts holds the same translation for the data migration,
which also reads the shapes of period each indicator's data has.
"""

TIME_PERIOD_VALUES = ["multiple-years", "single-years", "quarters", "months", "date-range"]

YEAR_TYPE_VALUES = ["calendar", "financial", "academic", "specified-end-date"]

ROLLING_FREQUENCY_VALUES = ["years", "quarters", "months"]


def _years(year_type, year_end=None, rolling=None, cumulative=False):
    return {"years": (year_type, year_end), "rolling": rolling, "cumulative": cumulative}


def _window(start, end):
    return {"date_range": (start, end), "rolling": None, "cumulative": False}


YEAR_TYPES = {
    "Calendar": _years("calendar"),
    "Financial": _years("financial"),
    "Academic": _years("academic"),
    "August-July": _years("specified-end-date", (31, 7)),
    "July-June": _years("specified-end-date", (30, 6)),
    "October-September": _years("specified-end-date", (30, 9)),
    "March-February": _years("specified-end-date", (28, 2)),
    # The Active Lives survey year runs from mid-November.
    "November-November": _years("specified-end-date", (15, 11)),
    # These run from 1 September to the end of January or February, part of a year, every year.
    "September-January": _window((1, 9), (31, 1)),
    "September-February": _window((1, 9), (28, 2)),
    "Calendar rolling year - monthly": _years("calendar", rolling="months"),
    "Calendar rolling year - quarterly": _years("calendar", rolling="quarters"),
    "Financial rolling year - monthly": _years("financial", rolling="months"),
    "Financial rolling year - quarterly": _years("financial", rolling="quarters"),
    "Financial single year cumulative quarters": _years("financial", cumulative=True),
    "Financial multi year cumulative quarters": _years("financial", cumulative=True),
    # Each value is a count on 31 March, read as a year ending that day.
    "Financial year end point": _years("specified-end-date", (31, 3)),
}

YEAR_TYPE_COLUMNS = [
    "time_periods",
    "multiple_years_count",
    "multiple_years_year_type",
    "multiple_years_end_day",
    "multiple_years_end_month",
    "year_type",
    "year_end_day",
    "year_end_month",
    "date_range_start_day",
    "date_range_start_month",
    "date_range_end_day",
    "date_range_end_month",
    "periods_rolling",
    "rolling_frequency",
    "values_cumulative",
]


def year_type_values(name):
    """The time periods columns' values for a Fingertips year type name; a name with none stops the export."""
    try:
        entry = YEAR_TYPES[name]
    except KeyError:
        raise ValueError(f"No year type value for the Fingertips year type {name!r}") from None
    values = dict.fromkeys(YEAR_TYPE_COLUMNS)
    if "years" in entry:
        year_type, year_end = entry["years"]
        day, month = year_end or (None, None)
        values.update(
            time_periods=["single-years"], year_type=year_type, year_end_day=day, year_end_month=month
        )
    else:
        (start_day, start_month), (end_day, end_month) = entry["date_range"]
        values.update(
            time_periods=["date-range"],
            date_range_start_day=start_day,
            date_range_start_month=start_month,
            date_range_end_day=end_day,
            date_range_end_month=end_month,
        )
    values.update(
        periods_rolling=entry["rolling"] is not None,
        rolling_frequency=entry["rolling"],
        values_cumulative=entry["cumulative"],
    )
    return values
