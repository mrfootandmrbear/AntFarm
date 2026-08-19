/** Scale the Pixi canvas to fill the stage while keeping pixel-crisp integer zoom. */
export function fitCanvasToStage(stage: HTMLElement, canvas: HTMLCanvasElement): () => void {
  const resize = (): void => {
    const pad = 56;
    const sw = Math.max(120, stage.clientWidth - pad);
    const sh = Math.max(120, stage.clientHeight - pad);
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.max(1, Math.min(sw / cw, sh / ch, 3));
    const zoom = Math.floor(scale * 2) / 2; // half-step zoom keeps pixels even
    canvas.style.width = `${cw * zoom}px`;
    canvas.style.height = `${ch * zoom}px`;
  };

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  return () => observer.disconnect();
}
