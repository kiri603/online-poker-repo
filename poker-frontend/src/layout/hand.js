export function handSpacing(availableWidth, cardWidth, count, preferredStep = cardWidth * 0.4) {
  if (!count) return { step: 0, width: 0 };
  const step = count === 1 ? 0 : Math.max(12, Math.min(preferredStep, (availableWidth - cardWidth) / (count - 1)));
  return { step, width: cardWidth + (count - 1) * step };
}
