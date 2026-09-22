export type AccountResource = 'offers' | 'channels' | 'history';
export const DATA_CHANGED = 'aflyo:data-changed';
export function notifyDataChanged(resource: AccountResource) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: resource }));
}
