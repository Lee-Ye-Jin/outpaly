import type { ProjectTrack, Track } from '@prisma/client';
import type { ProjectTrackDto, TrackDto } from '@outpaly/shared';

export const toTrackDto = (t: Track): TrackDto => ({
  id: t.id,
  title: t.title,
  artist: t.artist,
  duration: t.duration,
  mimeType: t.mimeType,
  sizeBytes: Number(t.sizeBytes),
  createdAt: t.createdAt.toISOString()
});

export const toProjectTrackDto = (pt: ProjectTrack & { track: Track }): ProjectTrackDto => ({
  id: pt.id,
  trackId: pt.trackId,
  sortOrder: pt.sortOrder,
  displayTitle: pt.displayTitle,
  displayArtist: pt.displayArtist,
  trimStart: pt.trimStart,
  trimEnd: pt.trimEnd,
  gain: pt.gain,
  gapAfter: pt.gapAfter,
  track: toTrackDto(pt.track)
});
