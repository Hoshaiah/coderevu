---
slug: has-many-through-delete-vs-destroy
track: ruby
orderIndex: 25
title: Join Record Skips Callbacks on Delete
difficulty: medium
tags:
  - active-record
  - rails
  - callbacks
language: ruby
---

## Context

This code is in `app/models/project.rb` in a project-management SaaS. Projects have members through a `memberships` join table; the `Membership` model has an `after_destroy` callback that sends a notification email and decrements a billing counter on the account.

Support has reported that removing a member from a project never triggers the notification email and the billing seat count drifts out of sync over time. The `after_destroy` callback on `Membership` is definitely defined and works correctly when memberships are destroyed individually from the console.

The team checked that `dependent:` is set on the association and concluded it must be a mailer bug. They haven't looked at the exact SQL being issued when a member is removed.

## Buggy code

```ruby
class Project < ApplicationRecord
  has_many :memberships, dependent: :delete_all
  has_many :members, through: :memberships, source: :user

  def remove_member(user)
    memberships.where(user: user).delete_all
  end
end

class Membership < ApplicationRecord
  belongs_to :project
  belongs_to :user

  after_destroy :send_removal_notification
  after_destroy :decrement_seat_count

  private

  def send_removal_notification
    MembershipMailer.removed(self).deliver_later
  end

  def decrement_seat_count
    project.account.decrement!(:seat_count)
  end
end
```
