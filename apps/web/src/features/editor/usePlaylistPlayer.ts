import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectTrackDto } from '@outpaly/shared';
import { tracksApi } from '../../services/tracks-api.ts';
import { PlaylistPlayer, type PlayerState, type PlayerTrack } from './playlist-player.ts';

export function usePlaylistPlayer(tracks: ProjectTrackDto[]) {
  const [state, setState] = useState<PlayerState>({ playing: false, time: 0, index: -1, error: null });
  const ref = useRef<PlaylistPlayer | null>(null);

  useEffect(() => {
    const player = new PlaylistPlayer(setState);
    ref.current = player;
    return () => {
      player.destroy();
      ref.current = null;
    };
  }, []);

  const playerTracks = useMemo<PlayerTrack[]>(
    () =>
      tracks.map((t) => ({
        id: t.id,
        src: tracksApi.streamUrl(t.trackId),
        sourceDuration: t.track.duration,
        trimStart: t.trimStart,
        trimEnd: t.trimEnd,
        gapAfter: t.gapAfter,
        gain: t.gain
      })),
    [tracks]
  );

  useEffect(() => {
    ref.current?.setTracks(playerTracks);
  }, [playerTracks]);

  return {
    ...state,
    toggle: () => ref.current?.toggle(),
    seek: (t: number) => ref.current?.seek(t),
    playFrom: (t: number) => ref.current?.play(t),
    pause: () => ref.current?.pause()
  };
}
