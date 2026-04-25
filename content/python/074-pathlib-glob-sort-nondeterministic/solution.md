## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Glob Results Are Not Sorted
# ------------------------------------------------------------------------

from pathlib import Path
import csv

def process_daily_files(data_dir: str) -> None:
    data_path = Path(data_dir)
    # CHANGE 1: wrap glob() in sorted() so files are processed in ascending filename (chronological) order instead of arbitrary filesystem order
    files = sorted(data_path.glob("*.csv"))

    for csv_file in files:
        # CHANGE 2: skip anything that is not a regular file so a .csv-named directory does not cause an IsADirectoryError
        if not csv_file.is_file():
            continue
        with open(csv_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                insert_row(row)  # inserts into staging DB

def insert_row(row: dict) -> None:
    pass  # stub
```

## Explanation

### Issue 1: Glob Returns Unsorted File Order

**Problem:** `Path.glob()` does not guarantee any particular ordering — it reflects whatever order the underlying OS directory iterator returns, which varies by filesystem, kernel version, and inode layout. Data engineers see foreign-key violations roughly once a week because on those runs the OS happens to return a later date's file before an earlier one, so child records are inserted before their parent rows exist.

**Fix:** Replace `data_path.glob("*.csv")` with `sorted(data_path.glob("*.csv"))` at the `CHANGE 1` site. `sorted()` compares `Path` objects lexicographically by their full string representation, and because the filenames are ISO-8601 dates (`2024-01-01.csv`, `2024-01-02.csv`, …), lexicographic order is identical to chronological order.

**Explanation:** `Path.glob()` internally calls `os.scandir()`, which yields entries in the order the filesystem's directory block stores them. On ext4 with `dir_index` (htree), entries are stored by hash, not by name. On APFS or NFS-mounted shares the order differs again. Because this ordering is not deterministic across runs, the bug appears intermittently rather than every run. Sorting the resulting list once before iteration costs O(n log n) on a small number of daily files and guarantees that `2024-01-01.csv` is always processed before `2024-01-02.csv`. One pitfall: if filenames ever stop following ISO-8601 (e.g. `jan-1-2024.csv`), lexicographic sort no longer equals chronological sort — a more robust approach would parse the date from each filename and sort by the resulting `datetime` object.

---

### Issue 2: Glob May Match Non-Regular Files

**Problem:** `*.csv` matches any directory entry whose name ends in `.csv`, including a subdirectory named `archive.csv`. Passing a directory path to `open()` raises `IsADirectoryError` on Linux (and a `PermissionError` on macOS), producing a confusing traceback that obscures the real intent of the code.

**Fix:** Add `if not csv_file.is_file(): continue` at the `CHANGE 2` site, immediately before the `open()` call. This skips symlinks-to-directories, bare directories, device nodes, or any other non-regular-file entry that happens to match the glob pattern.

**Explanation:** `Path.glob()` is a pure name-pattern filter; it does not check the type of the filesystem object. In a data-drop directory that has been around for months it is common for operators to create subdirectories like `processed.csv` or `bad_rows.csv` as ad-hoc organisation. Without the guard, the first such directory encountered halts the entire ETL job with a non-obvious error. `Path.is_file()` returns `True` only for regular files and `False` for directories, broken symlinks, and special files, so adding this one-line check makes the loop robust to directory clutter without changing behavior for any legitimate CSV file.
