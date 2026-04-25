---
slug: os-path-join-absolute-second-arg
track: python
orderIndex: 59
title: os.path.join Discards Base on Absolute
difficulty: easy
tags:
  - correctness
  - file-handling
  - api-misuse
language: python
---

## Context

This upload handler lives in `storage/file_store.py` and manages saving user-uploaded files to a designated upload directory. Files are stored under a configurable base directory (e.g. `/var/app/uploads`). The filename comes from the multipart form data submitted by the user. The handler is used by a Flask application that receives profile image and document uploads.

Ops has filed a report that files uploaded with certain names are appearing at unexpected locations on disk — outside the designated upload directory. In one case, a file intended for `/var/app/uploads/avatar.png` was instead written to `/avatar.png` (filesystem root). No security incident has been confirmed but the issue was escalated because unexpected writes outside the upload root could overwrite system files.

The team confirmed the upload directory exists and has correct permissions. They also confirmed the issue only occurs for specific filenames provided by users, not for all uploads.

## Buggy code

```python
import os
from flask import Flask, request, abort
from werkzeug.utils import secure_filename

app = Flask(__name__)
UPLOAD_DIR = "/var/app/uploads"

@app.route("/upload", methods=["POST"])
def upload_file():
    f = request.files.get("file")
    if f is None or f.filename == "":
        abort(400)

    filename = secure_filename(f.filename)
    if not filename:
        abort(400)

    dest_path = os.path.join(UPLOAD_DIR, filename)
    f.save(dest_path)
    return {"saved_to": dest_path}, 200
```
