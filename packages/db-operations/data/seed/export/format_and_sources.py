"""The service's indicator format and sources for one Fingertips indicator.

Fingertips holds a definition and a source for its numerator and its denominator, and one
disclosure control answer for the whole indicator. The seed load gives the committed seed's
versions the service's answers from them (applyLegacyFormatAndSources in @fphd/db-operations),
and this is the same rule for a script that writes versions straight to a database: both sides
make a numerator and denominator, with the disclosure control on the numerator and the
denominator's unanswered; one side makes a single data value, with the disclosure control; and
neither leaves the question unanswered. Fingertips' "no" becomes "not-applicable", the answer the
service offers in its place.
"""


def is_blank(text):
    return text is None or text.strip() == ""


def is_present(side):
    """A side with a definition or a source; a blank name, which names no source, is none."""
    return not is_blank(side["definition"]) or not is_blank(side["source"])


def format_and_sources(numerator, denominator, disclosure_control, disclosure_control_detail):
    """Each figure the indicator has, with its disclosure control; None for one it lacks."""
    answer = None if is_blank(disclosure_control) else disclosure_control.strip()
    detail = disclosure_control_detail if answer == "yes" else None
    if answer == "no":
        answer = "not-applicable"
    has_numerator = is_present(numerator)
    has_denominator = is_present(denominator)

    if has_numerator and has_denominator:
        return {
            "has_numerator_denominator": True,
            "numerator": {**numerator, "disclosure_control": answer, "disclosure_control_detail": detail},
            "denominator": {
                **denominator,
                "disclosure_control": None,
                "disclosure_control_detail": None,
            },
            "data_value": None,
        }

    side = numerator if has_numerator else denominator if has_denominator else None
    return {
        "has_numerator_denominator": None if side is None else False,
        "numerator": None,
        "denominator": None,
        "data_value": None
        if side is None
        else {**side, "disclosure_control": answer, "disclosure_control_detail": detail},
    }
