"""The service's period type, year type and year end for each Fingertips year type name.

The service holds them as the values in @fphd/utils/period-type, with a day and month for a
year ending on a specified date; the exports translate Pholio's year type rows to them.
Migrations 0034 and 0036 hold the same translation for databases that already had the
Fingertips rows.
"""

PERIOD_TYPE_VALUES = ["years", "quarters", "months"]

YEAR_TYPE_VALUES = ["calendar", "financial", "academic", "rolling", "specified-end-date"]

# Period type, year type, and the (day, month) a year ending on a specified date ends on.
YEAR_TYPES = {
    "Calendar": ("years", "calendar", None),
    "Financial": ("years", "financial", None),
    "Academic": ("years", "academic", None),
    "August-July": ("years", "specified-end-date", (31, 7)),
    "July-June": ("years", "specified-end-date", (30, 6)),
    "October-September": ("years", "specified-end-date", (30, 9)),
    "March-February": ("years", "specified-end-date", (28, 2)),
    # The Active Lives survey year runs from mid-November.
    "November-November": ("years", "specified-end-date", (15, 11)),
    "September-January": ("years", "specified-end-date", (31, 1)),
    "September-February": ("years", "specified-end-date", (28, 2)),
    "Calendar rolling year - monthly": ("years", "rolling", None),
    "Calendar rolling year - quarterly": ("years", "rolling", None),
    "Financial rolling year - monthly": ("years", "rolling", None),
    "Financial rolling year - quarterly": ("years", "rolling", None),
    "Financial single year cumulative quarters": ("quarters", "financial", None),
    "Financial multi year cumulative quarters": ("quarters", "financial", None),
    "Financial year end point": ("years", "specified-end-date", (31, 3)),
}

YEAR_TYPE_COLUMNS = ["period_type", "year_type", "year_end_day", "year_end_month"]


def year_type_values(name):
    """The four columns' values for a Fingertips year type name; a name with none stops the export."""
    try:
        period_type, year_type, year_end = YEAR_TYPES[name]
    except KeyError:
        raise ValueError(f"No year type value for the Fingertips year type {name!r}") from None
    day, month = year_end or (None, None)
    return {
        "period_type": period_type,
        "year_type": year_type,
        "year_end_day": day,
        "year_end_month": month,
    }


def _sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + value.replace("'", "''") + "'"


def year_type_select(year_type_id):
    """The same translation as a SELECT list, from an expression holding Pholio's year type id."""
    name = f"(SELECT name FROM year_type WHERE id = {year_type_id})"
    values = {source: year_type_values(source) for source in YEAR_TYPES}
    return ", ".join(
        f"CASE {name} "
        + " ".join(
            f"WHEN {_sql_literal(source)} THEN {_sql_literal(columns[column])}"
            for source, columns in values.items()
        )
        + f" END AS {column}"
        for column in YEAR_TYPE_COLUMNS
    )
