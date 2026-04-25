## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — A wrapped input component does not forward its ref, causing parent focus calls to fail
// ------------------------------------------------------------------------
import { useRef, forwardRef } from "react";

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

// CHANGE 1: Wrap with forwardRef so the ref passed by the parent is forwarded to the underlying <input> DOM node instead of being silently discarded.
// CHANGE 2: forwardRef's generic parameters declare the ref type (HTMLInputElement) and props type (TextInputProps), satisfying TypeScript without a manual ref field.
const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, value, onChange }, ref) => {
    return (
      <label>
        {label}
        <input
          ref={ref} // CHANGE 1: attach the forwarded ref to the real DOM node
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
);

export function SignupForm() {
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    inputRef.current?.focus();
  };

  return (
    <div>
      <TextInput
        ref={inputRef}
        label="Email"
        value=""
        onChange={() => {}}
      />
      <button onClick={validate}>Submit</button>
    </div>
  );
}
```

## Explanation

### Issue 1: `ref` silently dropped by plain function component

**Problem:** When a parent passes `ref={inputRef}` to a function component that is not wrapped in `forwardRef`, React discards the ref entirely. `inputRef.current` remains `null` after mount, so calling `inputRef.current?.focus()` does nothing and no error is thrown.

**Fix:** Wrap `TextInput` with `forwardRef<HTMLInputElement, TextInputProps>(...)` and add `ref={ref}` to the inner `<input>` element. This is done at the `forwardRef(` call site and at the `<input ref={ref}` attribute.

**Explanation:** React's ref system for function components works differently from class components. For a function component, React has nowhere to attach a ref unless you explicitly opt in via `forwardRef`. `forwardRef` gives your component a second argument (`ref`) alongside `props`, and you attach that argument to whichever DOM element (or child component) should be the ref target. Once `ref` is attached to `<input>`, `inputRef.current` points to the real `HTMLInputElement` after mount and `.focus()` works. A related pitfall: if you later memoize `TextInput` with `React.memo`, you must wrap `forwardRef` on the inside — `memo(forwardRef(...))` — otherwise the ref is dropped again.

---

### Issue 2: Missing ref type in `TextInputProps` causes TypeScript error

**Problem:** Without `forwardRef`, `TextInputProps` has no `ref` field. TypeScript sees `ref={inputRef}` on `<TextInput>` and reports that `ref` is not a valid prop for that component type, blocking compilation.

**Fix:** Replace the standalone `function TextInput` declaration with `forwardRef<HTMLInputElement, TextInputProps>(...)`. The `forwardRef` generic encodes both the ref target type (`HTMLInputElement`) and the props type (`TextInputProps`), so TypeScript knows `ref` is valid and what type `ref.current` will be — no manual `ref` field in the interface is needed.

**Explanation:** `forwardRef`'s first type parameter tells TypeScript the type of the DOM node (or component instance) the ref will point to. TypeScript then merges that into the component's accepted JSX attributes automatically. If you tried to add `ref?: React.RefObject<HTMLInputElement>` to `TextInputProps` manually instead, React would treat it as a plain prop, not a ref — `inputRef.current` would still be `null` because the ref mechanism would not be wired up. Using `forwardRef` is the only correct path for both the runtime behavior and the type safety.
