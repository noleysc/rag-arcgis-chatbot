"""Tests for the estero-fl.gov minutes discovery (no network)."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from discover import (  # noqa: E402
    canonical_by_date,
    extract_pdf_urls,
    iso_date_from_filename,
    iso_date_from_url,
    load_known,
    load_known_dates,
)

BASE = "https://estero-fl.gov/wp-content/uploads/library-ada/minutes"


def test_date_from_mmddyyyy_filename():
    assert iso_date_from_filename("12172025.pdf") == "2025-12-17"


def test_date_from_yyyymmdd_filename():
    assert iso_date_from_filename("20240514 PZDB Minutes.pdf") == "2024-05-14"


def test_date_from_month_name_filename():
    assert iso_date_from_filename("Minutes January 8, 2025.pdf") == "2025-01-08"


def test_cancellation_notices_are_skipped():
    assert iso_date_from_filename("Cancellation Notice 04082025.pdf") is None
    assert iso_date_from_filename("Rescheduled 04082025.pdf") is None


def test_invalid_date_rejected():
    assert iso_date_from_filename("99999999.pdf") is None


def test_extract_pdf_urls_dedupes():
    html = (
        f'<a href="{BASE}/2025%20Minutes/Council/12172025.pdf">a</a>'
        f'<a href="{BASE}/2025%20Minutes/Council/12172025.pdf">dup</a>'
        f'<a href="https://elsewhere.example/x.pdf">offsite</a>'
    )
    urls = extract_pdf_urls(html)
    assert len(urls) == 1
    assert urls[0].endswith("12172025.pdf")


def test_extract_pdf_urls_includes_generic_uploads_path():
    """Mid-2026 Village uploads left library-ada/minutes/ for /uploads/YYYY/MM/."""
    html = (
        '<a href="https://estero-fl.gov/wp-content/uploads/2026/09/07022026.pdf">'
        "July 2</a>"
        '<a href="https://estero-fl.gov/wp-content/uploads/2026/09/06162026-PZDB-Minutes.pdf">'
        "PZDB</a>"
        '<a href="https://estero-fl.gov/wp-content/uploads/2026/08/VOE-FLU_Updated.pdf">'
        "not minutes</a>"
    )
    urls = extract_pdf_urls(html)
    assert len(urls) == 3
    mapping, skipped = canonical_by_date(urls)
    assert mapping["2026-07-02"].endswith("07022026.pdf")
    assert mapping["2026-06-16"].endswith("06162026-PZDB-Minutes.pdf")
    assert "VOE-FLU_Updated.pdf" in skipped


def test_iso_date_from_url_repairs_filename_year_typo():
    url = f"{BASE}/2025%20Minutes/02112005%20PZDB%20Minutes.pdf"
    assert iso_date_from_filename("02112005 PZDB Minutes.pdf") == "2005-02-11"
    assert iso_date_from_url(url) == "2025-02-11"


def test_canonical_collapses_typo_filename_onto_path_year():
    # Typo listed first — preference must still keep the path-year match.
    urls = [
        f"{BASE}/2025%20Minutes/02112005%20PZDB%20Minutes.pdf",
        f"{BASE}/2025%20Minutes/02112025%20PZDB%20Minutes.pdf",
    ]
    mapping, skipped = canonical_by_date(urls)
    assert skipped == []
    assert set(mapping) == {"2025-02-11"}
    assert mapping["2025-02-11"].endswith("02112025%20PZDB%20Minutes.pdf")


def test_canonical_prefers_approved_variant():
    urls = [
        f"{BASE}/2025/Council/12172025.pdf",
        f"{BASE}/2025/Council/12172025%20Approved.pdf",
    ]
    mapping, skipped = canonical_by_date(urls)
    assert mapping["2025-12-17"].endswith("Approved.pdf")
    assert skipped == []


def test_load_known_indexes_on_disk_files_only(tmp_path):
    pdf_dir = tmp_path / "pdfs"
    pdf_dir.mkdir()
    (pdf_dir / "12172025.pdf").write_bytes(b"%PDF")
    urls_file = tmp_path / "urls.txt"
    urls_file.write_text(f"{BASE}/2025%20Minutes/Council/01152025.pdf\n", encoding="utf-8")

    known_files, known_urls = load_known(pdf_dir, urls_file)
    assert "12172025.pdf" in known_files
    # URL-only entries must NOT count as on-disk — discover should re-fetch.
    assert "01152025.pdf" not in known_files
    assert len(known_urls) == 1


def test_load_known_dates_splits_council_and_pzdb(tmp_path):
    pdf_dir = tmp_path / "pdfs"
    pdf_dir.mkdir()
    (pdf_dir / "06172026.pdf").write_bytes(b"%PDF")
    (pdf_dir / "02112025 PZDB Minutes.pdf").write_bytes(b"%PDF")
    dates = load_known_dates(pdf_dir)
    assert "2026-06-17" in dates["council"]
    assert "2025-02-11" in dates["pzdb"]
    assert "2025-02-11" not in dates["council"]
