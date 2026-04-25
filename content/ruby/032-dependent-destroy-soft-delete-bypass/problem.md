---
slug: dependent-destroy-soft-delete-bypass
track: ruby
orderIndex: 32
title: Soft Delete Skips Dependent Callbacks
difficulty: medium
tags:
  - active-record
  - mutability
  - rails
language: ruby
---

## Context

`app/models/organization.rb` belongs to a multi-tenant SaaS product. When an organization is deleted, all its child `Project` records should be cleaned up, and each `Project` deletion must fire a callback that archives associated S3 files and notifies an external billing API. The associations are declared with `dependent: :destroy` to ensure those callbacks run.

The team recently added soft deletion via a `deleted_at` column and a `discard` gem integration. Instead of calling `.destroy`, the "delete organization" action now calls `.discard`. QA noticed that S3 files are piling up and the billing API is not receiving cancellation webhooks even though organizations appear deleted in the UI.

Checking the database directly confirms `projects` rows have `deleted_at = NULL` even when their parent organization is discarded. The `dependent: :destroy` declaration is still present in the model.

## Buggy code

```ruby
# app/models/organization.rb
class Organization < ApplicationRecord
  include Discard::Model

  has_many :projects, dependent: :destroy

  after_discard :notify_billing_api

  private

  def notify_billing_api
    BillingApi.cancel_subscription(self.id)
  end
end

# app/models/project.rb
class Project < ApplicationRecord
  include Discard::Model

  has_many :s3_files, dependent: :destroy

  after_destroy :archive_s3_files

  private

  def archive_s3_files
    S3Archiver.archive!(self.id)
  end
end

# app/controllers/organizations_controller.rb
class OrganizationsController < ApplicationController
  def destroy
    org = Organization.find(params[:id])
    org.discard
    redirect_to organizations_path, notice: "Organization deleted"
  end
end
```
