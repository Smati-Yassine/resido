"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/action-result";
import { useToast } from "./Toaster";
import { useAfterAction } from "./AfterAction";

/**
 * Runs a Server Action from a form and reports every outcome as a toast:
 * success shows the action's message and runs `onSuccess` (close the modal,
 * navigate…); failure shows the message as a danger toast.
 *
 * Returns an `onSubmit` handler rather than a form `action`: React resets a
 * form after its `action` runs, which would wipe what the user typed when
 * the server rejects it. `prepare` may amend the FormData or veto the submit
 * (return false) before anything is sent.
 */
export function useActionToast<T>(
  action: (state: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>,
  onSuccess?: (result: Extract<ActionResult<T>, { ok: true }>) => void,
  prepare?: (formData: FormData) => boolean,
) {
  const toast = useToast();
  const afterAction = useAfterAction();
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  // The outcome is reported as soon as the action returns, not from an
  // effect after the re-render: that re-render may unmount this very form
  // (e.g. the row holding it was just deleted), and the toast must survive.
  const [, dispatch, pending] = useActionState(async (state: ActionResult<T> | null, formData: FormData) => {
    const result = await action(state, formData);
    toast({ tone: result.ok ? "success" : "danger", text: result.message });
    if (result.ok) {
      onSuccessRef.current?.(result);
      afterAction();
    }
    return result;
  }, null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    if (prepare && !prepare(formData)) return;
    startTransition(() => dispatch(formData));
  };

  return [onSubmit, pending] as const;
}
