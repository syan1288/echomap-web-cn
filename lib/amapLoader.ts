declare global {
  interface Window {
    AMap?: any;
    _echoMapAmapLoading?: Promise<any>;
  }
}

export async function loadAmap(jsKey: string): Promise<any> {
  if (!jsKey) {
    throw new Error('VITE_AMAP_JS_KEY is missing');
  }

  if (window.AMap) return window.AMap;
  if (window._echoMapAmapLoading) return window._echoMapAmapLoading;

  window._echoMapAmapLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsKey)}`;
    script.async = true;
    script.onload = () => {
      if (window.AMap) resolve(window.AMap);
      else reject(new Error('AMap SDK loaded without window.AMap'));
    };
    script.onerror = () => reject(new Error('Failed to load AMap JS SDK'));
    document.head.appendChild(script);
  });

  return window._echoMapAmapLoading;
}
