---
slug: subprocess-shell-injection
track: python
orderIndex: 40
title: Shell Injection via User Filename
difficulty: easy
tags:
  - correctness
  - security
  - subprocess
language: python
---

## Context

This helper lives in `utils/file_converter.py` and is part of a small Flask web app that lets users convert uploaded image files to PNG using ImageMagick. The function receives the filename that was submitted in the multipart form and passes it directly to the shell command.

Ops noticed that a few files in the output directory had unexpected names, and one user reported that after uploading a file named `foo.jpg; rm -rf /tmp/uploads` their upload silently disappeared. The conversion logs show no errors.

The developer added basic extension validation earlier but it only checked that the string ends in a known image extension, which doesn't prevent the injection.

## Buggy code

```python
import subprocess
import os

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp"}

def convert_to_png(input_filename: str, output_dir: str) -> str:
    _, ext = os.path.splitext(input_filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")

    base = os.path.splitext(input_filename)[0]
    output_filename = f"{base}.png"
    output_path = os.path.join(output_dir, output_filename)

    cmd = f"convert {input_filename} {output_path}"
    subprocess.run(cmd, shell=True, check=True)

    return output_path
```
