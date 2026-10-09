// Floating [ MENU ] button in the top-right corner: the only UI over the full-screen view.
export interface MenuItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export function mountMenu(root: HTMLElement, title: string, items: MenuItem[]): void {
  const menu = document.createElement('nav');
  menu.className = 'menu';
  menu.innerHTML = `<button class="btn" type="button" data-ref="toggle">[ MENU ]</button><div class="menu-items"><span class="menu-title"></span></div>`;
  menu.querySelector('.menu-title')!.textContent = title;
  const list = menu.querySelector('.menu-items')!;
  for (const item of items) {
    const el = document.createElement(item.href ? 'a' : 'button');
    el.className = 'btn';
    el.textContent = `[ ${item.label} ]`;
    if (el instanceof HTMLAnchorElement) el.href = item.href!;
    else el.type = 'button';
    if (item.onClick) {
      el.addEventListener('click', () => {
        menu.classList.remove('open');
        item.onClick!();
      });
    }
    list.appendChild(el);
  }
  menu.querySelector('[data-ref="toggle"]')!.addEventListener('click', () => menu.classList.toggle('open'));
  root.appendChild(menu);
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    // Fullscreen not allowed – the page still works in the normal browser view.
  }
}
