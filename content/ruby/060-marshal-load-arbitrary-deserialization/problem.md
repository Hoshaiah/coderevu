---
slug: marshal-load-arbitrary-deserialization
track: ruby
orderIndex: 60
title: Marshal.load on User Input
difficulty: medium
tags:
  - security
  - ruby
  - idioms
language: ruby
---

## Context

`lib/cache/object_store.rb` is a low-level caching utility used by several background jobs to checkpoint expensive computation results. It serializes Ruby objects to a file using `Marshal.dump` and deserializes them later with `Marshal.load`. The cache files are stored in a shared NFS directory accessible to all app servers.

A security review flagged the deserialization step. The reviewer noted that if an attacker can write to — or replace — any file in the cache directory, they can achieve arbitrary remote code execution on any server that reads the file. The directory permissions were also found to be world-writable in the staging environment.

The team is aware that the NFS permissions are being fixed, but the reviewer insisted the code itself must not use `Marshal.load` on data that could be attacker-influenced, even indirectly through file-system compromise.

## Buggy code

```ruby
require 'marshal'

module Cache
  class ObjectStore
    def initialize(dir)
      @dir = dir
    end

    def write(key, value)
      File.open(path(key), 'wb') { |f| f.write(Marshal.dump(value)) }
    end

    def read(key)
      return nil unless File.exist?(path(key))
      Marshal.load(File.binread(path(key)))
    end

    private

    def path(key)
      File.join(@dir, "#{key}.cache")
    end
  end
end
```
