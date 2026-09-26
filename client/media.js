// All evidence URLs are relative to this site's root, including on GitHub Pages.
const root = new URL('./', import.meta.url);
export function assetURL(value) {
  if (!value) return '';
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return value;
  if (root.pathname !== '/' && value.startsWith(root.pathname)) return new URL(value, root.origin).href;
  return new URL(value.replace(/^\/+/, ''), root).href;
}

export function setImageSource(img, value) {
  const source = assetURL(value);
  let attempts = 0, error;
  const clear = () => { error?.remove(); error = null; img.classList.remove('image-failed'); };
  img.onload = clear;
  img.onerror = () => {
    if (!attempts++ && source && !/^(data|blob):/.test(source)) {
      const retry = new URL(source); retry.searchParams.set('image_retry', Date.now());
      img.src = retry.href; return;
    }
    if (!img.isConnected || error) return;
    img.classList.add('image-failed');
    error = document.createElement('span'); error.className = 'image-load-error'; error.setAttribute('role','status');
    error.append(document.createTextNode('图片暂未载入 '));
    const retry = document.createElement('button'); retry.textContent = '重试图片';
    retry.onclick = event => { event.stopPropagation(); clear(); attempts = 0; img.src = source; };
    const link = document.createElement('a'); link.href = source; link.target = '_blank'; link.rel = 'noopener'; link.textContent = '打开原图';
    error.append(retry, document.createTextNode(' · '), link); img.after(error);
  };
  clear(); img.src = source;
  return img;
}

export function evidenceImage(value, {className='', alt='模型输入原始 RGB', eager=false, onOpen}={}) {
  const img = document.createElement('img'); img.className = className; img.alt = alt;
  img.loading = eager ? 'eager' : 'lazy'; img.decoding = 'async';
  if (onOpen) img.onclick = () => onOpen(assetURL(value));
  return setImageSource(img, value);
}
