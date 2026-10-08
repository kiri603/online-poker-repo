// Subtract higher cards from a target's bounds, retaining only its visible pieces.
export function visibleCardRects(target, covering) {
  return covering.reduce((pieces, cover) => pieces.flatMap((piece) => {
    const left = Math.max(piece.x, cover.x), top = Math.max(piece.y, cover.y);
    const right = Math.min(piece.x + piece.width, cover.x + cover.width);
    const bottom = Math.min(piece.y + piece.height, cover.y + cover.height);
    if (right <= left || bottom <= top) return [piece];
    return [
      { x: piece.x, y: piece.y, width: piece.width, height: top - piece.y },
      { x: piece.x, y: bottom, width: piece.width, height: piece.y + piece.height - bottom },
      { x: piece.x, y: top, width: left - piece.x, height: bottom - top },
      { x: right, y: top, width: piece.x + piece.width - right, height: bottom - top },
    ].filter((rect) => rect.width > 0 && rect.height > 0);
  }), [target]);
}
