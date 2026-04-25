## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Null Initial State Uncontrolled Input
// ------------------------------------------------------------------------

interface UserProfile {
  id: string;
  username: string | null;
  bio: string;
}

const ProfileForm: React.FC = () => {
  // CHANGE 1: Initialize to empty string instead of null so the input is always controlled from the first render.
  const [username, setUsername] = React.useState<string>("");
  // CHANGE 2: Track whether the profile has been loaded yet so we only pre-fill once and never overwrite user edits.
  const [profileLoaded, setProfileLoaded] = React.useState<boolean>(false);

  React.useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((profile: UserProfile) => {
        // CHANGE 2: Only set username from the API when the profile has not been loaded yet, preserving any text the user already typed.
        if (!profileLoaded) {
          setUsername(profile.username ?? "");
          setProfileLoaded(true);
        }
      });
  }, [profileLoaded]);

  return (
    <form>
      <label htmlFor="username">Username</label>
      <input
        id="username"
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
    </form>
  );
};
```

## Explanation

### Issue 1: Null initial value makes input uncontrolled

**Problem:** The browser logs "A component is changing an uncontrolled input to be controlled" every time the fetch completes. Before the data arrives, `username` is `null`, and React treats `value={null}` the same as omitting `value` entirely — the input is uncontrolled. When the fetch sets it to a string, React sees a switch from uncontrolled to controlled, which is the exact condition that triggers the warning.

**Fix:** Replace `React.useState<string | null>(null)` with `React.useState<string>("")` so the initial value is an empty string. The `value` prop is never `null`, and the input is controlled from the very first render.

**Explanation:** React decides whether an input is controlled or uncontrolled at the moment the `value` prop is first evaluated. If `value` is `null` or `undefined`, React registers the input as uncontrolled. A later render that passes a real string tries to flip that registration, which React disallows and warns about. Initializing the state to `""` means every render passes a string to `value`, so the input is always controlled. A related pitfall: `undefined` causes the same problem as `null`; both must be avoided as the `value` of a controlled input.

---

### Issue 2: Unconditional state overwrite discards user edits

**Problem:** On slow connections a user can start typing a username before the fetch returns. When the response arrives, `setUsername(profile.username)` unconditionally replaces whatever the user typed with the value from the server. The user's input disappears silently, which is confusing and data-lossy.

**Fix:** Add a `profileLoaded` boolean flag initialized to `false`. Inside the `.then` callback, only call `setUsername` when `profileLoaded` is `false`, then immediately set it to `true`. This means the API value pre-fills the field exactly once, and any subsequent user input is never overwritten by the fetch.

**Explanation:** The fetch runs asynchronously, so its `.then` fires at an unpredictable time relative to user keystrokes. Without a guard, every resolution of the fetch clobbers current state. Introducing `profileLoaded` creates a one-shot gate: the first time the fetch resolves, the field is pre-filled and the gate closes. If the user has already typed something when the fetch resolves, `profileLoaded` was set to `true` by whatever made the first successful response — but in this single-fetch pattern the real protection is that the condition is checked before writing. An alternative approach is to only set the value when `username` is still empty, but that incorrectly blocks a user who intentionally cleared the field before the response arrived; a dedicated flag is more explicit and correct.
