## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Missing inverse_of Duplicates Objects
# ------------------------------------------------------------------------

class Company < ApplicationRecord
  # CHANGE 1: Add inverse_of so ActiveRecord reuses the already-loaded Company instance when accessed via employee.company, preventing duplicate objects and fixing in-memory identity.
  has_many :employees, inverse_of: :company
end

class Employee < ApplicationRecord
  # CHANGE 1: Add inverse_of so the belongs_to side knows its inverse, completing the bidirectional link that ActiveRecord needs to share the same object in both directions.
  belongs_to :company, inverse_of: :employees
end

# In a service object:
companies = Company.includes(:employees).limit(500)
companies.each do |company|
  company.employees.each do |employee|
    # CHANGE 2: With inverse_of in place, employee.company IS the same Ruby object as company, so in-memory mutations are visible on both sides and no duplicate Company instances are allocated.
    if employee.company.name != company.name
      puts "Should never happen — and now it genuinely never does"
    end
  end
end
```

## Explanation

### Issue 1: Missing `inverse_of` Duplicates Company Objects

**Problem:** Loading 500 companies with `includes(:employees)` allocates one `Company` Ruby object per company up front. But when code later accesses `employee.company`, ActiveRecord has no declaration telling it that the `belongs_to :company` is the inverse of `has_many :employees`, so it constructs a fresh `Company` object for every single employee row. A company with 20 employees ends up with 20 extra duplicate instances on the heap.

**Fix:** Add `inverse_of: :company` to the `has_many :employees` declaration in `Company`, and `inverse_of: :employees` to the `belongs_to :company` declaration in `Employee`. These are the two `CHANGE 1` sites.

**Explanation:** ActiveRecord maintains an in-memory identity map only when it can follow the declared inverse. Without `inverse_of`, it cannot tell that the `company` object it already holds is the same record that `employee.company_id` points to, so it allocates a new instance. With `inverse_of` set on both sides, ActiveRecord checks the already-loaded association target and returns the existing object. This is why the profiler showed thousands of `Company` instances — one per employee row — while the company count was only 500. A related pitfall: `inverse_of` is inferred automatically in Rails 4.1+ for simple associations, but it is silently skipped when options like `through:`, `polymorphic:`, `as:`, or custom `foreign_key`/`class_name` are present; in those cases you must always declare it explicitly.

---

### Issue 2: In-Memory Identity Broken Across Association Sides

**Problem:** Because `employee.company` returns a different Ruby object than the `company` variable in the loop, any in-memory change made via one reference is invisible to the other. Calling `employee.company.name = 'Renamed'` inside the loop leaves `company.name` unchanged. Code that checks `company.name` afterward silently reads stale data, and the mutation is discarded when the request ends without a database write.

**Fix:** The same two `inverse_of` additions from `CHANGE 1` and `CHANGE 2` resolve this. Once both sides declare their inverse, `employee.company` returns the identical Ruby object that the `company` variable holds, so all reads and writes through either reference see the same state.

**Explanation:** Ruby object identity (`object_id`) is what determines whether two variables point to the same thing. Before the fix, `employee.company.object_id != company.object_id` even though both records have the same `id` in the database. After the fix, they share a single object, so `employee.company.name = 'X'` is exactly the same operation as `company.name = 'X'`. The correctness issue is easy to miss in tests because test data is often small and single-record lookups don't expose the duplicate; it surfaces in request-scoped logic that mutates associations before deciding whether to call `save`.
