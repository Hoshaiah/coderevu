---
slug: tempfile-predictable-name
track: python
orderIndex: 12
title: Predictable Temp File Path Race
difficulty: hard
tags:
  - resource-management
  - security
  - concurrency
language: python
---

## Context

This function lives in `tasks/report_renderer.py` in a Django application that generates PDF reports by writing intermediate HTML to a temp file, calling `wkhtmltopdf` as a subprocess, and reading the resulting PDF back. The app runs as a shared service where multiple users can trigger report generation simultaneously.

The security team flagged a TOCTOU (time-of-check to time-of-use) concern during a code review. On a multi-tenant system, a malicious local user could create a symlink at the predictable path before the function opens it, causing the process to write into an arbitrary file the symlink points to. Separate from the security issue, the temp files are also not cleaned up when an exception is raised mid-way through the function.

The original developer built this before the team adopted a security review process and did not know about `tempfile.NamedTemporaryFile`.

## Buggy code

```python
import os
import subprocess
import tempfile

def render_pdf(html_content: str) -> bytes:
    tmp_html = f"/tmp/report_{os.getpid()}.html"
    tmp_pdf  = f"/tmp/report_{os.getpid()}.pdf"

    with open(tmp_html, "w") as f:
        f.write(html_content)

    subprocess.run(
        ["wkhtmltopdf", tmp_html, tmp_pdf],
        check=True,
        capture_output=True,
    )

    with open(tmp_pdf, "rb") as f:
        pdf_bytes = f.read()

    os.remove(tmp_html)
    os.remove(tmp_pdf)
    return pdf_bytes
```
