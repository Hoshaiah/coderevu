---
slug: after-create-sends-email-in-transaction
track: ruby
orderIndex: 30
title: Email Sent Inside Transaction
difficulty: medium
tags:
  - active-record
  - rails
  - concurrency
  - after-commit
language: ruby
---

## Context

`app/models/invitation.rb` sends a welcome email to a newly created invited user. The `after_create` callback fires the mailer immediately when the record is saved. The `Invitation` model is sometimes saved as part of a larger multi-step transaction in `app/services/onboarding_service.rb` that also creates a `Team` and a `TeamMembership`.

Users occasionally report receiving the invitation email but then seeing an error page when they click the link, because their `Invitation` record doesn't exist — the outer transaction rolled back after the email was already delivered. Support has verified that these ghost emails match failed onboarding attempts visible in the error tracker.

The mailer itself is synchronous (no queue), so the email goes out the moment the callback fires.

## Buggy code

```ruby
# app/models/invitation.rb
class Invitation < ApplicationRecord
  belongs_to :team
  belongs_to :invited_by, class_name: "User"

  after_create :send_invitation_email

  private

  def send_invitation_email
    InvitationMailer.invite(self).deliver_now
  end
end

# app/services/onboarding_service.rb (abbreviated context)
# ActiveRecord::Base.transaction do
#   team        = Team.create!(name: params[:team_name])
#   invitation  = Invitation.create!(team: team, email: params[:email], invited_by: current_user)
#   TeamMembership.create!(team: team, user: current_user, role: "owner")
# end
```
