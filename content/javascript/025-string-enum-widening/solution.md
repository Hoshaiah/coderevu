## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Widened String Type Bypasses Enum
// ------------------------------------------------------------------------

type OrderStatus = "pending" | "processing" | "shipped" | "cancelled";

interface CreateOrderPayload {
  customerId: string;
  items: { productId: string; qty: number }[];
  status: OrderStatus;
}

// CHANGE 2: Add a runtime validation helper so invalid status values are caught locally instead of forwarded to the API.
const VALID_STATUSES: readonly OrderStatus[] = ["pending", "processing", "shipped", "cancelled"];

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

function buildPayload(formData: FormData): CreateOrderPayload {
  const status = formData.get("status");

  // CHANGE 1: Replace the unsafe `as unknown as OrderStatus` double cast with a real runtime check that throws a descriptive error if the value is not a valid OrderStatus.
  if (!isOrderStatus(status)) {
    throw new Error(`Invalid or missing order status: "${status}". Expected one of: ${VALID_STATUSES.join(", ")}`);
  }

  return {
    customerId: formData.get("customerId") as string,
    items: JSON.parse(formData.get("items") as string),
    status: status,
  };
}

async function createOrder(formData: FormData): Promise<void> {
  const payload = buildPayload(formData);
  await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```

## Explanation

### Issue 1: Unsafe double cast bypasses type system

**Problem:** The production API returns `400 Bad Request: "Invalid status value: processing"` even though `"processing"` is listed in `OrderStatus`. The actual value being sent is not `"processing"` — it only looks that way in the console log because the log fires before the bug matters. The double cast `as unknown as OrderStatus` convinces TypeScript the value is safe without checking it at all.

**Fix:** Remove `status as unknown as OrderStatus` and replace it with a call to the new `isOrderStatus` type-guard function. If the guard fails, throw an `Error` with the actual value and the list of accepted values before the payload is constructed.

**Explanation:** TypeScript's type system is erased at runtime. The double cast `as unknown as OrderStatus` is a purely compile-time instruction; it produces zero JavaScript. Whatever string (or non-string) `formData.get("status")` returns is forwarded to the API unmodified. If the form field is named slightly differently in some browser's FormData implementation, or if the field is missing, the value could be an empty string, `null` cast to the string `"null"`, or any other value that passes silently through TypeScript but fails the server's enum check. Throwing a local error surfaces the problem immediately in the UI rather than letting a malformed request reach the server.

---

### Issue 2: No runtime membership check for the status value

**Problem:** Even after removing the double cast, there is nowhere in the code that compares the incoming string against the known-valid status list. A form that sends `"PROCESSING"` (wrong casing), `" processing"` (leading space), or an entirely unexpected value will still reach the API and produce a `400`.

**Fix:** Add the `VALID_STATUSES` constant array and the `isOrderStatus` type-guard function (the `// CHANGE 2` site). The guard uses `Array.prototype.includes` to do an exact membership check at runtime, and the `is OrderStatus` return annotation narrows the type so TypeScript trusts the result downstream without any cast.

**Explanation:** `FormData.get` returns `FormDataEntryValue | null`, which is just `string | File | null`. There is no built-in mechanism that constrains it to your union type. The `isOrderStatus` guard explicitly iterates the allowed values and returns `true` only on an exact match. Keeping `VALID_STATUSES` as a `readonly` array derived from the same literals used in `OrderStatus` means a future developer adding a new status only has to update one place — or can derive the array from a `const` object and `keyof` if the list grows. A related pitfall: if you used `typeof value === "string"` alone without the `includes` check, you would only rule out `null` and `File`, but still let any arbitrary string through.
