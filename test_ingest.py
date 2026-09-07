"""
Unit tests for the CreditLens validation gate.

Covers the three pure functions that decide whether a row from a GP report
is trustworthy enough to enter the database: to_float, parse_date, and the
range gate inside validate_and_collect.
"""
import threading
import time

import pandas as pd
import pytest

import ingest

from ingest import (
    CANONICAL,
    RANGES,
    parse_date,
    to_float,
    validate_and_collect,
    validate_dataframe,
)


# --------------------------------------------------------------------------
# to_float — GPs report numbers as text, in local conventions
# --------------------------------------------------------------------------

class TestToFloat:

    def test_plain_decimal(self):
        assert to_float("97.4") == 97.4

    def test_german_decimal_comma(self):
        """A German GP writes 97,4 where an English one writes 97.4."""
        assert to_float("97,4") == 97.4

    def test_integer_string(self):
        assert to_float("100") == 100.0

    def test_already_numeric(self):
        assert to_float(4.2) == 4.2
        assert to_float(7) == 7.0

    def test_surrounding_whitespace(self):
        assert to_float("  8.1  ") == 8.1

    def test_negative(self):
        assert to_float("-1.5") == -1.5

    @pytest.mark.parametrize("blank", ["", "   ", None])
    def test_blank_is_none(self, blank):
        assert to_float(blank) is None

    @pytest.mark.parametrize("missing", ["n/a", "N/A", "na", "NA", "none",
                                         "None", "-", "nan", "NaN"])
    def test_missing_markers_are_none(self, missing):
        """Every GP spells 'no data' differently. All of them mean None."""
        assert to_float(missing) is None

    def test_pandas_nan_is_none(self):
        assert to_float(float("nan")) is None

    def test_unparseable_text_is_none(self):
        assert to_float("see footnote 3") is None

    def test_does_not_raise_on_garbage(self):
        """The gate must reject bad input, never crash the upload."""
        for junk in ["12.3.4", "€100", "1,2,3", "--", "?"]:
            assert to_float(junk) is None


# --------------------------------------------------------------------------
# parse_date — three formats arrive in practice
# --------------------------------------------------------------------------

class TestParseDate:

    def test_iso(self):
        assert parse_date("2025-09-30") == "2025-09-30"

    def test_german_dotted(self):
        assert parse_date("30.09.2025") == "2025-09-30"

    @pytest.mark.parametrize("text,expected", [
        ("Q1 2025", "2025-03-31"),
        ("Q2 2025", "2025-06-30"),
        ("Q3 2025", "2025-09-30"),
        ("Q4 2025", "2025-12-31"),
    ])
    def test_quarter_maps_to_quarter_end(self, text, expected):
        """'Q3 2025' is a period, not a date. It must land on the period end
        so that two GPs reporting the same quarter sort together."""
        assert parse_date(text) == expected

    def test_quarter_and_iso_agree(self):
        """The same quarter from two different vendors must normalise
        to one identical key — this is what makes the join work."""
        assert parse_date("Q3 2025") == parse_date("30.09.2025") == "2025-09-30"

    def test_surrounding_whitespace(self):
        assert parse_date("  Q3 2025  ") == "2025-09-30"

    @pytest.mark.parametrize("bad", ["Q5 2025", "Q0 2025", "2025-13-01",
                                     "September 2025", "30/09/2025", "", "TBD"])
    def test_unparseable_is_none(self, bad):
        assert parse_date(bad) is None


# --------------------------------------------------------------------------
# The range gate — plausibility, not just type-correctness
# --------------------------------------------------------------------------

def _row(**overrides):
    """A well-formed row; override one field per test."""
    base = {
        "fund_id": "F001",
        "reporting_date": "Q3 2025",
        "nav_eur_m": "120.5",
        "yield_pct": "7.2",
        "leverage": "4.1",
        "coverage": "2.6",
        "default_rate_pct": "0.8",
    }
    base.update(overrides)
    return base


def _df(*rows):
    return pd.DataFrame(list(rows), columns=CANONICAL)


class TestRangeGate:

    def test_clean_row_passes(self):
        clean, rejected = validate_and_collect(_df(_row()), "test.csv")
        assert len(clean) == 1
        assert rejected == []

    def test_clean_row_is_normalised(self):
        """Dates become ISO strings and numbers become floats on the way through."""
        clean, _ = validate_and_collect(_df(_row()), "test.csv")
        fund_id, date, nav, yld, lev, cov, dflt = clean[0]
        assert date == "2025-09-30"
        assert isinstance(nav, float) and nav == 120.5
        assert isinstance(lev, float) and lev == 4.1

    def test_decimal_unit_error_is_caught(self):
        """The headline case: F004 reported yield as 0.118 (a fraction) where
        every peer reports 7-10 (a percentage). The row is perfectly
        well-formed — only a plausibility check catches it."""
        clean, rejected = validate_and_collect(
            _df(_row(fund_id="F004", yield_pct="0.118")), "test.csv")
        assert clean == []
        assert len(rejected) == 1
        assert "yield_pct" in rejected[0]["reason"]
        assert "unit error" in rejected[0]["reason"]

    def test_rejection_reason_is_human_readable(self):
        """An analyst has to act on this, so the reason names the column,
        the value, and the expected range."""
        _, rejected = validate_and_collect(
            _df(_row(leverage="47.0")), "test.csv")
        reason = rejected[0]["reason"]
        assert "leverage" in reason
        assert "47.0" in reason

    def test_rejection_preserves_source_and_original_row(self):
        """The receipt has to be traceable back to the file it came from."""
        _, rejected = validate_and_collect(
            _df(_row(yield_pct="0.118")), "gp_alpha_q3.csv")
        assert rejected[0]["source_file"] == "gp_alpha_q3.csv"
        assert rejected[0]["yield_pct"] == "0.118"

    @pytest.mark.parametrize("col", list(RANGES))
    def test_lower_bound_is_inclusive(self, col):
        lo, _ = RANGES[col]
        clean, rejected = validate_and_collect(
            _df(_row(**{col: str(lo)})), "test.csv")
        assert len(clean) == 1, f"{col} at its floor {lo} should pass"

    @pytest.mark.parametrize("col", list(RANGES))
    def test_upper_bound_is_inclusive(self, col):
        _, hi = RANGES[col]
        clean, rejected = validate_and_collect(
            _df(_row(**{col: str(hi)})), "test.csv")
        assert len(clean) == 1, f"{col} at its ceiling {hi} should pass"

    @pytest.mark.parametrize("col", list(RANGES))
    def test_just_below_floor_is_rejected(self, col):
        lo, _ = RANGES[col]
        clean, rejected = validate_and_collect(
            _df(_row(**{col: str(lo - 0.01)})), "test.csv")
        assert clean == []
        assert col in rejected[0]["reason"]

    def test_missing_value_is_rejected(self):
        clean, rejected = validate_and_collect(
            _df(_row(coverage="n/a")), "test.csv")
        assert clean == []
        assert "coverage" in rejected[0]["reason"]

    def test_unparseable_date_is_rejected(self):
        clean, rejected = validate_and_collect(
            _df(_row(reporting_date="TBD")), "test.csv")
        assert clean == []
        assert "date" in rejected[0]["reason"]

    def test_bad_row_does_not_block_good_rows(self):
        """One unusable row must not cost the analyst the rest of the file."""
        clean, rejected = validate_and_collect(
            _df(_row(fund_id="F001"),
                _row(fund_id="F004", yield_pct="0.118"),
                _row(fund_id="F002")),
            "test.csv")
        assert len(clean) == 2
        assert len(rejected) == 1
        assert {r[0] for r in clean} == {"F001", "F002"}

    def test_exact_duplicate_is_dropped(self):
        clean, rejected = validate_and_collect(
            _df(_row(), _row()), "test.csv")
        assert len(clean) == 1
        assert len(rejected) == 1
        assert "duplicate" in rejected[0]["reason"]

    def test_empty_file_is_handled(self):
        clean, rejected = validate_and_collect(_df(), "empty.csv")
        assert clean == []
        assert rejected == []


# --------------------------------------------------------------------------
# validate_dataframe — the entry point the upload endpoint calls
# --------------------------------------------------------------------------

class TestValidateDataframe:

    def test_returns_canonical_columns(self):
        clean_df, _ = validate_dataframe(_df(_row()), "test.csv")
        assert list(clean_df.columns) == CANONICAL

    def test_rejected_frame_empty_when_all_clean(self):
        _, rejected_df = validate_dataframe(_df(_row()), "test.csv")
        assert rejected_df.empty

    def test_no_state_leaks_between_sequential_calls(self):
        first_clean, first_rejected = validate_dataframe(
            _df(_row(yield_pct="0.118")), "first.csv")
        assert len(first_rejected) == 1

        second_clean, second_rejected = validate_dataframe(
            _df(_row()), "second.csv")
        assert len(second_clean) == 1
        assert second_rejected.empty, "second upload inherited the first's rejects"

    def test_repeated_calls_are_identical(self):
        """Same input, same output, every time — no accumulating state."""
        results = [len(validate_dataframe(_df(_row(yield_pct="0.118")), "x.csv")[1])
                   for _ in range(3)]
        assert results == [1, 1, 1]


# --------------------------------------------------------------------------
# Concurrency regression
# --------------------------------------------------------------------------

class TestConcurrentUploads:
    """validate_and_collect used to append rejections to a module-level list.
    Sequential calls were safe, because validate_dataframe cleared the list on
    entry. Two uploads running at the same time were not: whichever cleared it
    second wiped the first one's rejections, and both receipts then described
    the same file. The rejection list is now owned by the call, not the module.
    """

    def _slow_parse_date(self, original):
        """Force the two workers to interleave rather than run back to back."""
        def wrapper(val):
            time.sleep(0.01)
            return original(val)
        return wrapper

    def test_two_uploads_get_their_own_receipts(self, monkeypatch):
        monkeypatch.setattr(
            ingest, "parse_date", self._slow_parse_date(ingest.parse_date))

        results = {}

        def worker(tag, df):
            clean, rejected = ingest.validate_dataframe(df, f"{tag}.csv")
            results[tag] = (clean, rejected)

        # 'dirty' has three bad rows; 'clean' has none.
        dirty = _df(_row(yield_pct="0.118"),
                    _row(fund_id="F002", leverage="47.0"),
                    _row(fund_id="F003", reporting_date="TBD"))
        spotless = _df(_row(fund_id="F005"), _row(fund_id="F006"))

        threads = [threading.Thread(target=worker, args=("dirty", dirty)),
                   threading.Thread(target=worker, args=("spotless", spotless))]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        dirty_clean, dirty_rejected = results["dirty"]
        spotless_clean, spotless_rejected = results["spotless"]

        assert len(dirty_rejected) == 3, "the dirty upload lost its rejections"
        assert spotless_rejected.empty, "the clean upload was handed someone else's rejections"
        assert len(spotless_clean) == 2

        # Every rejection must name the file it actually came from.
        assert set(dirty_rejected["source_file"]) == {"dirty.csv"}