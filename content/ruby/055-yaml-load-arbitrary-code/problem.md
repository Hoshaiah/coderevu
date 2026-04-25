---
slug: yaml-load-arbitrary-code
track: ruby
orderIndex: 55
title: YAML deserialization allows remote code execution via crafted payloads
difficulty: medium
tags:
  - security
  - deserialization
  - yaml
language: ruby
---

## Context

A background job imports configuration bundles uploaded by customers as YAML files and applies them to their accounts. The feature has been in production for two years. A penetration tester recently demonstrated that a crafted YAML file could execute arbitrary Ruby code on the worker host with no authentication other than a valid customer account.

## Buggy code

```ruby
class ConfigImportJob
  def perform(customer_id, yaml_content)
    config = YAML.load(yaml_content)

    unless config.is_a?(Hash)
      raise ArgumentError, "Config must be a YAML mapping"
    end

    Customer.find(customer_id).update!(config: config)
  rescue ArgumentError => e
    Rails.logger.error("Config import failed: #{e.message}")
  end
end
```
