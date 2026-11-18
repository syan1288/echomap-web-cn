/** 由经纬度粗分六大洲 + 南极，用于 Gallery 侧栏统计（与地图上建筑一一对应） */
export function continentKeyFromLatLng(lat: number, lng: number): string {
  const L = ((lng + 180) % 360) - 180;
  const phi = lat;
  if (phi < -60) return 'Antarctica';
  if (L >= -170 && L < -30 && phi > 12 && phi < 85) return 'North America';
  if (L >= -90 && L < -35 && phi <= 12 && phi > -56) return 'South America';
  if (L >= -25 && L < 40 && phi > 35 && phi < 72) return 'Europe';
  if (L >= -25 && L < 55 && phi > -38 && phi <= 35) return 'Africa';
  if (L >= 25 && L < 180 && phi > -12 && phi < 55) {
    if (L > 95 && phi < -10) return 'Oceania';
    return 'Asia';
  }
  if (L < -50 && phi > -60 && phi < 20) return 'South America';
  if (L < -110 && phi > 15) return 'North America';
  if (L >= 110 && phi < -10) return 'Oceania';
  return 'Asia';
}

