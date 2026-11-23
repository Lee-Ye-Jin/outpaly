# OutPaly 렌더링 실험 (FFmpeg spike)

기획안의 "렌더링 원칙"이 실제로 되는지 확인하는 작은 실험이다.

- 화면은 Canvas(`drawFrame`)가 곡마다 PNG 한 장으로 그린다. FFmpeg `drawtext`는 쓰지 않는다.
- 오디오는 곡별로 자르고(`atrim`), 볼륨을 맞추고(`volume`), 곡 뒤 무음을 넣어(`apad`) 하나로 잇는다(`concat`).
- 영상은 PNG와 곡 길이를 concat 목록으로 넘겨 `libx264 -tune stillimage`로 인코딩한다.
- 곡 시작 시각은 `timeline.mjs` 한 곳에서만 계산한다. 화면의 트랙리스트, 타임스탬프, 실제 오디오 길이가 모두 이 계산을 따른다.

## 실행

```bash
npm install
npm install-scripts approve ffmpeg-static   # npm 12+: FFmpeg 바이너리 다운로드 허용
npm rebuild ffmpeg-static

npm run samples        # 사인파 음원 2곡 + 배경 이미지 생성
npm run render         # project.sample.json → out/output.mp4
npm run bench          # 4분 x 15곡 = 1시간 분량 측정 (--fps 10 등으로 바꿔 볼 수 있음)
```

실제 음원으로 해 보려면 `samples/`에 MP3·WAV 파일을 넣고 `project.sample.json`의 `file`만 바꾸면 된다.

| 파일 | 역할 | 실제 프로젝트에서 옮길 곳 |
| --- | --- | --- |
| `src/timeline.mjs` | 곡 시작 시각, 전체 길이, 타임스탬프 | `packages/editor-core` |
| `src/draw-frame.mjs` | 1920x1080 프레임 한 장 그리기 | `packages/render-core` |
| `src/ffmpeg.mjs` | FFmpeg 실행, 진행률, 길이 읽기 | `apps/worker/src/ffmpeg` |
| `src/render.mjs` | PREPARING → PROCESSING 파이프라인 | `apps/worker/src/renderers` |

## 결과 (2026-11-23, Ryzen 5 7600 6코어 · RAM 31GB · Windows 11 · ffmpeg 6.1.1)

| 시나리오 | 오디오 | 영상 | 합계 | 파일 크기 | 길이 오차 |
| --- | --- | --- | --- | --- | --- |
| 2곡, 33초 (구간 자르기, 볼륨, 무음 1초 포함) | 0.7s | 2.9s | 3.6s | 0.9 MB | 0.00s |
| 15곡, 1시간, 30fps | 72.5s | 135.4s | 약 3.5분 | 104.5 MB | 0.00s |
| 15곡, 1시간, 10fps | 79.0s | 49.8s | 약 2.2분 | 101.5 MB | — |

알게 된 것

1. **`-vf fps=30`은 쓰면 안 된다.** 이미지 하나가 몇 분 동안 이어지면 fps 필터가 복제 프레임을 한꺼번에 만들어 메모리가 부족해진다(1시간 벤치에서 `Cannot allocate memory`). 출력 옵션 `-r 30 -fps_mode cfr`로 바꾸면 메모리 사용량이 일정하다.
2. **길이는 정확히 맞는다.** MP3 끝부분 패딩 때문에 곡 길이에 수십 ms 차이가 생기므로, 곡마다 `apad=whole_dur` + `atrim=end`로 계산한 길이에 딱 맞춘다. 그래서 타임스탬프와 실제 영상이 어긋나지 않는다.
3. **파일 크기는 대부분 오디오다.** 정지 화면 영상은 약 46kbps이고, 오디오 192kbps가 1시간에 약 86MB를 차지한다.
4. **오디오와 영상은 따로 병렬로 만들 수 있다.** 지금은 순서대로 만든다. 영상만 먼저 인코딩한 뒤 `-c copy`로 합치면 1시간 기준 약 2.3분(=영상 시간)까지 줄일 수 있을 것으로 보인다(미측정).
5. **배경 위의 글자 가독성.** 밝은 배경 위에서는 강조 색이 묻힌다(샘플의 달 위 트랙리스트). 글자 그림자나 반투명 박스 옵션이 필요하다. 미리보기 CSS와 Canvas에 같은 값을 써야 한다.
6. 맑은 고딕은 실험용이다. 서버(Linux)에서는 Noto Sans KR 정적 폰트를 Worker 이미지에 넣고, 브라우저 미리보기도 같은 웹폰트를 쓴다.
