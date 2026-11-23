// 곡별 시작 시각 계산. 미리보기·타임스탬프·렌더러가 모두 이 함수만 쓴다.
// (실제 프로젝트에서는 packages/editor-core 로 옮긴다)

/** 트랙이 영상에서 차지하는 길이(초) = 잘라낸 구간 + 곡 뒤 무음 */
export function playedDuration(t) {
  const end = t.trimEnd ?? t.sourceDuration;
  return Math.max(0, end - (t.trimStart ?? 0));
}

export function slotDuration(t) {
  return playedDuration(t) + (t.gapAfter ?? 0);
}

export function computeStarts(tracks) {
  let acc = 0;
  return tracks.map((t) => {
    const start = acc;
    acc += slotDuration(t);
    return start;
  });
}

export function totalDuration(tracks) {
  return tracks.reduce((sum, t) => sum + slotDuration(t), 0);
}

/** 유튜브 챕터 형식: 0:00, 3:34, 1:02:40 */
export function fmtTime(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function timestampsText(tracks) {
  const starts = computeStarts(tracks);
  return tracks
    .map((t, i) => `${fmtTime(starts[i])} ${t.displayTitle}${t.displayArtist ? ` - ${t.displayArtist}` : ''}`)
    .join('\n');
}
