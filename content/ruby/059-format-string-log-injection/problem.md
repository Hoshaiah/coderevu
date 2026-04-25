---
slug: format-string-log-injection
track: ruby
orderIndex: 59
title: User Input in Log Format String
difficulty: medium
tags:
  - security
  - rails
  - idioms
language: ruby
---

## Context

`app/controllers/search_controller.rb` logs every search query for analytics. A junior engineer added the logging line using Ruby's `%` string formatting operator because they saw it used elsewhere in the codebase for building SQL fragments. The code passed code review because the log line looks innocuous.

A security researcher filed a report showing that a crafted search query can inject arbitrary text into the application log, impersonating log lines from other components. In more severe cases, log-aggregation pipelines that parse structured log output (JSON, logfmt) can be corrupted or confused, causing real log lines to be dropped.

Greppping the codebase for `%` formatting in log calls turned up three other instances with the same pattern.

## Buggy code

```ruby
class SearchController < ApplicationController
  def index
    @query = params[:q].to_s.strip
    @results = Product.search(@query)

    # Log the search term for analytics.
    Rails.logger.info("[Search] user=%d query=%s" % [current_user.id, @query])

    render :index
  end
end
```
