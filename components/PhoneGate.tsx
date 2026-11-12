"use client";

import { FormEvent, useState } from "react";

export function PhoneGate({
  onSubmit,
  disabled,
}: {
  onSubmit: (phoneNumber: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const isValid = /^\d{10}$/.test(value);
  const showError = touched && value.length > 0 && !isValid;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid || disabled) return;
    onSubmit(value);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-1 flex-col items-center justify-center gap-4 bg-wa-chat px-6 text-center"
    >
      <p className="max-w-xs rounded-lg bg-wa-in px-4 py-2 text-[13px] text-wa-meta shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
        To continue, please confirm the mobile number this link was sent to.
      </p>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 10))}
        onBlur={() => setTouched(true)}
        maxLength={10}
        aria-invalid={showError}
        aria-describedby={showError ? "phone-error" : undefined}
        disabled={disabled}
        placeholder="10-digit mobile number"
        className="w-full max-w-xs rounded-full bg-wa-input px-4 py-2.5 text-center text-[15px] text-wa-text outline-none placeholder:text-wa-meta disabled:opacity-50"
      />
      {showError && (
        <p id="phone-error" role="alert" className="text-[13px] text-red-500">
          Please enter a valid 10-digit mobile number.
        </p>
      )}
      <button
        type="submit"
        disabled={disabled || !isValid}
        className="rounded-full bg-wa-accent px-8 py-2.5 text-sm font-medium text-white transition-opacity hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
