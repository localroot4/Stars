// Sky geometry: RA/Dec (J2000, degrees) -> altitude/azimuth for an observer, plus the dome projection.
const DEG = Math.PI / 180;

export const norm360 = (x) => ((x % 360) + 360) % 360;

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// Greenwich mean sidereal time in degrees (Meeus, simplified; accurate to ~0.01 deg for decades around 2000).
export function gmstDeg(jd) {
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
}

export function lstDeg(date, lonDeg) {
  return norm360(gmstDeg(julianDate(date)) + lonDeg);
}

// Returns { alt, az } in degrees. az: 0 = north, 90 = east.
export function altAz(raDeg, decDeg, latDeg, lstDegrees) {
  const ha = (lstDegrees - raDeg) * DEG;
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const x = Math.cos(ha) * Math.cos(dec) * Math.sin(lat) - Math.sin(dec) * Math.cos(lat);
  const y = Math.sin(ha) * Math.cos(dec);
  const az = norm360(Math.atan2(y, x) / DEG + 180);
  return { alt: alt / DEG, az };
}

// Dome (azimuthal equidistant) projection of the whole visible sky.
// Sky charts are seen from below, so with north at the top, east is on the LEFT.
// `facingDeg` rotates the chart so that direction sits at the bottom (0 = facing north).
export function projectDome(alt, az, cx, cy, R, facingDeg = 180) {
  const r = ((90 - alt) / 90) * R;
  const a = (az - facingDeg + 180) * DEG;
  return { x: cx - r * Math.sin(a), y: cy - r * Math.cos(a) };
}

// Gnomonic projection around a centre: used to draw one constellation on its own.
export function projectLocal(raDeg, decDeg, ra0Deg, dec0Deg) {
  const ra = raDeg * DEG, dec = decDeg * DEG, ra0 = ra0Deg * DEG, dec0 = dec0Deg * DEG;
  const cosc = Math.sin(dec0) * Math.sin(dec) + Math.cos(dec0) * Math.cos(dec) * Math.cos(ra - ra0);
  const x = (Math.cos(dec) * Math.sin(ra - ra0)) / cosc;
  const y = (Math.cos(dec0) * Math.sin(dec) - Math.sin(dec0) * Math.cos(dec) * Math.cos(ra - ra0)) / cosc;
  return { x: -x / DEG, y: y / DEG }; // east is left, degrees from centre
}

// Angular separation in degrees.
export function separation(ra1, dec1, ra2, dec2) {
  const a = Math.sin(dec1 * DEG) * Math.sin(dec2 * DEG) + Math.cos(dec1 * DEG) * Math.cos(dec2 * DEG) * Math.cos((ra1 - ra2) * DEG);
  return Math.acos(Math.max(-1, Math.min(1, a))) / DEG;
}

// Galactic equator (latitude bDeg) sampled every `step` degrees of longitude -> [{ra, dec}], for the Milky Way band.
export function galacticEquator(step = 5, bDeg = 0) {
  const raP = 192.85948, decP = 27.12825 * DEG, lNode = 122.932; // J2000 galactic pole and node
  const B = bDeg * DEG;
  const pts = [];
  for (let l = 0; l < 360; l += step) {
    const lp = (l - lNode) * DEG;
    const dec = Math.asin(Math.sin(B) * Math.sin(decP) + Math.cos(B) * Math.cos(decP) * Math.cos(lp));
    const ra = norm360(raP - 180 + Math.atan2(Math.sin(lp), Math.cos(lp) * Math.sin(decP) - Math.tan(B) * Math.cos(decP)) / DEG);
    pts.push({ ra, dec: dec / DEG });
  }
  return pts;
}
