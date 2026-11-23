import type { Modifier } from '@dnd-kit/core';

/** 세로로만 끌리게 (@dnd-kit/modifiers 를 따로 설치하지 않으려고 한 줄로 구현) */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
