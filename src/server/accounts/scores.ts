/**
 * Puntaje de las cuentas dueñas de unas fincas (para mostrarlo en cada finca publicada). Aparte de `index.ts` para
 * que las fincas no importen la lógica de cuentas (y no haya ciclos con `claimListing`).
 */
import { accountsRepo } from './repo';

/** Nunca falla: sin datos, la finca se muestra sin puntaje. */
export async function pointsForAccounts(ids: (string | null | undefined)[]): Promise<Map<string, number>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Map();
  try {
    return await accountsRepo().pointsByIds(unique);
  } catch (e) {
    console.error('[accounts] sin puntaje de fincas', e);
    return new Map();
  }
}
