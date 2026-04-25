import { isTauri } from '@tauri-apps/api/core';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const el = target as HTMLElement;
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return false;
}

/**
 * Hardens the UI when running inside the Tauri shell: no context menu on chrome,
 * no text selection outside fields, blocked devtools / view-source shortcuts.
 * Does nothing in a normal browser (e.g. Vite-only dev) so web debugging stays usable.
 */
export function installNativeShellGuards(): void {
  if (!isTauri()) return;

  document.documentElement.classList.add('tauri-shell');

  const onContextMenu = (e: MouseEvent) => {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  };

  const onSelectStart = (e: Event) => {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  };

  const onDragStart = (e: DragEvent) => {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const ed = isEditableTarget(e.target);

    // DevTools / inspect / view source — always block
    if (e.key === 'F12') {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey && e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'i' || k === 'j' || k === 'c' || k === 'k') {
        e.preventDefault();
        return;
      }
    }
    if (e.metaKey && e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'i' || k === 'j' || k === 'c' || k === 'k') {
        e.preventDefault();
        return;
      }
    }
    if (e.metaKey && e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'i' || k === 'j' || k === 'c') {
        e.preventDefault();
        return;
      }
    }
    if (e.ctrlKey && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'u') {
        e.preventDefault();
        return;
      }
    }
    if (e.metaKey && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'u' || k === 'i') {
        e.preventDefault();
        return;
      }
    }

    // Browser chrome shortcuts (not while typing in a field)
    if (!ed && e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 's' || k === 'p' || k === 'j' || k === 'h' || k === 'o') {
        e.preventDefault();
        return;
      }
      if (k === '+' || k === '=' || k === '-' || k === '0') {
        e.preventDefault();
        return;
      }
    }
    if (!ed && e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 's' || k === 'p') {
        e.preventDefault();
        return;
      }
    }
  };

  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('selectstart', onSelectStart, true);
  document.addEventListener('dragstart', onDragStart, true);
  document.addEventListener('keydown', onKeyDown, true);
}
