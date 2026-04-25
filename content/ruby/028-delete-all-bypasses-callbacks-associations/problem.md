---
slug: delete-all-bypasses-callbacks-associations
track: ruby
orderIndex: 28
title: Delete-All Skips Dependent Callbacks
difficulty: medium
tags:
  - active-record
  - rails
  - mutability
language: ruby
---

## Context

`app/services/project_archiver.rb` is a service object invoked from an admin action to remove a project and all its associated data. The associations are declared with `dependent: :destroy` on `Project` so that child records — `Tasks`, `Comments`, and `Attachments` — are cleaned up and their own callbacks (like deleting S3 files) fire correctly.

The operations team noticed that after archiving a project, orphaned `Attachment` records remain in the database and the corresponding S3 files are never deleted. Storage costs have been growing unexpectedly for months. The `Attachment` model has an `after_destroy` callback that calls the S3 deletion service.

The team confirmed the associations are declared correctly on the model. The problem is in the service object that performs the deletion.

## Buggy code

```ruby
class ProjectArchiver
  def self.call(project_id)
    project = Project.find(project_id)

    # Remove all child records first for performance, then the project
    project.tasks.delete_all
    project.comments.delete_all
    project.attachments.delete_all

    project.destroy
  end
end
```
