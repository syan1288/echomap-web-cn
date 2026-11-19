import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  deleteCustomBuildingStyle,
  loadBuildingStyles,
  saveBuildingStyles,
  upsertBuildingStyle,
} from '../shared/domain/building-style/buildingStyleStore';
import {
  DEFAULT_BUILDING_STYLE,
  getBuiltinBuildingStyles,
  type BuildingStyleDefinition,
} from '../shared/domain/building-style/buildingStyle';

const BUILDING_STYLES_UPDATED_EVENT = 'echomap:building-styles:updated';

function getStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function useBuildingStyles() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [styles, setStyles] = useState<BuildingStyleDefinition[]>(() => loadBuildingStyles(getStorage(), userId));

  useEffect(() => {
    setStyles(loadBuildingStyles(getStorage(), userId));
  }, [userId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => setStyles(loadBuildingStyles(window.localStorage, userId));
    window.addEventListener(BUILDING_STYLES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(BUILDING_STYLES_UPDATED_EVENT, refresh);
  }, [userId]);

  const commit = useCallback(
    (next: BuildingStyleDefinition[]) => {
      setStyles(next);
      saveBuildingStyles(getStorage(), next, userId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(BUILDING_STYLES_UPDATED_EVENT));
      }
    },
    [userId]
  );

  const update = useCallback(
    (style: BuildingStyleDefinition) => commit(upsertBuildingStyle(styles, style)),
    [commit, styles]
  );
  const create = useCallback(
    (name: string, prompt: string) => {
      const id = `custom-${crypto.randomUUID()}`;
      const next = upsertBuildingStyle(styles, { id, name, prompt, builtin: false });
      commit(next);
      return next.find((item) => item.id === id)!;
    },
    [commit, styles]
  );
  const remove = useCallback((id: string) => commit(deleteCustomBuildingStyle(styles, id)), [commit, styles]);
  const reset = useCallback(() => commit(getBuiltinBuildingStyles()), [commit]);

  const defaultStyle = useMemo(
    () => styles.find((style) => style.id === DEFAULT_BUILDING_STYLE) ?? getBuiltinBuildingStyles()[0],
    [styles]
  );

  return { styles, defaultStyle, update, create, remove, reset };
}
