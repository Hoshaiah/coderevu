## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — File upload endpoint allows path traversal via crafted filenames
# ------------------------------------------------------------------------
# app/controllers/avatars_controller.rb
class AvatarsController < ApplicationController
  UPLOAD_DIR = Rails.root.join('public', 'uploads', 'avatars')

  def update
    uploaded = params[:avatar]

    # CHANGE 3: Derive content type from the file's actual bytes via Marcel/MimeMagic instead of trusting the client-supplied content_type header.
    actual_content_type = Marcel::MimeType.for(uploaded.tempfile, name: uploaded.original_filename)
    unless actual_content_type.start_with?('image/')
      return render json: { error: 'Must be an image' }, status: :unprocessable_entity
    end

    # CHANGE 2: Generate a random, server-controlled filename so the original name is never used on disk, preventing both path traversal and user-controlled filenames.
    ext      = File.extname(uploaded.original_filename).downcase.gsub(/[^.a-z0-9]/, '')
    safe_name = "#{SecureRandom.uuid}#{ext}"

    # CHANGE 1: Resolve the destination path and verify it stays inside UPLOAD_DIR. Pathname#expand_path resolves any ".." segments; the prefix check then rejects any path that escapes the intended directory.
    dest = UPLOAD_DIR.join(safe_name).expand_path
    unless dest.to_s.start_with?(UPLOAD_DIR.expand_path.to_s + '/')
      return render json: { error: 'Invalid filename' }, status: :unprocessable_entity
    end

    FileUtils.mkdir_p(UPLOAD_DIR)
    File.binwrite(dest, uploaded.read)

    current_user.update!(avatar_path: "uploads/avatars/#{safe_name}")
    render json: { url: "/uploads/avatars/#{safe_name}" }
  end
end
```

## Explanation

### Issue 1: Path traversal via crafted filename

**Problem:** When a user uploads a file named `../../config/database.yml`, `UPLOAD_DIR.join(filename)` produces a path that points outside the avatars directory. `File.binwrite` then overwrites whatever file sits at that resolved path — including Rails credentials, database configs, or source files.

**Fix:** At the CHANGE 1 site, `expand_path` is called on the final `dest` to resolve all `..` segments, and then a prefix check confirms the resulting path still starts with the expanded `UPLOAD_DIR`. If it does not, the request is rejected before any write occurs.

**Explanation:** `Pathname#join` does not normalize `..` sequences — it concatenates segments literally, so `UPLOAD_DIR.join('../../config/database.yml')` yields a path that walks up two directories. Calling `expand_path` forces the OS to resolve the real absolute path, turning `..` into actual parent-directory references. The prefix check then compares the resolved destination against the resolved upload directory; any path that escapes the directory will fail this check. The trailing `/` in the prefix string is important — without it, a directory named `avatars_extra` would incorrectly pass the check against a prefix of `.../avatars`.

---

### Issue 2: Verbatim original filename used on disk

**Problem:** Storing the file under `uploaded.original_filename` means one user can predict another user's avatar path and overwrite it by uploading a file with the same name. It also leaks the client's local filename in the public URL.

**Fix:** At the CHANGE 2 site, `SecureRandom.uuid` generates an unpredictable server-controlled name, and only the sanitized extension from the original filename is appended. The original filename is never written to disk or reflected in the URL.

**Explanation:** Filenames supplied by HTTP clients are user-controlled strings. Using them verbatim ties the server's filesystem layout to attacker input. A UUID per upload makes every stored file unique and unpredictable. The extension is extracted with `File.extname` and then stripped of any characters outside `[.a-z0-9]` to prevent tricks like `photo.jpg.php` or null-byte injection that some older systems misinterpret. Even if the path traversal guard in CHANGE 1 were absent, a random server-generated name would never resolve to a sensitive path.

---

### Issue 3: Content-type check trusts client-supplied MIME type

**Problem:** `uploaded.content_type` comes directly from the multipart form's `Content-Type` header for that part, which the client sets. An attacker can upload a PHP or HTML file and label it `image/jpeg`, bypassing the guard entirely.

**Fix:** At the CHANGE 3 site, `Marcel::MimeType.for` inspects the file's actual bytes (magic bytes / file signature) to determine the real content type, rather than reading the header string the client provided.

**Explanation:** The HTTP `Content-Type` for a multipart field is set by the browser or HTTP client and is not validated before it reaches the Rails parameter. Magic-byte detection reads the first bytes of the file — for example, JPEG files begin with `FF D8 FF` — and matches them against known signatures. Marcel (already a Rails dependency via Active Storage) performs this detection. A malicious file with `Content-Type: image/jpeg` but actual PHP content will produce a non-image MIME type from Marcel and be rejected. Note that magic-byte checks are not foolproof against polyglot files (valid images that are also valid scripts), so serving uploads from a separate domain or a blob store with `Content-Disposition: attachment` provides additional defense in depth.
