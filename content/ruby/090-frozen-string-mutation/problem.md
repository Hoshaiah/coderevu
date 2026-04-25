---
slug: frozen-string-mutation
track: ruby
orderIndex: 90
title: String transformation raises FrozenError only in production
difficulty: medium
tags:
  - frozen-string
  - mutation
  - correctness
language: ruby
---

## Context

A text normalization utility is used in both a CLI tool and a Rails application. The Rails app runs with `# frozen_string_literal: true` enabled globally (a common performance setting), while the CLI does not. Engineers see a `FrozenError` only in the Rails context and are confused because the same method works perfectly in the CLI and in local IRB sessions.

## Buggy code

```ruby
# frozen_string_literal: true

module TextNormalizer
  def self.normalize(text)
    text.strip!
    text.gsub!(/\s+/, ' ')
    text.downcase!
    text
  end
end

puts TextNormalizer.normalize("  Hello   World  ")  # FrozenError in files
                                                     # with frozen_string_literal
```
