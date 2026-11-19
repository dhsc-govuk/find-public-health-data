"""The service's notes and caveats answers for Fingertips' three prose fields.

Fingertips holds disclosure control, caveats and notes as prose alone, where the service
asks whether each applies and keeps the prose as the detail of a yes. Prose that says no
more than "none" or "not applicable" in one of the forms in VOCABULARY becomes that answer
and is dropped; any other prose is kept as the detail of a yes. Blank prose leaves the
question unanswered, since Fingertips recorded no answer, and rounding, which Fingertips
has no field for, stays unanswered too.
"""

import re

# Prose that is an answer in itself, matched whole once normalised; the same list as the
# vocabulary in migration 0022, so a change here is made there too.
VOCABULARY = [
    ("disclosure_control", "none applied", "no"),
    ("disclosure_control", "not applied", "no"),
    ("disclosure_control", "none", "no"),
    ("disclosure_control", "none required", "no"),
    ("disclosure_control", "none needed", "no"),
    ("disclosure_control", "not required", "no"),
    ("disclosure_control", "no disclosure control applied", "no"),
    ("disclosure_control", "no disclosure control required", "no"),
    ("disclosure_control", "no disclosure control was required", "no"),
    (
        "disclosure_control",
        "no disclosure control applied. data source is in the public domain",
        "no",
    ),
    ("disclosure_control", "not applicable", "not-applicable"),
    ("disclosure_control", "n/a", "not-applicable"),
    ("caveats", "none", "no"),
    ("caveats", "n/a", "no"),
    ("notes", "none", "no"),
    ("notes", "n/a", "no"),
]

# Each Fingertips prose column: the service's answer column, how it stores yes and no, and
# the detail column the prose of a yes moves to.
PROSE_ANSWERS = {
    "disclosure_control": (
        "disclosure_control",
        {"yes": "yes", "no": "no", "not-applicable": "not-applicable"},
        "disclosure_control_detail",
    ),
    "caveats": ("has_caveats", {"yes": "true", "no": "false"}, "caveats_detail"),
    "notes": ("has_other_notes", {"yes": "true", "no": "false"}, "other_notes_detail"),
}

# The version columns the translation writes, in the order the table declares them.
NOTES_AND_CAVEATS_COLUMNS = [
    "disclosure_control",
    "disclosure_control_detail",
    "has_rounding",
    "rounding_detail",
    "has_caveats",
    "caveats_detail",
    "has_other_notes",
    "other_notes_detail",
]

# Blank as the migration judges it, which trims these characters alone.
BLANK = " \t\r\n"


def normalised(text):
    """Markup stripped, whitespace collapsed and trimmed, lower-cased, one full stop dropped."""
    text = re.sub(r"<[^>]*>", " ", text)
    text = re.sub(r"[ \t\r\n]+", " ", text).strip(" ").lower()
    return text[:-1] if text.endswith(".") else text


def prose_answer(source, text):
    """The answer the prose of one Fingertips column gives: its own, or yes."""
    key = normalised(text)
    return next(
        (answer for column, prose, answer in VOCABULARY if column == source and prose == key),
        "yes",
    )


def notes_and_caveats(prose):
    """The answer and detail columns for a row's Fingertips prose; None is unanswered."""
    columns = dict.fromkeys(NOTES_AND_CAVEATS_COLUMNS)
    for source, (answer_column, stored, detail_column) in PROSE_ANSWERS.items():
        text = (prose.get(source) or "").strip(BLANK) or None
        if text is None:
            continue
        answer = prose_answer(source, text)
        columns[answer_column] = stored[answer]
        columns[detail_column] = text if answer == "yes" else None
    return columns


def sql_string(value):
    return "'" + value.replace("'", "''") + "'"


def notes_and_caveats_select(alias):
    """The same translation as a SELECT list over a table holding the Fingertips columns."""
    expressions = {column: f"NULL AS {column}" for column in NOTES_AND_CAVEATS_COLUMNS}
    for source, (answer_column, stored, detail_column) in PROSE_ANSWERS.items():
        text = f"nullif(btrim({alias}.{source}, E' \\t\\r\\n'), '')"
        key = (
            "regexp_replace(lower(btrim(regexp_replace(regexp_replace("
            f"{text}, '<[^>]*>', ' ', 'g'), E'[ \\t\\r\\n]+', ' ', 'g'))), '\\.$', '')"
        )
        answers = [(prose, answer) for column, prose, answer in VOCABULARY if column == source]
        whens = " ".join(
            f"WHEN {key} = {sql_string(prose)} THEN {sql_string(stored[answer])}"
            for prose, answer in answers
        )
        known = ", ".join(sql_string(prose) for prose, _ in answers)
        expressions[answer_column] = (
            f"CASE WHEN {text} IS NULL THEN NULL {whens} "
            f"ELSE {sql_string(stored['yes'])} END AS {answer_column}"
        )
        expressions[detail_column] = (
            f"CASE WHEN {key} IN ({known}) THEN NULL ELSE {text} END AS {detail_column}"
        )
    return ", ".join(expressions[column] for column in NOTES_AND_CAVEATS_COLUMNS)
