/** User-entered building names may be abbreviations, so defer place recognition to geocoders. */
export function shouldGeocodeBuildingName(name: string): boolean {
  return Array.from(name.trim()).length >= 2;
}

/** 生成多组检索串：全文 + 抽取的省市区片段，提高 Nominatim 命中率 */
export function buildGeocodeQueries(name: string): string[] {
  const q = name.trim();
  const out: string[] = [];
  const push = (x: string) => {
    const t = x.trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };

  push(q);

  const provCity = q.match(/[\u4e00-\u9fff]+(?:省|市|自治区|特别行政区)/g);
  if (provCity) provCity.forEach(push);

  const districts = q.match(/[\u4e00-\u9fff]{2,10}(?:区|县)/g);
  if (districts) districts.forEach(push);

  // 常见「XX路」「XX大道」作为补充（偏街道级）
  const roads = q.match(/[\u4e00-\u9fff]{2,12}(?:大道|路|街|巷)/g);
  if (roads) roads.slice(0, 2).forEach(push);

  // 「悉尼歌剧院」→ 补充检索「悉尼」，提高 Nominatim 命中率
  const landmarkCity = q.match(
    /^([\u4e00-\u9fff]{2,8})(?=歌剧院|大剧院|音乐厅|博物馆|美术馆|纪念馆|电视塔|车站|机场|大桥|广场|公园)/
  );
  if (landmarkCity?.[1]) push(landmarkCity[1]);

  return out.slice(0, 8);
}

