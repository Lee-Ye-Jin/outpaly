import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

/** 네이티브 <dialog> 모달: 포커스 가두기, Esc 닫기, 배경 비활성화를 브라우저가 처리한다 */
function Modal({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-0 text-text backdrop:bg-black/60"
    >
      {open && children}
    </dialog>
  );
}

const btn = 'min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-60';

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Modal open={props.open} onClose={props.onClose} labelledBy={id}>
      <div className="flex flex-col gap-4 p-6">
        <h2 id={id} className="text-lg font-semibold">
          {props.title}
        </h2>
        <div className="text-sm text-text-2">{props.message}</div>
        {props.error && (
          <p role="alert" className="text-sm text-warn">
            {props.error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className={`${btn} border border-line-strong hover:bg-panel-2`}>
            취소
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.pending}
            className={`${btn} ${props.danger ? 'bg-[#E5484D] text-white' : 'bg-accent text-accent-ink'}`}
          >
            {props.pending ? '처리 중…' : props.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function PromptDialog(props: {
  open: boolean;
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  maxLength?: number;
  pending?: boolean;
  error?: string | null;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const inputId = useId();
  const [value, setValue] = useState(props.initialValue);
  useEffect(() => {
    if (props.open) setValue(props.initialValue);
  }, [props.open, props.initialValue]);

  function submit(e: FormEvent) {
    e.preventDefault();
    props.onSubmit(value);
  }

  return (
    <Modal open={props.open} onClose={props.onClose} labelledBy={id}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2 id={id} className="text-lg font-semibold">
          {props.title}
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">
            {props.label}
          </label>
          <input
            id={inputId}
            value={value}
            maxLength={props.maxLength}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            aria-invalid={props.error ? true : undefined}
            className="min-h-11 rounded-lg border border-line-strong bg-ink px-3 text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          {props.error && (
            <p role="alert" className="text-sm text-warn">
              {props.error}
            </p>
          )}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className={`${btn} border border-line-strong hover:bg-panel-2`}>
            취소
          </button>
          <button type="submit" disabled={props.pending} className={`${btn} bg-accent text-accent-ink`}>
            {props.pending ? '저장 중…' : props.confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
