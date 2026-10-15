import test from 'node:test';
import assert from 'node:assert/strict';
import { julianDate, gmstDeg, lstDeg, altAz, projectDome, projectLocal, separation, galacticEquator } from '../js/astro.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('GMST at J2000.0 epoch is 18.697h', () => {
  const jd = julianDate(new Date(Date.UTC(2000, 0, 1, 12)));
  close(jd, 2451545.0, 1e-6, 'JD');
  close(gmstDeg(jd), 280.46061837, 1e-6, 'GMST');
});

test('GMST on 2026-10-15 00:00 UT matches the USNO-style formula', () => {
  const jd = julianDate(new Date(Date.UTC(2026, 9, 15, 0)));
  const d = jd - 2451545.0;
  const expected = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24; // hours
  close(gmstDeg(jd) / 15, expected, 1e-4, 'GMST hours');
});

test('Polaris altitude equals latitude within 1 degree, anywhere, any time', () => {
  for (const [lat, lon] of [[35.69, 51.39], [38.08, 46.29], [41.0, 29.0], [60, -120]]) {
    for (let h = 0; h < 48; h += 7) {
      const lst = lstDeg(new Date(Date.UTC(2026, 6, 1, h)), lon);
      const { alt } = altAz(37.95, 89.26, lat, lst);
      close(alt, lat, 1, `Polaris alt at lat ${lat} h ${h}`);
    }
  }
});

test('a star on the meridian is due south, with alt = 90 - (lat - dec)', () => {
  const { alt, az } = altAz(100, 5, 35, 100);
  close(alt, 60, 1e-9, 'alt');
  close(az, 180, 1e-9, 'az');
});

test('a star with dec = lat on the meridian is at the zenith', () => {
  const { alt } = altAz(50, 35, 35, 50);
  close(alt, 90, 1e-3, 'alt');
});

test('east and west of the meridian mirror in azimuth', () => {
  const e = altAz(100, 20, 35, 100 - 90); // hour angle -90: rising side
  const w = altAz(100, 20, 35, 100 + 90);
  close(e.alt, w.alt, 1e-9, 'alt');
  close(e.az + w.az, 360, 1e-9, 'az mirror');
  assert.ok(e.az < 180, 'rising star is in the east');
});

test('dome projection: north at top, east at left when facing south', () => {
  const n = projectDome(0, 0, 100, 100, 100);
  close(n.x, 100, 1e-9, 'N x'); close(n.y, 0, 1e-9, 'N y');
  const e = projectDome(0, 90, 100, 100, 100);
  close(e.x, 0, 1e-9, 'E x'); close(e.y, 100, 1e-9, 'E y');
  const z = projectDome(90, 123, 100, 100, 100);
  close(z.x, 100, 1e-9, 'zenith x'); close(z.y, 100, 1e-9, 'zenith y');
});

test('dome projection: facing north puts north at the bottom and east on the right', () => {
  const n = projectDome(0, 0, 100, 100, 100, 0);
  close(n.y, 200, 1e-9, 'N y');
  const e = projectDome(0, 90, 100, 100, 100, 0);
  close(e.x, 200, 1e-9, 'E x');
});

test('local projection keeps the centre at the origin and east to the left', () => {
  const c = projectLocal(100, 20, 100, 20);
  close(c.x, 0, 1e-9, 'x'); close(c.y, 0, 1e-9, 'y');
  const e = projectLocal(101, 20, 100, 20);
  assert.ok(e.x < 0, 'higher RA (east) is to the left');
});

test('separation: pointer gap 5.4 degrees, Dubhe to Polaris about 5x that', () => {
  const gap = separation(165.932, 61.751, 165.46, 56.382);
  close(gap, 5.4, 0.1, 'pointer gap');
  close(separation(165.932, 61.751, 37.955, 89.264), 28.7, 0.3, 'Dubhe to Polaris');
  close(separation(165.932, 61.751, 37.955, 89.264) / gap, 5.3, 0.3, 'about five pointer gaps');
});

test('galactic equator passes through the galactic centre', () => {
  const pts = galacticEquator(360);
  close(pts[0].ra, 266.4, 0.1, 'GC ra');
  close(pts[0].dec, -28.94, 0.1, 'GC dec');
});
