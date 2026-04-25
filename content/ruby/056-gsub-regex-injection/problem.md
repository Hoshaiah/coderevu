---
slug: gsub-regex-injection
track: ruby
orderIndex: 56
title: User Input Injected Into Regex
difficulty: medium
tags:
  - security
  - ruby
  - idioms
language: ruby
---

## Context

The utility class in `lib/content/highlighter.rb` is used by the blog engine to highlight search terms in article bodies. The user's search query is passed directly into the method, which wraps all occurrences of the term in a `<mark>` tag. It's called from a Rack middleware that caches and serves rendered HTML.

A penetration tester discovered that submitting specially crafted search strings — particularly strings containing regex metacharacters like `(`, `*`, or `?` — causes the server to respond with a 500 error. More concerning, submitting a string like `(?i)admin` causes the highlighter to match content it shouldn't. They also found that deeply nested quantifiers can cause the process to hang for several seconds, consuming a full CPU core.

The team confirmed the regex is being compiled from raw user input and that no sanitization occurs before this step.

## Buggy code

```ruby
class ContentHighlighter
  def self.highlight(text, term)
    return text if term.blank?

    regex = Regexp.new(term, Regexp::IGNORECASE)
    text.gsub(regex) { |match| "<mark>#{match}</mark>" }
  end
end

# Example call from search results view:
# ContentHighlighter.highlight(article.body, params[:q])
```
