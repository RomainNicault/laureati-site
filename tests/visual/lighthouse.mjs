// Contrat commun à la capture et à la porte, sans navigateur ni accès disque.
export function lighthouseFailures(scores, pages) {
  const failures = [];
  for (const { id } of pages.filter(p => p.lighthouse)) {
    for (const [category, threshold] of [['performance', 90], ['accessibility', 95]]) {
      const value = scores?.[id]?.[category];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        failures.push(`${id}: Lighthouse ${category} absent ou illisible`);
      } else if (value < threshold) {
        failures.push(`${id}: Lighthouse ${category} ${value} < ${threshold}`);
      }
    }
  }
  return failures;
}
