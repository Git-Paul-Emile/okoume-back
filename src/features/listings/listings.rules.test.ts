import { describe, expect, it } from 'vitest';
import { approximate, boundingBox, displayedKm, distanceKm } from './listings.rules.js';

const libreville = { latitude: 0.3901, longitude: 9.4544 };
const owendo = { latitude: 0.2918, longitude: 9.5047 };

describe('proximité', () => {
  it('calcule la distance à vol d’oiseau entre deux points', () => {
    expect(distanceKm(libreville, libreville)).toBe(0);
    // Libreville centre et Owendo : un peu plus de 12 km
    expect(distanceKm(libreville, owendo)).toBeGreaterThan(12);
    expect(distanceKm(libreville, owendo)).toBeLessThan(13);
  });

  it('arrondit la position de l’acheteur à environ 1 km avant tout calcul', () => {
    expect(approximate({ latitude: 0.40123, longitude: 9.45678 })).toEqual({ latitude: 0.4, longitude: 9.46 });
    expect(approximate({ latitude: 0.40123, longitude: 9.45678 })).toEqual(
      approximate({ latitude: 0.4049, longitude: 9.4551 }),
    );
  });

  it('affiche une distance arrondie, jamais sous 1 km', () => {
    expect(displayedKm(0.2)).toBe(1);
    expect(displayedKm(3.4)).toBe(3);
    expect(displayedKm(12.6)).toBe(13);
  });

  it('le rectangle de préfiltre contient tout le cercle de recherche', () => {
    const box = boundingBox(libreville, 15);
    expect(owendo.latitude).toBeGreaterThan(box.minLat);
    expect(owendo.longitude).toBeLessThan(box.maxLng);
    expect(distanceKm(libreville, { latitude: box.maxLat, longitude: libreville.longitude })).toBeCloseTo(15, 0);
  });
});
