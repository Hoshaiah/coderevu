---
slug: missing-inverse-of-memory-bloat
track: ruby
orderIndex: 37
title: Missing inverse_of Duplicates Objects
difficulty: hard
tags:
  - active-record
  - rails
  - n+1
  - performance
language: ruby
---

## Context

`app/models/company.rb` and `app/models/employee.rb` form a simple parent-child association. A memory-profiling session run after a spike in heap usage revealed that loading 500 companies with their employees allocates roughly twice as many Ruby objects as expected. The profiler shows thousands of duplicate `Company` instances — one per employee row.

The engineer who ran the profiler initially blamed the serialiser and spent two days optimising JSON rendering. Heap allocation dropped slightly but the core duplication remained. The real cause is an ActiveRecord association option that is absent from both model files.

The symptom also causes subtle correctness issues: mutating `employee.company.name` does not update the same object that `company.name` refers to, so in-memory changes are lost or appear inconsistently within the same request.

## Buggy code

```ruby
class Company < ApplicationRecord
  has_many :employees
end

class Employee < ApplicationRecord
  belongs_to :company
end

# In a service object:
companies = Company.includes(:employees).limit(500)
companies.each do |company|
  company.employees.each do |employee|
    # Each employee.company is a DIFFERENT Ruby object from `company`,
    # doubling memory usage and breaking in-memory identity.
    if employee.company.name != company.name
      puts "Should never happen — but it does if name was mutated"
    end
  end
end
```
