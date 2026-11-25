import { useEffect, useId, useRef, useState } from 'react';
import { BACKGROUND_PRESETS, IMAGE_ACCEPT_ATTR, type AssetDto, type ProjectSettings } from '@outpaly/shared';
import { ApiRequestError } from '../../services/api.ts';
import { assetsApi, uploadImage } from '../../services/assets-api.ts';
import { ColorInput, Range, Section, Segmented } from './controls.tsx';

type Bg = ProjectSettings['background'];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const times = (v: number) => `${v.toFixed(2).replace(/\.?0+$/, '')}배`;
const messageOf = (e: unknown, fallback: string) => (e instanceof ApiRequestError || e instanceof Error ? e.message : fallback);

export function BackgroundSection({ bg, onChange }: { bg: Bg; onChange: (patch: Partial<Bg>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUpload({ progress: 0 });
    try {
      const asset = await uploadImage(file, (progress) => setUpload({ progress }));
      // 새 이미지는 가운데·맞춤 크기로 시작
      onChange({ assetId: asset.id, zoom: 1, focusX: 0.5, focusY: 0.5 });
    } catch (e) {
      setError(messageOf(e, '이미지를 올리지 못했어요.'));
    } finally {
      setUpload(null);
    }
  }

  return (
    <Section title="배경">
      <div className="flex flex-col gap-1.5 text-sm">
        <span id="bg-presets">기본 배경</span>
        <div role="group" aria-labelledby="bg-presets" className="flex flex-wrap gap-2">
          {BACKGROUND_PRESETS.map((p) => {
            const on = !bg.assetId && bg.color.toUpperCase() === p.color.toUpperCase();
            return (
              <button
                key={p.color}
                type="button"
                title={p.name}
                aria-label={`배경 ${p.name}`}
                aria-pressed={on}
                onClick={() => onChange({ assetId: null, color: p.color })}
                className={`size-9 rounded-lg border-2 ${on ? 'border-accent' : 'border-line-strong hover:border-text-3'}`}
                style={{ background: p.color }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span>배경 이미지</span>
        {bg.assetId ? (
          <div className="flex items-center gap-3">
            <img src={assetsApi.fileUrl(bg.assetId)} alt="" className="h-12 w-20 shrink-0 rounded-md bg-panel-2 object-cover" />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => inputRef.current?.click()} className="min-h-9 rounded-lg border border-line-strong px-2.5 text-[13px] hover:bg-panel-2">
                바꾸기
              </button>
              <button type="button" onClick={() => onChange({ assetId: null })} className="min-h-9 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-panel-2">
                빼기
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={!!upload}
            onClick={() => inputRef.current?.click()}
            className="min-h-10 rounded-lg border-[1.5px] border-dashed border-line-strong text-[13px] text-[#C9C8CF] hover:border-text-3 disabled:opacity-60"
          >
            이미지 올리기 (JPG · PNG · WebP, 20MB)
          </button>
        )}
        <button type="button" onClick={() => setLibraryOpen(true)} className="min-h-9 self-start rounded-lg px-1 text-[13px] text-accent hover:underline">
          내 이미지에서 고르기
        </button>
        <input ref={inputRef} type="file" accept={IMAGE_ACCEPT_ATTR} hidden onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ''))} />
        {upload && (
          <div role="progressbar" aria-label="이미지 업로드" aria-valuenow={Math.round(upload.progress * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1 overflow-hidden rounded bg-line">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${upload.progress * 100}%` }} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-warn">
            {error}
          </p>
        )}
      </div>

      {bg.assetId && (
        <>
          <Segmented
            label="맞추기"
            value={bg.fit}
            options={[
              { value: 'cover', label: '화면 채우기' },
              { value: 'contain', label: '전체 보이기' }
            ]}
            onChange={(fit) => onChange({ fit })}
          />
          <Range label="확대" value={bg.zoom} min={1} max={3} step={0.05} format={times} onChange={(zoom) => onChange({ zoom })} />
          <Range label="가로 위치" value={bg.focusX} min={0} max={1} step={0.01} format={pct} onChange={(focusX) => onChange({ focusX })} />
          <Range label="세로 위치" value={bg.focusY} min={0} max={1} step={0.01} format={pct} onChange={(focusY) => onChange({ focusY })} />
        </>
      )}
      <ColorInput label={bg.assetId ? '여백 색' : '배경색'} value={bg.color} onChange={(color) => onChange({ color })} />
      <Range label="어둡게" value={bg.dim} min={0} max={0.8} step={0.05} format={pct} onChange={(dim) => onChange({ dim })} />

      <ImageLibraryDialog
        open={libraryOpen}
        currentId={bg.assetId}
        onClose={() => setLibraryOpen(false)}
        onPick={(a) => {
          onChange({ assetId: a.id, zoom: 1, focusX: 0.5, focusY: 0.5 });
          setLibraryOpen(false);
        }}
      />
    </Section>
  );
}

/** 내가 올린 이미지에서 고르기. 쓰지 않는 이미지는 여기서 지운다 */
function ImageLibraryDialog(props: { open: boolean; currentId: string | null; onClose: () => void; onPick: (a: AssetDto) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [assets, setAssets] = useState<AssetDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
    if (!props.open) return;
    setAssets(null);
    setError(null);
    const ctrl = new AbortController();
    assetsApi
      .list(ctrl.signal)
      .then((r) => setAssets(r.assets))
      .catch((e: unknown) => !ctrl.signal.aborted && setError(messageOf(e, '목록을 불러오지 못했어요.')));
    return () => ctrl.abort();
  }, [props.open]);

  async function remove(a: AssetDto) {
    setError(null);
    try {
      await assetsApi.remove(a.id);
      setAssets((prev) => prev?.filter((x) => x.id !== a.id) ?? null);
    } catch (e) {
      setError(messageOf(e, '삭제하지 못했어요.'));
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={props.onClose}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-0 text-text backdrop:bg-black/60"
    >
      {props.open && (
        <div className="flex max-h-[80vh] flex-col gap-4 p-6">
          <h2 id={titleId} className="text-lg font-semibold">
            내 이미지
          </h2>
          {error && (
            <p role="alert" className="text-sm text-warn">
              {error}
            </p>
          )}
          <div className="min-h-24 overflow-y-auto">
            {assets === null && !error && <p className="text-sm text-text-3">불러오는 중…</p>}
            {assets?.length === 0 && <p className="text-sm text-text-3">아직 올린 이미지가 없어요.</p>}
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {assets?.map((a) => (
                <li key={a.id} className={`overflow-hidden rounded-xl border ${a.id === props.currentId ? 'border-accent' : 'border-line'}`}>
                  <button type="button" onClick={() => props.onPick(a)} className="block w-full" aria-label={`${a.width}×${a.height} 이미지 배경으로 쓰기`}>
                    <img src={a.url} alt="" className="aspect-video w-full bg-panel-2 object-cover" loading="lazy" />
                  </button>
                  <div className="flex items-center gap-1 px-2 py-1 text-xs text-text-2">
                    <span className="flex-1 tabular-nums">
                      {a.width}×{a.height}
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(a)}
                      aria-label={`${a.width}×${a.height} 이미지 삭제`}
                      title="삭제"
                      className="flex size-8 items-center justify-center rounded-md text-text-3 hover:bg-line hover:text-text"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={props.onClose} className="min-h-11 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-panel-2">
              닫기
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
