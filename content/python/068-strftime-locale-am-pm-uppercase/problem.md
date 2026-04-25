---
slug: strftime-locale-am-pm-uppercase
track: python
orderIndex: 68
title: strptime Locale Mismatch on Non-English Host
difficulty: medium
tags:
  - correctness
  - datetime
  - locale
language: python
---

## Context

This parser lives in `integrations/legacy_feed_parser.py` and ingests timestamps from a third-party vendor feed that uses 12-hour clock notation. The feed always sends English-formatted timestamps like `"03/15/2024 02:45 PM"`. The parser runs fine on developer laptops (all set to `en_US` locales) and on the CI servers.

After deploying to production servers provisioned with a `fr_FR.UTF-8` locale, roughly half of all feed records fail to parse with `ValueError: time data '03/15/2024 02:45 PM' does not match format '%m/%d/%Y %I:%M %p'`. The other half (AM records) sometimes succeed inconsistently depending on the Python version and libc version on the host.

## Buggy code

```python
from datetime import datetime

def parse_vendor_timestamp(raw: str) -> datetime:
    """
    Parses timestamps like '03/15/2024 02:45 PM' from the vendor feed.
    """
    return datetime.strptime(raw.strip(), "%m/%d/%Y %I:%M %p")
```
