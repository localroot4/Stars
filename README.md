# Yıldızlar

A small, installable web app that teaches the night sky in Turkish: constellation names, their shapes, where they are tonight, and how to find north with the stars. Built for phones, works on tablets and desktops, runs offline after the first visit.

## Features

- **Lessons** (27): a vocabulary primer, 20 constellations, three asterisms (Winter Triangle, Summer Triangle, Milky Way) and three navigation lessons (Big Dipper to Polaris, Cassiopeia to Polaris, Orion's Belt for east and west). Each lesson: look, find, learn, test.
- **Live sky map**: a zenith-centred dome for the chosen city (or the phone's location), with a time slider, direction buttons, the Milky Way band and tap-to-name constellations.
- **Practice**: name quiz, shape quiz, find-it-on-the-sky quiz and spaced flashcards. Progress is stored on the device only.
- **PWA**: manifest, service worker, icons. Add to home screen on iOS and Android.

## Run locally

The app is static ES modules, so it needs an HTTP server (not `file://`):

```
python3 -m http.server 8080
```

Then open http://localhost:8080/.

## Deploy

Push to the default branch and enable GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root). No build step.

## Tests

```
node --test test/
```

Covers sidereal time, altitude/azimuth, the dome and local projections, angular separation and the galactic plane transform.

## Project layout

```
index.html            app shell
css/app.css           design tokens, components, responsive rules
js/app.js             state, routing, views, lesson player, quizzes, settings
js/data.js            all teaching content (Turkish), figures as HIP ids
js/sky.js             canvas renderers: live dome, lesson figure, ambient sky, confetti
js/astro.js           sky geometry (RA/Dec → Alt/Az, projections, galactic equator)
js/catalog.js         generated star catalogue (mag ≤ 5.2) and constellation lines
test/astro.test.mjs   geometry tests
sw.js, manifest.webmanifest, icons/
```

## Data and credits

Star positions and constellation lines come from [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3), derived from the HYG database (CC BY-SA). Turkish constellation names follow TÜBİTAK Bilim Çocuk usage; star names keep their international forms except Kutup Yıldızı and Akyıldız.
