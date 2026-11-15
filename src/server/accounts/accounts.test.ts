// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createListing, getListing, listListings } from '@/server/listings';
import { accountFromToken, awardPoints, login, logout, PointsRequest, signup } from './index';
import { hashPassword, verifyPassword } from './password';

beforeAll(() => {
  process.env.DATABASE_URL = '';
});

const req = (body: unknown) => PointsRequest.parse(body);

describe('contraseñas', () => {
  it('scrypt: verifica la correcta y rechaza otra', async () => {
    const h = await hashPassword('maíz-2026');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('maíz-2026', h)).toBe(true);
    expect(await verifyPassword('maiz-2026', h)).toBe(false);
  });
});

describe('cuentas', () => {
  it('crear cuenta da 100 puntos y abre sesión; el usuario no distingue mayúsculas', async () => {
    const res = await signup({ username: 'DonaRosa', password: 'cafecito' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.account).toMatchObject({ username: 'DonaRosa', points: 100, level: 'semilla' });
    expect((await accountFromToken(res.token))?.username).toBe('DonaRosa');
    expect(await signup({ username: 'donarosa', password: 'otraclave' })).toEqual({ ok: false, reason: 'taken' });
  });

  it('valida usuario y contraseña', async () => {
    expect(await signup({ username: 'a b', password: 'cafecito' })).toEqual({ ok: false, reason: 'username' });
    expect(await signup({ username: 'pedro', password: '123' })).toEqual({ ok: false, reason: 'password' });
    expect(await signup(null)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('entrar: con la contraseña correcta; sin revelar si el usuario existe', async () => {
    await signup({ username: 'campesino_1', password: 'platano1' });
    const ok = await login({ username: 'CAMPESINO_1', password: 'platano1' });
    expect(ok.ok).toBe(true);
    expect(await login({ username: 'campesino_1', password: 'mal' })).toEqual({ ok: false, reason: 'credentials' });
    expect(await login({ username: 'nadie_aqui', password: 'platano1' })).toEqual({ ok: false, reason: 'credentials' });
    if (ok.ok) {
      await logout(ok.token);
      expect(await accountFromToken(ok.token)).toBeNull();
    }
  });
});

describe('puntos', () => {
  it('aplica las reglas del servidor: una vez por referencia, retos con el mejor resultado', async () => {
    const res = await signup({ username: 'lucia', password: 'aguacate' });
    if (!res.ok) throw new Error('signup');
    const acc = (await accountFromToken(res.token))!;
    const a = await awardPoints(acc, req({ awards: [{ action: 'layer', ref: 'ndvi' }, { action: 'layer', ref: 'ndvi' }, { action: 'quest', ref: 'intro', value: 10 }] }));
    expect(a.awarded.map((x) => x.points)).toEqual([10, 230]);
    expect(a.total).toBe(340);
    const b = await awardPoints(acc, req({ awards: [{ action: 'quest', ref: 'intro', value: 15 }] }));
    expect(b.total).toBe(440);
  });

  it('el cliente no puede pedir los premios del servidor (crear cuenta, publicar)', () => {
    expect(PointsRequest.safeParse({ awards: [{ action: 'signup', ref: 'signup' }] }).success).toBe(false);
    expect(PointsRequest.safeParse({ awards: [{ action: 'publish', ref: 'abc' }] }).success).toBe(false);
    expect(PointsRequest.safeParse({ awards: [{ action: 'layer', ref: 'a b' }] }).success).toBe(false);
  });

  it('una finca publicada se enlaza con su token, suma 80 y muestra el puntaje de la cuenta', async () => {
    const res = await signup({ username: 'finca_roble', password: 'roble123' });
    if (!res.ok) throw new Error('signup');
    const acc = (await accountFromToken(res.token))!;
    const pub = await createListing(
      {
        farmName: 'Finca El Roble',
        whatsapp: '300 123 4567',
        lat: 4.5312,
        lon: -75.6431,
        products: [{ product: 'platano', quantity: 50, unit: 'racimo', priceCop: null, available: null }],
        consent: true,
      },
      'ip-test-points',
    );
    if (!pub.ok) throw new Error('publish');
    expect((await getListing(pub.listing.id))?.score).toBeUndefined();

    // Token equivocado: no se enlaza ni suma.
    const bad = await awardPoints(acc, req({ listings: [{ id: pub.listing.id, token: 'x'.repeat(43) }] }));
    expect(bad.total).toBe(100);

    const good = await awardPoints(acc, req({ listings: [{ id: pub.listing.id, token: pub.token }] }));
    expect(good.total).toBe(180);
    expect((await getListing(pub.listing.id))?.score).toEqual({ points: 180, level: 'brote' });
    // Repetir no suma otra vez.
    expect((await awardPoints(acc, req({ listings: [{ id: pub.listing.id, token: pub.token }] }))).total).toBe(180);

    // Otra cuenta con el mismo token no se la queda.
    const other = await signup({ username: 'otra_cuenta', password: 'otra1234' });
    if (!other.ok) throw new Error('signup');
    const otherAcc = (await accountFromToken(other.token))!;
    expect((await awardPoints(otherAcc, req({ listings: [{ id: pub.listing.id, token: pub.token }] }))).total).toBe(100);

    const { listings } = await listListings({ limit: 200 });
    expect(listings.find((l) => l.id === pub.listing.id)?.score?.points).toBe(180);
    expect(listings.find((l) => l.id === 'ejemplo-cafe')?.score).toEqual({ points: 1240, level: 'cosecha' });
  });
});
