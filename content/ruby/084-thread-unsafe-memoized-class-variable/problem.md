---
slug: thread-unsafe-memoized-class-variable
track: ruby
orderIndex: 84
title: Memoized Class Variable Race
difficulty: hard
tags:
  - concurrency
  - ruby
  - thread-safety
language: ruby
---

## Context

`lib/feature_flags/loader.rb` loads feature-flag configuration from a YAML file once and caches it for the life of the process. The loader is called from many request threads simultaneously in a Puma multi-threaded server. The YAML file is only read at startup and never changes at runtime.

Under high concurrency at boot time, operators occasionally see flag lookups return `nil` for keys that definitely exist in the file, causing features to appear disabled for some users during the first few seconds after a deploy.

The team confirmed via benchmarking that the YAML read itself is not slow, and the file is valid. Adding a `sleep 2` at the start of `Puma::Server.run` eliminated the race in testing, which pointed toward a boot-time concurrency issue.

## Buggy code

```ruby
# lib/feature_flags/loader.rb
module FeatureFlags
  class Loader
    @@config = nil

    def self.config
      @@config ||= load_config
    end

    def self.enabled?(flag)
      config.fetch(flag.to_s, false)
    end

    private

    def self.load_config
      path = Rails.root.join("config", "feature_flags.yml")
      YAML.safe_load(File.read(path)) || {}
    end
  end
end
```
