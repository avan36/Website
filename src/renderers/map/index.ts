// Placeholder until the map renderer lands.
import type { RendererContext, RendererHandle } from '../types';

export async function mount(ctx: RendererContext): Promise<RendererHandle> {
  ctx.host.innerHTML = '<p style="position:absolute;inset:0;display:grid;place-items:center;font-weight:700">The map view is on its way.</p>';
  ctx.ready();
  return { pause() {}, resume() {}, destroy: () => (ctx.host.innerHTML = '') };
}
