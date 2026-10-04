// The island as a renderer: adapts the 3D game to the page's contract.

import type { RendererContext, RendererHandle } from '../types';
import { createGame, type GameHandle } from './game';

export async function mount(ctx: RendererContext): Promise<RendererHandle> {
  const labels = document.createElement('div');
  labels.className = 'isl-labels';
  ctx.host.append(labels);
  const game = await createGame({
    stage: ctx.host,
    hud: document.getElementById('isl-stage')!,
    labelsHost: labels,
    go: ctx.go,
    cover: document.getElementById('isl-cover'),
    returnTo: ctx.returnTo,
    reducedMotion: ctx.reducedMotion,
    touch: ctx.touch,
    sound: ctx.sound,
    store: ctx.store,
    ui: ctx.ui,
    onReady: () => ctx.ready('self'),
    onFirstMove: ctx.firstMove,
    onIntroDone: () => {},
    onLost: () => ctx.fail(new Error('WebGL context lost')),
  });
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { __island?: GameHandle }).__island = game;
  }
  return {
    pause: game.pause,
    resume: game.resume,
    destroy: () => {
      game.destroy();
      labels.remove();
    },
  };
}
