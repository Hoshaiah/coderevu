---
slug: dependent-destroy-n-plus-one
track: ruby
orderIndex: 45
title: 'dependent: destroy Triggers N+1'
difficulty: medium
tags:
  - n+1
  - active-record
  - rails
  - performance
language: ruby
---

## Context

`app/controllers/projects_controller.rb` provides a bulk-delete endpoint used by the admin panel. Each `Project` has many `Tasks`, and each `Task` has a before_destroy callback that notifies external subscribers. The association is declared `dependent: :destroy` so the callbacks fire correctly. This seemed fine during development with toy datasets.

In production, an admin attempted to delete a project with 4 000 tasks. The request took 47 seconds, saturated the database connection pool, and eventually timed out, leaving the project in an inconsistent partial-delete state. New Relic showed 4 001 sequential DELETE queries.

Switching to `dependent: :delete_all` was proposed but rejected because the before_destroy callbacks must fire. The team needs a solution that runs the callbacks without issuing one query per record.

## Buggy code

```ruby
class Project < ApplicationRecord
  has_many :tasks, dependent: :destroy
end

class Task < ApplicationRecord
  belongs_to :project

  before_destroy :notify_subscribers

  private

  def notify_subscribers
    SubscriberNotifier.call(task: self)
  end
end

class Admin::ProjectsController < ApplicationController
  def destroy
    @project = Project.find(params[:id])
    @project.destroy
    redirect_to admin_projects_path, notice: "Project deleted."
  end
end
```
