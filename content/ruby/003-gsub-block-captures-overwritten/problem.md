---
slug: gsub-block-captures-overwritten
track: ruby
orderIndex: 3
title: gsub Block Ignores Regex Captures
difficulty: easy
tags:
  - idioms
  - ruby
  - correctness
language: ruby
---

## Context

`lib/formatters/template_renderer.rb` is a small utility that expands `{{variable}}` placeholders in email templates. It is used by the marketing team to personalise bulk emails. The method has been in production for 18 months and is covered by unit tests, all of which pass.

A marketing manager noticed that some emails contained the raw placeholder text `{{first_name}}` instead of the recipient's name. This only happened with certain variable names. Investigation showed that the bug was present from day one but the unit tests happened to use variable names that masked the problem.

No exception is raised; the method returns silently incorrect output.

## Buggy code

```ruby
module Formatters
  class TemplateRenderer
    def self.render(template, variables = {})
      template.gsub(/\{\{(\w+)\}\}/) do
        key = $1
        variables[key] || "{{#{key}}}"
      end
    end
  end
end

# Usage:
variables = { "first_name" => "Alice", "company" => "Acme" }
result = Formatters::TemplateRenderer.render(
  "Hello {{first_name}}, welcome to {{company}}!",
  variables
)
puts result
# Expected: "Hello Alice, welcome to Acme!"
# Actual:   "Hello Alice, welcome to Acme!"  <-- works by accident

# Fails silently when variables use symbol keys:
variables_sym = { first_name: "Alice", company: "Acme" }
result2 = Formatters::TemplateRenderer.render(
  "Hello {{first_name}}!",
  variables_sym
)
puts result2  # => "Hello {{first_name}}!"  (placeholder not replaced)
```
