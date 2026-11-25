import { describe, expect, it } from 'vitest';
import { ProjectSettings, createDefaultSettings } from './project-doc.ts';

describe('ProjectSettings 하위 호환', () => {
  it('Phase 4 까지 저장된 설정(새 칸 없음)도 그대로 열리고, 모양이 바뀌지 않는 기본값이 채워진다', () => {
    const old = {
      version: 1,
      output: { width: 1920, height: 1080, fps: 30 },
      background: { assetId: null, fit: 'cover', color: '#3A2E2A', dim: 0.4, blur: 0 },
      titleLayer: {
        visible: true,
        text: '예전 프로젝트',
        subtitle: '',
        font: 'noto-sans-kr',
        size: 84,
        color: '#FFFFFF',
        position: { x: 0.05, y: 0.09 }
      },
      tracklistLayer: {
        visible: true,
        position: 'right',
        highlightCurrent: true,
        showTimestamps: true,
        font: 'noto-sans-kr',
        size: 27,
        color: '#FFFFFF'
      }
    };
    const r = ProjectSettings.safeParse(old);
    expect(r.success).toBe(true);
    expect(r.data!.background).toMatchObject({ color: '#3A2E2A', dim: 0.4, zoom: 1, focusX: 0.5, focusY: 0.5 });
    // 예전 프로젝트에 그림자가 갑자기 생기지 않는다
    expect(r.data!.titleLayer.shadow).toBe(false);
    expect(r.data!.tracklistLayer.shadow).toBe(false);
  });

  it('새 프로젝트는 그림자를 켠 상태로 시작한다', () => {
    const s = createDefaultSettings('새 것');
    expect(ProjectSettings.parse(s)).toEqual(s);
    expect(s.titleLayer.shadow).toBe(true);
  });

  it('범위를 벗어난 확대·위치는 거절한다', () => {
    const s = createDefaultSettings('x');
    expect(ProjectSettings.safeParse({ ...s, background: { ...s.background, zoom: 5 } }).success).toBe(false);
    expect(ProjectSettings.safeParse({ ...s, background: { ...s.background, focusX: 1.5 } }).success).toBe(false);
  });
});
