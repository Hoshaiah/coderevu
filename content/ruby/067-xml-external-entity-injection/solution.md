## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Import endpoint is vulnerable to XXE when processing user-supplied XML files
# ------------------------------------------------------------------------
# app/controllers/api/imports_controller.rb
class Api::ImportsController < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :require_api_key

  # CHANGE 2: Enforce a maximum body size before reading to prevent DoS via huge payloads.
  MAX_BODY_BYTES = 1.megabyte

  def create
    # CHANGE 2: Read at most MAX_BODY_BYTES; reject requests that exceed the limit.
    xml_data = request.body.read(MAX_BODY_BYTES)
    if request.body.read(1).present?
      render json: { error: 'Payload too large' }, status: :payload_too_large
      return
    end

    # CHANGE 1: Pass noent: false and the NONET option to disable external entity resolution. Nokogiri::XML::ParseOptions::NONET prevents network access; noent: false (the default, made explicit here) stops entity substitution. Using Nokogiri::XML::ParseOptions::STRICT | NONET ensures no external entities or network calls are attempted.
    parse_options = Nokogiri::XML::ParseOptions::DEFAULT_XML |
                    Nokogiri::XML::ParseOptions::NONET
    doc = Nokogiri::XML(xml_data) do |config|
      # CHANGE 1: Disable external entity loading (XXE fix).
      config.options = parse_options
      config.nonet   # block all network-based entity resolution
      config.noent   # do not substitute entities — prevents local-file XXE
    end

    # CHANGE 1: Raise on any parse errors so malformed/malicious documents are rejected.
    raise Nokogiri::XML::SyntaxError, doc.errors.first.to_s if doc.errors.any?

    imported_count = 0
    doc.xpath('//product').each do |node|
      sku   = node.at_xpath('sku')&.text.to_s.strip
      name  = node.at_xpath('name')&.text.to_s.strip
      price_str = node.at_xpath('price')&.text.to_s.strip

      # CHANGE 3: Validate each field before persisting to avoid writing garbage or oversized strings to the database.
      next if sku.blank? || name.blank?
      next unless price_str.match?(/\A\d+(\.\d+)?\z/)

      Product.create!(
        sku:   sku,
        name:  name,
        price: price_str.to_d
      )
      imported_count += 1
    end

    render json: { imported: imported_count }, status: :created
  rescue Nokogiri::XML::SyntaxError => e
    render json: { error: e.message }, status: :unprocessable_entity
  end
end
```

## Explanation

### Issue 1: XXE injection via Nokogiri default parse options

**Problem:** `Nokogiri::XML(xml_data)` uses permissive defaults that honour `DOCTYPE` declarations and resolve external entities. An attacker who uploads an XML file containing `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` and then references `&xxe;` in a field will see the contents of `/etc/passwd` echoed back in the JSON response (or can pivot to internal HTTP endpoints via `http://` URIs).

**Fix:** Pass a configuration block to `Nokogiri::XML` that calls `config.nonet` and `config.noent`, and set `config.options` to `DEFAULT_XML | NONET`. These flags tell the libxml2 backend to refuse all network-based entity fetches and to stop substituting entity references before the document is handed to application code.

**Explanation:** libxml2 (which Nokogiri wraps) processes `SYSTEM` and `PUBLIC` entity declarations by opening the referenced URI and splicing the returned bytes into the document tree. `NONET` cuts off the TCP path, but a purely file-based entity (`file://`) still works unless `noent` is also disabled. Setting both flags means the entity reference is left as-is rather than being expanded, so the attacker's payload never reaches a file-read call. Raising on `doc.errors.any?` is a belt-and-suspenders step: a strict parse that rejects malformed documents closes edge cases where a crafted input might slip through error-recovery paths in the parser.

---

### Issue 2: Unbounded request body enables denial-of-service

**Problem:** `request.body.read` with no argument reads the entire body into a Ruby String. A client can POST a hundreds-of-megabyte XML file (or a recursive entity expansion — "billion laughs") and exhaust the worker's memory or CPU before Nokogiri even starts parsing.

**Fix:** Replace the bare `request.body.read` call with `request.body.read(MAX_BODY_BYTES)`, where `MAX_BODY_BYTES = 1.megabyte`, and then attempt a one-byte peek to detect whether the body was truncated. If the peek returns a byte, the payload exceeded the limit and the controller returns `413 Payload Too Large` immediately.

**Explanation:** Ruby's `IO#read(length)` stops after `length` bytes, so the string handed to Nokogiri is capped regardless of what the client sends. The subsequent single-byte peek checks whether the stream still has data; if it does, the original body was longer than the cap and must be rejected. Without this guard, a slow-loris-style or huge-file upload ties up a Puma thread for the duration of the read plus parse. Note that a reverse proxy (nginx, etc.) can enforce a body-size limit at the network layer as a complementary control, but relying on that alone is fragile because the proxy limit may be misconfigured or absent in development.

---

### Issue 3: Raw XML text written to the database without validation

**Problem:** `node.at_xpath('sku')&.text` returns whatever string appears in the XML, including empty strings, multi-megabyte blobs, or values that violate database column constraints. `Product.create!` raises an `ActiveRecord::RecordInvalid` for model-level validations, but without those validations the junk lands in the database silently.

**Fix:** After extracting each field, call `.strip` and then check that `sku` and `name` are non-blank (`next if sku.blank? || name.blank?`), and validate `price_str` against a numeric regex (`/\A\d+(\.\d+)?\z/`) before calling `to_d`. Rows that fail these checks are skipped rather than persisted.

**Explanation:** An attacker (or a partner with a malformed feed) can craft XML where `<price>` contains a string like `DROP TABLE products` or a 10 MB text block. Calling `.to_d` on a non-numeric string returns `0.0` silently in Ruby, so the database ends up with a zero-price product — a business logic problem, not just a crash. The regex guard ensures only strings that look like decimal numbers reach `to_d`. Stripping whitespace prevents padding tricks like a field that is all spaces passing a `present?` check.
