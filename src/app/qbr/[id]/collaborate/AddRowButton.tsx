"use client";

type AddRowButtonProps = {
  label: string;
  onClick: () => void;
  /** First Add button in view gets the tour spotlight target. */
  tourTarget?: boolean;
};

/** Full-width dashed CTA so first-time users see where to add rows. */
export default function AddRowButton({
  label,
  onClick,
  tourTarget = false,
}: AddRowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={tourTarget ? "add-button" : undefined}
      className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10"
    >
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[12px] font-bold leading-none text-primary-foreground"
      >
        +
      </span>
      {label}
    </button>
  );
}
