## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Marshal.load on User Input
# ------------------------------------------------------------------------

require 'json'

module Cache
  class ObjectStore
    def initialize(dir)
      @dir = dir
    end

    def write(key, value)
      # CHANGE 2: sanitize key before building path to prevent directory traversal via '../' sequences in caller-supplied keys
      File.open(path(key), 'w') { |f| f.write(JSON.generate(value)) }
    end

    def read(key)
      # CHANGE 2: sanitize key before building path (same traversal risk on read as on write)
      return nil unless File.exist?(path(key))
      # CHANGE 1: replace Marshal.load with JSON.parse — JSON cannot execute arbitrary Ruby code during deserialization, eliminating RCE risk from attacker-controlled files
      JSON.parse(File.read(path(key)))
    end

    private

    def path(key)
      # CHANGE 2: reject any key containing path separators or dot-sequences so callers cannot escape @dir
      raise ArgumentError, "Invalid cache key: #{key.inspect}" if key.to_s =~ /(\.\.|[\/\\])/
      File.join(@dir, "#{key}.cache")
    end
  end
end
```

## Explanation

### Issue 1: Unsafe deserialization via `Marshal.load`

**Problem:** `Marshal.load` executes any Ruby code embedded in the byte stream it reads. If an attacker can replace or write a `.cache` file — either through the world-writable NFS directory, a symlink swap, or any other file-system access — they gain arbitrary code execution on every app server that calls `read`. The symptom can be as subtle as a background job behaving oddly or as severe as a full server compromise.

**Fix:** `Marshal.load(File.binread(...))` is replaced with `JSON.parse(File.read(...))` and `Marshal.dump` is replaced with `JSON.generate`. The `require 'marshal'` line becomes `require 'json'`.

**Explanation:** `Marshal` is Ruby's native binary serialization format. It intentionally supports serializing arbitrary objects including those with custom `marshal_load` hooks. When `Marshal.load` reads bytes, Ruby reconstructs every object in the stream, calling those hooks. A crafted payload can use objects like `Gem::Installer` (a well-known gadget chain) to run shell commands during reconstruction. JSON has no such mechanism: `JSON.parse` only produces Hashes, Arrays, Strings, numbers, booleans, and nil. The trade-off is that values must be JSON-serializable; objects that rely on Marshal for complex Ruby types will need an explicit serialization strategy, but that is a design choice, not a security risk.

---

### Issue 2: Path traversal via unsanitized cache key

**Problem:** The `path` method concatenates `@dir` with the caller-supplied `key` without any validation. A key like `../../etc/cron.d/backdoor` resolves to a file outside the cache directory. On `write`, this lets an attacker (or a bug in the caller) overwrite arbitrary files the process can reach. On `read`, it leaks arbitrary file contents into the application.

**Fix:** A guard is added at the top of the private `path` method that raises `ArgumentError` if `key` contains `..`, `/`, or `\`. The check uses `key.to_s =~ /(\.\.| [\/\\])/`.

**Explanation:** `File.join` does not normalize or restrict paths. Passing `../../sensitive` as the key produces a string like `/cache/../../sensitive.cache`, which the OS resolves to `/sensitive.cache`. The fix rejects the key before joining, so no malformed path is ever constructed. A related pitfall is null-byte injection (`"valid\x00../../etc/passwd"`); Ruby 1.9+ raises an `ArgumentError` on null bytes in file paths automatically, but the traversal sequences handled here are not caught by default and must be blocked explicitly.
