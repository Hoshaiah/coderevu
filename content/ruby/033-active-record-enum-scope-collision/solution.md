## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Enum Scope Shadows Existing Method
# ------------------------------------------------------------------------

class Ticket < ApplicationRecord
  belongs_to :assignee, class_name: "User", optional: true
  belongs_to :sprint, optional: true

  # CHANGE 1: Renamed enum value 'active' to 'in_progress' to avoid overwriting the hand-written self.active class method; update any status references from :active to :in_progress.
  enum :status, { open: 0, in_progress: 1, closed: 2 }

  # Returns tickets that should appear on the sprint board.
  def self.active
    where("due_at <= ?", 30.days.from_now)
      .where.not(assignee_id: nil)
      .where.not(status: :closed)
  end

  def self.overdue
    # CHANGE 2: Call self.active explicitly so the sprint-board scope is used instead of any enum-generated scope, making the chain unambiguous.
    active.where("due_at < ?", Time.current)
  end
end
```

## Explanation

### Issue 1: Enum Scope Shadows Hand-Written Method

**Problem:** After `enum :status, { open: 0, active: 1, closed: 2 }` is added, ActiveRecord generates a class method `.active` that returns `where(status: 1)`. This overwrites the hand-written `self.active` method that filters by sprint assignment, due date, and non-closed status. Every call site that expects the sprint-board logic silently receives the enum scope instead, so closed and unassigned tickets appear on the board with no error raised.

**Fix:** Rename the `active` enum value to `in_progress` in the `enum :status` declaration (`# CHANGE 1`). This eliminates the naming collision while preserving the full business logic in `self.active`.

**Explanation:** Ruby method definitions follow last-writer-wins order within a class body. `enum` uses `define_method` (or equivalent metaprogramming) when the class is loaded, and because the `enum` call appears before `def self.active` in the file, the generated scope is defined first and then immediately overwritten by the explicit method — but in Rails 7.1 the enum class-level methods are defined on the class's singleton, and depending on load order or module ancestry the generated scope can win. The safest fix is simply not to use a name that collides. Renaming to `in_progress` requires updating any code that checks `ticket.in_progress?`, sets `status: :in_progress`, or uses `Ticket.in_progress`, but those changes are mechanical and safe. A related pitfall: adding `_prefix:` or `_suffix:` options to `enum` is another way to avoid collisions when renaming the value itself is not practical.

---

### Issue 2: overdue Chains on Wrong Scope

**Problem:** The original `self.overdue` calls `.active` as a chained scope after a `where` clause. When `self.active` is the hand-written method this works, but the argument order means it only filters due dates before the `active` call narrows the relation, and — more critically — if the enum scope is ever restored or the method is read in isolation, the intent is ambiguous and the due-date filter ends up redundant or misplaced.

**Fix:** Rewrite `self.overdue` to call `active` first and append the overdue `where` clause after it (`# CHANGE 2`), so the sprint-board scope always runs first and the past-due filter is applied on top.

**Explanation:** In the buggy code, `where("due_at < ?", Time.current).active` builds a relation that applies the `due_at` predicate and then calls whatever `.active` is defined at that moment. If `.active` is the enum scope, the final SQL is `WHERE due_at < NOW() AND status = 1`, completely ignoring assignment and the 30-day window. Putting `active` first — `active.where("due_at < ?", Time.current)` — makes the sprint-board filters the base and the past-due filter additive, which matches the intended semantics. Both orderings produce the same SQL when `self.active` is the correct hand-written method, but the revised order documents the dependency clearly and is resilient to future edits.
