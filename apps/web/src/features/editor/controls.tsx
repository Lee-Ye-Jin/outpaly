import { useId, type ReactNode } from 'react';
import { FONT_CATALOG, FONT_IDS, type FontId } from '@outpaly/shared';
import { useFontsReady } from '../render/useFontsReady.ts';

/** 접고 펼 수 있는 설정 묶음. 브라우저 기본 <details> 라 키보드·화면 낭독기에서 그대로 동작한다 */
export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group min-w-0 border-b border-line pb-5 last:border-b-0 last:pb-0">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-md text-xs font-semibold tracking-wider text-text-2 hover:text-text [&::-webkit-details-marker]:hidden">
        {title}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform group-open:rotate-180">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-2 flex min-w-0 flex-col gap-3">{children}</div>
    </details>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-accent" />
      {label}
    </label>
  );
}

export function Range(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 text-sm ${props.disabled ? 'opacity-50' : ''}`}>
      <div className="flex justify-between">
        <label htmlFor={id}>{props.label}</label>
        <output htmlFor={id} className="text-text-2 tabular-nums">
          {props.format(props.value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="accent-accent"
      />
    </div>
  );
}

export function TextInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  error?: string | null;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        value={props.value}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-invalid={props.error ? true : undefined}
        onChange={(e) => props.onChange(e.target.value)}
        className="min-h-10 rounded-lg border border-line-strong bg-ink px-3 text-sm outline-none placeholder:text-text-3 focus:border-accent disabled:opacity-50"
      />
      {props.error && <p className="text-warn">{props.error}</p>}
    </div>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <label htmlFor={id}>{label}</label>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs text-text-2 uppercase">{value}</span>
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-9 cursor-pointer rounded-md border border-line-strong bg-transparent p-0.5"
        />
      </span>
    </div>
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span id={id}>{props.label}</span>
      <div role="radiogroup" aria-labelledby={id} className="flex gap-1 rounded-[9px] border border-line bg-ink p-[3px]">
        {props.options.map((o) => {
          const on = o.value === props.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => props.onChange(o.value)}
              className={`min-h-9 flex-1 rounded-md text-sm font-medium ${on ? 'bg-[#2A2A34] text-text' : 'text-text-2 hover:text-text'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Select<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        className="min-h-10 rounded-lg border border-line-strong bg-ink px-2.5 text-sm"
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** 글꼴 고르기: 분류별로 묶고, 고른 글꼴로 견본을 보여 준다 */
export function FontSelect({ label, value, onChange }: { label: string; value: FontId; onChange: (v: FontId) => void }) {
  const id = useId();
  const ready = useFontsReady([value]);
  const groups = FONT_IDS.reduce<Record<string, FontId[]>>((acc, f) => {
    (acc[FONT_CATALOG[f].category] ??= []).push(f);
    return acc;
  }, {});
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as FontId)}
        className="min-h-10 rounded-lg border border-line-strong bg-ink px-2.5 text-sm"
      >
        {Object.entries(groups).map(([category, ids]) => (
          <optgroup key={category} label={category}>
            {ids.map((f) => (
              <option key={f} value={f}>
                {FONT_CATALOG[f].label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p
        aria-hidden
        className={`truncate rounded-md bg-panel-2 px-2.5 py-1.5 text-lg transition-opacity ${ready ? 'opacity-100' : 'opacity-40'}`}
        style={{ fontFamily: `"${FONT_CATALOG[value].family}", sans-serif` }}
      >
        가나다라 노을 ABC 123
      </p>
    </div>
  );
}
