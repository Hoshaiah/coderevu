---
slug: eager-load-missing-association
track: ruby
orderIndex: 44
title: N+1 on Nested Includes
difficulty: medium
tags:
  - n+1
  - active-record
  - performance
language: ruby
---

## Context

This code lives in `app/controllers/api/v1/projects_controller.rb` in a project management SaaS. The endpoint returns a JSON payload of projects with their tasks and each task's assignee. The team uses Rails 7 with PostgreSQL and the `fast_jsonapi` serializer has been replaced with plain `as_json` for simplicity during a refactor.

After a customer with 200+ projects complained about slow load times, the engineering team added the New Relic APM agent and found the endpoint was firing thousands of SQL queries per request. The logs showed repeated `SELECT * FROM users WHERE id = ?` queries — one per task. The index page for small accounts looks fine, which is why it passed QA.

The team added `includes(:tasks)` thinking that was sufficient and redeployed, but APM still showed O(n) user queries.

## Buggy code

```ruby
class Api::V1::ProjectsController < ApplicationController
  def index
    projects = Project
      .where(account_id: current_account.id)
      .includes(:tasks)
      .order(created_at: :desc)

    render json: projects.map { |project|
      {
        id: project.id,
        name: project.name,
        tasks: project.tasks.map { |task|
          {
            id: task.id,
            title: task.title,
            assignee: task.assignee&.name
          }
        }
      }
    }
  end
end
```
