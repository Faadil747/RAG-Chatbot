"""
Deterministic computation of total professional experience in years.

We never trust the LLM to do this arithmetic. Instead we parse the
startDate/endDate strings the Resume Parsing Agent extracted (which may be
in a variety of human formats: "Jan 2020", "January 2020", "2020-01",
"2020/01", "2020", or "Present"/"Current"/"Till Date"), convert each
experience entry into a (start_month_index, end_month_index) interval
counted in absolute months since year 0, merge overlapping/adjacent
intervals so concurrent jobs are not double-counted, and sum the total.
"""
from __future__ import annotations

import re
from datetime import date

_MONTH_NAMES = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

_PRESENT_WORDS = {
    "present", "current", "currently", "now", "till date", "to date",
    "ongoing", "date", "till now", "today",
}

_NUMERIC_DATE_RE = re.compile(r"^(?P<y1>\d{4})[-/](?P<m1>\d{1,2})$")
_MONTH_YEAR_RE = re.compile(
    r"^(?P<mon>[A-Za-z]+)\.?\s+(?P<year>\d{4})$"
)
_YEAR_MONTH_TEXT_RE = re.compile(
    r"^(?P<year>\d{4})\s+(?P<mon>[A-Za-z]+)\.?$"
)
_YEAR_ONLY_RE = re.compile(r"^(?P<year>\d{4})$")


def _parse_single_date(raw: str | None) -> tuple[int, int] | None:
    """Parse a date-ish string into (year, month). Returns None if unparseable."""
    if not raw:
        return None
    text = raw.strip().lower().rstrip(".")
    if not text:
        return None

    if text in _PRESENT_WORDS:
        today = date.today()
        return today.year, today.month

    m = _NUMERIC_DATE_RE.match(text)
    if m:
        return int(m.group("y1")), int(m.group("m1"))

    m = _MONTH_YEAR_RE.match(text)
    if m:
        mon = _MONTH_NAMES.get(m.group("mon").lower())
        if mon:
            return int(m.group("year")), mon

    m = _YEAR_MONTH_TEXT_RE.match(text)
    if m:
        mon = _MONTH_NAMES.get(m.group("mon").lower())
        if mon:
            return int(m.group("year")), mon

    m = _YEAR_ONLY_RE.match(text)
    if m:
        return int(m.group("year")), 1

    # Last resort: pull a 4-digit year and an optional month name out of the string.
    year_match = re.search(r"\d{4}", text)
    if year_match:
        year = int(year_match.group(0))
        for name, num in _MONTH_NAMES.items():
            if re.search(rf"\b{name}\b", text):
                return year, num
        return year, 1

    return None


def _to_month_index(year: int, month: int) -> int:
    return year * 12 + (month - 1)


def compute_duration_months(start_raw: str | None, end_raw: str | None) -> int:
    """Deterministic single-entry duration in months, used to overwrite the
    LLM's rough per-entry `durationMonths` estimate."""
    start = _parse_single_date(start_raw)
    if start is None:
        return 0
    end = _parse_single_date(end_raw) if end_raw else None
    if end is None:
        today = date.today()
        end = (today.year, today.month)

    start_idx = _to_month_index(*start)
    end_idx = _to_month_index(*end)
    if end_idx < start_idx:
        start_idx, end_idx = end_idx, start_idx
    return max(0, end_idx - start_idx + 1)


_RELATIVE_DURATION_RE = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|mos?)\b", re.IGNORECASE
)


def find_relative_duration_mentions(resume_text: str) -> list[int]:
    """Scan raw resume text top-to-bottom for relative duration mentions
    ("2 yrs", "18 months", ...) and return each as a month count, in the
    order they appear. Used as a deterministic backfill when the Resume
    Parsing Agent leaves an experience entry with no dates AND durationMonths
    of 0 -- an occasional LLM instruction-following miss rather than a case
    where the resume genuinely has no duration signal at all."""
    months: list[int] = []
    for value_raw, unit in _RELATIVE_DURATION_RE.findall(resume_text or ""):
        value = float(value_raw)
        months.append(round(value if unit.lower().startswith(("month", "mo")) else value * 12))
    return months


def backfill_missing_durations(experience: list[dict], resume_text: str) -> list[dict]:
    """Mutates nothing -- returns a new list where any entry with no dates
    and no durationMonths gets one filled in from a relative-duration mention
    found in the raw text, matched positionally in resume order."""
    needs_backfill = [
        i
        for i, e in enumerate(experience or [])
        if not (e.get("startDate") or e.get("endDate")) and not e.get("durationMonths")
    ]
    if not needs_backfill:
        return experience

    mentions = find_relative_duration_mentions(resume_text)
    if not mentions:
        return experience

    patched = [dict(e) for e in experience]
    for idx, months in zip(needs_backfill, mentions):
        patched[idx]["durationMonths"] = months
    return patched


def compute_total_experience_years(experience: list[dict]) -> float:
    """Sum non-overlapping months across all dated experience entries, plus the
    stated duration of any entry that has no parseable calendar dates at all
    (common in resumes that say "2 yrs" per role instead of real dates) ->
    years (1 decimal).

    Undated entries can't be checked for overlap against the dated timeline,
    so their durationMonths are added on top rather than merged -- the best
    available signal, since the alternative is silently treating them as 0.
    """
    intervals: list[tuple[int, int]] = []
    undated_months = 0

    for entry in experience or []:
        start_raw = entry.get("startDate") or entry.get("start_date")
        end_raw = entry.get("endDate") or entry.get("end_date")

        start = _parse_single_date(start_raw)
        if start is None:
            duration = entry.get("durationMonths") or entry.get("duration_months") or 0
            if isinstance(duration, (int, float)) and duration > 0:
                undated_months += int(duration)
            continue
        end = _parse_single_date(end_raw) if end_raw else None
        if end is None:
            # No usable end date: treat as ongoing (present) rather than dropping it.
            today = date.today()
            end = (today.year, today.month)

        start_idx = _to_month_index(*start)
        end_idx = _to_month_index(*end)
        if end_idx < start_idx:
            start_idx, end_idx = end_idx, start_idx
        # inclusive of the end month
        intervals.append((start_idx, end_idx + 1))

    dated_months = 0
    if intervals:
        intervals.sort(key=lambda iv: iv[0])
        merged: list[list[int]] = [list(intervals[0])]
        for s, e in intervals[1:]:
            last = merged[-1]
            if s <= last[1]:
                last[1] = max(last[1], e)
            else:
                merged.append([s, e])
        dated_months = sum(e - s for s, e in merged)

    years = round((dated_months + undated_months) / 12, 1)
    return max(0.0, years)
