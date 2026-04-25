## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Email Sent Inside Transaction
# ------------------------------------------------------------------------

# app/models/invitation.rb
class Invitation < ApplicationRecord
  belongs_to :team
  belongs_to :invited_by, class_name: "User"

  # CHANGE 1 & 2: Replace `after_create` with `after_commit on: :create` so the mailer only fires after the transaction — including any outer transaction in onboarding_service.rb — has successfully committed to the database.
  after_commit :send_invitation_email, on: :create

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

## Explanation

### Issue 1: Email fires before transaction commits

**Problem:** Users receive an invitation email, click the link, and get a "not found" error. The `Invitation` row doesn't exist in the database because the outer transaction in `onboarding_service.rb` rolled back after the email was already delivered.

**Fix:** Replace `after_create` with `after_commit on: :create` in `invitation.rb`. This single token change moves the callback to fire only after the database transaction fully commits.

**Explanation:** ActiveRecord callbacks like `after_create` run inside the active database transaction. When `Invitation.create!` is called inside the `ActiveRecord::Base.transaction` block in `onboarding_service.rb`, the record is inserted but the transaction is not yet committed. The `after_create` callback fires at that point, delivering the email immediately. If `TeamMembership.create!` then raises an exception, ActiveRecord rolls back the entire transaction — the `Invitation` row disappears, but the email is already gone. `after_commit` delays the callback until the outermost transaction issues a real `COMMIT` to the database, so the side-effect only happens when the data is durably saved. One related pitfall: in test environments Rails wraps each test in a transaction that never commits, so `after_commit` callbacks won't fire unless you use `DatabaseCleaner` with `:truncation` strategy or the `test_after_commit` gem.

---

### Issue 2: `after_create` does not respect nested/outer transactions

**Problem:** Even if the `Invitation` model were used in isolation, `after_create` gives a false sense of safety — developers assume the record exists by the time the callback runs, but any caller that wraps the save in its own transaction can still cause the callback to fire before a durable write.

**Fix:** The same `after_commit on: :create` change from CHANGE 2 addresses this: `after_commit` is specifically designed to fire once per commit event on the outermost transaction, regardless of nesting depth.

**Explanation:** ActiveRecord supports nested transactions via savepoints, but `after_create` does not distinguish between savepoint releases and full commits. When `Invitation.create!` runs inside an outer `transaction` block, the inner savepoint is released (the insert is staged), and `after_create` fires — but the outer transaction can still roll back the entire batch. `after_commit` waits for the outermost `COMMIT` to succeed. This means that any service object, background job, or console script that wraps `Invitation.create!` in a transaction gets the correct behavior automatically, without requiring callers to know about the mailer side-effect.
