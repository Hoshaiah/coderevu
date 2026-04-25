## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Async Closure Captures Dismissed Controller
// ------------------------------------------------------------------------

class ExportViewController: UIViewController {
    private var progressLabel: UILabel = UILabel()
    private var exportTask: Task<Void, Never>?

    @IBAction func startExportTapped(_ sender: UIButton) {
        // CHANGE 1: Capture self weakly so the Task does not extend the controller's lifetime beyond dismissal.
        exportTask = Task { [weak self] in
            await self?.runExport()
        }
    }

    private func runExport() async {
        for i in 1...100 {
            guard !Task.isCancelled else { return }
            await performExportStep(i)
            self.progressLabel.text = "Step \(i) of 100"
        }
    }

    private func performExportStep(_ step: Int) async {
        try? await Task.sleep(nanoseconds: 300_000_000)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // CHANGE 2: Call cancel() before clearing the reference so the Task actually stops running, not just gets dereferenced.
        exportTask?.cancel()
        exportTask = nil
    }
}
```

## Explanation

### Issue 1: Strong Self Capture Prevents Deallocation

**Problem:** After the user dismisses the sheet, the view controller stays in memory for the entire duration of the export — potentially minutes. Instruments shows a persistent retain, and users notice elevated memory on long exports.

**Fix:** Replace the implicit strong capture with `[weak self]` in the `Task` closure on the `startExportTapped` method, and call `self?.runExport()` instead of `await runExport()`.

**Explanation:** Swift `Task` closures capture everything they reference. Without `[weak self]`, the closure holds a strong reference to `self` (the `ExportViewController`). Even after UIKit removes all its own references during dismissal, the running `Task` keeps the retain count above zero, so ARC never deallocates the object. Switching to `[weak self]` means the closure holds only a weak reference: once UIKit finishes dismissal and drops its references, the retain count hits zero and the controller is freed. Inside `runExport`, `self.progressLabel` will simply stop executing because `self` is nil and the optional chain short-circuits. A related pitfall: if `runExport` were a free function taking `self` as a parameter, the strong capture would move to the call site — weak capture must be applied wherever `self` first enters the closure.

---

### Issue 2: exportTask = nil Does Not Stop the Running Task

**Problem:** The original `viewDidDisappear` sets `exportTask = nil`, but the export keeps running and log output keeps appearing after dismissal. The task runs all 100 steps regardless of dismissal.

**Fix:** Add `exportTask?.cancel()` immediately before `exportTask = nil` in `viewDidDisappear`, so the cooperative cancellation flag is set before the reference is dropped.

**Explanation:** `Task` in Swift uses cooperative cancellation. Setting the variable to `nil` only removes the stored handle; the underlying task's execution context is unaffected because the `Task` value type itself is reference-counted internally and keeps running. Calling `cancel()` sets `Task.isCancelled` to `true`, which the `guard !Task.isCancelled else { return }` check inside `runExport` already reads — but only if `cancel()` is actually called. Without the call, that guard never triggers from a dismissal. After adding `cancel()`, the next loop iteration after dismissal will hit the guard and exit cleanly. Note that `Task.sleep` also throws `CancellationError` when cancelled, so with `try? await Task.sleep(...)` the sleep step exits early too, making cancellation faster than waiting for the full 300 ms sleep to finish.
